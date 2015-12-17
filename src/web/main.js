var logger = require('npmlog'),
    express = require('express'),
    Memcached = require('memcached'),
    Path = require('path'),
    fs = require('fs'),
    moment = require('moment-timezone'),
    Redis = require('ioredis');

var Settings = require('../shared/settings.js'),
    settings = new Settings(),
    Mongo = require('../shared/mongo'),
    PluginLoader = require('./plugins'),
    Parser = require('./parser'),
    Processor = require('./processor');

if(settings.loggerLevel) {
    logger.level = settings.loggerLevel;
}

logger.info('web', 'Trying to load plugins...');
var pluginLoader = new PluginLoader(settings, logger),
    loadable = pluginLoader.listPlugins(),
    plugins = loadable
        .map((p) => pluginLoader.loadPlugin(p))
        .filter((p) => p)
        .sort((a, b) => a.constructor.priority - b.constructor.priority)
        .sort((a) => a.constructor.isUrlTransformer ? 0 : 1);

logger.verbose('web', 'Loaded plugins: ', plugins.map(p => p.constructor.name).join(', '));

var memcachedUrl = `${settings.memcachedHost}:${settings.memcachedPort}`,
    memcached = new Memcached(memcachedUrl),
    mongo = new Mongo(settings.mongoUrl, logger),
    app = express(),
    parser = new Parser(logger, settings, plugins, mongo, memcached),
    redis = new Redis(settings.redisUrl);

logger.info('web', `Using memcached @ ${memcachedUrl}`);
logger.info('web', `Using redis @ ${settings.redisUrl}`);

app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.static(Path.join(__dirname, '..', '..', 'www')));

app.get('/', (req, res) => {
    var index = Path.join(__dirname, '..', '..', 'www', 'index.html');
    res.send(fs.readFileSync(index), 'text/html');
});

var handleRequest = function(res, skipping) {
    parser.itemsInRange(skipping, (err, result) => {
        var response = {
            from: skipping,
            next: skipping + settings.outputLimit + 1,
            items: result
        };
        if(err) {
            res.status(500).send('Error');
        } else {
            res.status(200).type('json').send(JSON.stringify(response));
        }
    });
}

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

redis.subscribe('digest_notifications');
redis.on('message', function (channel, message) {
    try {
        message = JSON.parse(message);
    } catch(ex) {
        logger.error('digestNotificationResponder', `Error: ${ex.message}`);
        return;
    }

    if(message.type === 'emoji_changed') {
        Processor.updateCustomEmojis(settings);
    } else if(message.type === 'precache_item') {
        mongo.perform((db, cb) => {
            logger.verbose('digestNotificationResponder', `Trying to prefetch item with ts ${message.ts}`);
            db.collection('items').findOne({ ts: message.ts }).then((doc) => {
                if(doc) {
                    logger.verbose('digestNotificationResponder', 'Handling to Processor');
                    try {
                        var docs = Parser.prepareDocuments(settings, [doc]);
                        if(docs.length === 1) {
                            var p = new Processor(settings, logger, plugins, memcached, docs);
                            p.process(function() {
                                logger.verbose('digestNotificationResponder', `Prefetch for ${message.ts} completed.`);
                            });
                        }
                    } catch(ex) {
                        logger.error('digestNotificationResponder', 'Message fake processing failed:');
                        logger.error('digestNotificationResponder', ex);
                    }
                }
            });
            cb();
        });
    }
});

var server;

mongo.perform((db, cb) => {
    Processor.emojiCollection = db.collection('emoji');
    cb();
    server = app.listen(process.env.PORT || 2708, () => {
        var host = server.address().address,
        port = server.address().port;

        logger.info(`WeeklyDigest Web Interface listening on http://${host}:${port}`);
    });
});
