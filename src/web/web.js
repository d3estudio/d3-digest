var logger = require('npmlog'),
    express = require('express'),
    Path = require('path'),
    fs = require('fs'),
    sassMiddleware = require('node-sass-middleware');

var settings = require('../shared/settings').sharedInstance(),
    Mongo = require('../shared/mongo');

var run = function() {
    logger.info('web', 'Configuring express...');
    var app = express(),
        Parser = require('./parser'),
        parser = new Parser(),
        wwwRoot = Path.join(__dirname, '..', '..', 'www'),
        isDebug = process.env['NODE_ENV'] === 'dev';

    app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.use(sassMiddleware({
        src: wwwRoot,
        outputStyle: isDebug ? 'nested' : 'compressed',
        force: isDebug,
        debug: isDebug,
        prefix: '/style'
    }));

    app.use(express.static(wwwRoot));

    app.get('/', (req, res) => {
        var index = Path.join(wwwRoot, 'index.html');
        res.send(fs.readFileSync(index), 'text/html');
    });

    var handleRequest = function(res, skipping) {
        parser.itemsInRange(skipping)
            .then((result) => {
                var response = {
                    from: skipping,
                    next: skipping + settings.outputLimit,
                    items: result
                };
                res.status(200).type('json').send(JSON.stringify(response));
            }).catch((ex) => {
                res.status(500).send(`Error\n${ex.message}\n${ex.stack}`);
            });
    };

    app.get('/api/latest', (req, res) => {
        logger.verbose('web', 'Request for api/latest');
        handleRequest(res, 0);
    });

    app.get('/api/skip/:qtt', (req, res) => {
        logger.verbose('web', `Request for api/skip/${req.params.qtt}`);
        if(isNaN(req.params.qtt)) {
            res.status(403).send('Incorrect parameters.');
            return;
        }
        handleRequest(res, parseInt(req.params.qtt));
    });

    logger.info('web', 'Starting server...');
    var server = app.listen(process.env.PORT || 2708, () => {
        var host = server.address().address,
            port = server.address().port;

        logger.info(`WeeklyDigest Web Interface listening on http://${host}:${port}`);
    });
};

logger.info('web', 'Connecting to MongoDB...');
Mongo.prepare()
    .then(run)
    .catch((ex) => logger.error('web', 'General failure: ', ex));
