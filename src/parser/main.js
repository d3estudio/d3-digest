var moment = require('moment'),
    logger = require('npmlog'),
    Datastore = require('nedb'),
    async = require('async');

var Settings = require('../settings'),
    PluginLoader = require('./plugins'),
    settings = new Settings();

var db = new Datastore({ filename: Settings.storagePath(), autoload: true });
var slackUrlSeparator = /<(.*)>/;
var daysDelta = 6,
    now = Date.now(),
    past = moment(now).subtract(daysDelta, 'days').toDate().valueOf();

if(settings.loggerLevel) {
    logger.level = settings.loggerLevel;
}

logger.info('parser', 'Trying to load plugins...');
var pluginLoader = new PluginLoader(settings, logger),
    loadable = pluginLoader.listPlugins(),
    plugins = loadable
        .map((p) => pluginLoader.loadPlugin(p))
        .filter((p) => p)
        .sort((a) => a.isUrlTransformer ? 0 : 1);

var m_f = moment(past),
    m_t = moment(now),
    m_format = 'MMMM DD'
logger.info('parser', `Querying data store for messages between ${m_f.format(m_format)} and ${m_t.format(m_format)}`);

db.find({ date: { $lte: now, $gte: past } }, function(error, docs) {
    if(!!error) {
        logger.error('parser', 'Error querying datastore: ', error);
        process.exit(1);
    }
    logger.info('parser', `Acquired ${docs.length} document(s)`);
    logger.verbose('parser', 'Filtering results using silencer reactions...');
    docs = docs.filter((d) => !settings.silencerEmojis.some((e) => d.text.indexOf(e) > -1));
    logger.info('parser', 'Ensuring documents are sane...');
    docs = docs.filter((d) => d.text.match(settings.messageMatcherRegex));
    logger.info('parser', `Result: ${docs.length} document(s)`);
    if(docs.length < 1) {
        logger.info('parser', 'Nothing to do.');
        process.exit(1);
    }
    docs = docs.map((d) => {
        var url = d.text.match(settings.messageMatcherRegex)[0],
            match = slackUrlSeparator.exec(url);
        if(match) {
            url = match[1]
        }
        return [
            url,
            d
        ];
    });
    console.dir(docs);
    async.map(docs, runPlugins, function(err, result) {
        console.dir(result);
    });
});

var runPlugins = function(doc, callback, index) {
    index = index || 0;
    var plug = plugins[index];
    if(!plug) {
        logger.verbose('runPlugins', `plugin at index ${index} is not valid.`);
        callback(null, doc);
        return;
    } else {
        if(plug.canHandle(doc[0])) {
            plug.process(doc[0], function(result) {
                if(!result) {
                    runPlugins(doc, callback, ++index);
                } else {
                    if(plug.constructor.isUrlTransformer) {
                        logger.verbose('runPlugins', `${plug} isUrlTransformer -> ${plug.constructor.isUrlTransformer}`)
                        doc[0] = result;
                        runPlugins(doc, callback, ++index);
                    } else {
                        doc.result = result;
                        callback(null, doc);
                    }
                }
            });
        } else {
            runPlugins(doc, callback, ++index);
        }
    }
}
