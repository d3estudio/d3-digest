var logger = require('npmlog'),
    express = require('express'),
    Memcached = require('memcached'),
    Path = require('path'),
    fs = require('fs'),
    moment = require('moment-timezone');

var Settings = require('../shared/settings.js'),
    settings = new Settings(),
    Mongo = require('../shared/mongo'),
    PluginLoader = require('./plugins'),
    Parser = require('./parser');

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
    parser = new Parser(logger, settings, plugins, mongo, memcached);

logger.info('web', `Using memcached @ ${memcachedUrl}`);

app.use(express.static(Path.join(__dirname, '..', '..', 'www')));

app.get('/', (req, res) => {
    var index = Path.join(__dirname, '..', '..', 'www', 'index.html');
    res.send(fs.readFileSync(index), 'text/html');
});

app.get('/api/latest', (req, res) => {
    logger.verbose('web', 'Request for api/latest');
    var rawPresent = Date.now(),
        past = moment(rawPresent).subtract(settings.outputDayRange, 'days'),
        rawPast = past.toDate().valueOf();
    parser.itemsInRange(rawPresent, rawPast, (err, result) => {
        var response = {
            from: rawPast,
            until: rawPresent,
            items: result
        };
        if(err) {
            res.status(500).send('Error');
        } else {
            res.status(200).type('json').send(JSON.stringify(response));
        }
    });
});

var server = app.listen(process.env.PORT || 2708, () => {
  var host = server.address().address,
      port = server.address().port;

  logger.info(`WeeklyDigest Web Interface listening on http://${host}:${port}`);
});
