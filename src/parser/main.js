var moment = require('moment'),
    logger = require('npmlog'),
    Datastore = require('nedb'),
    program = require('commander'),
    fs = require('fs'),
    Path = require('path');

var Settings = require('../settings'),
    PluginLoader = require('./plugins'),
    settings = new Settings(),
    Processor = require('./processor'),
    Engine = require('./engine'),
    EngineExtensions = require('./engine_extensions');


program
    .option('-o, --output <file>', 'Where to output the result file')
    .option('-t, --template [name]', 'Which template to use. Parser looks for template files on it\'s "templates" folder (src/parser/templates). Defaults to [default]', 'default')
    .option('-v, --verbose', 'Wether to run this utility in verbose mode or not.')
    .parse(process.argv);

var db = new Datastore({ filename: Settings.storagePath(), autoload: true });
var slackUrlSeparator = /<(.*)>/;
var daysDelta = 6,
    now = Date.now(),
    past = moment(now).subtract(daysDelta, 'days').toDate().valueOf(),
    targetFile;

if(settings.loggerLevel) {
    logger.level = settings.loggerLevel;
}

if(program.verbose) {
    logger.level = 'verbose';
    logger.verbose('parser', 'Verbose mode.');
}

if(!program.output) {
    logger.error('parser', 'You must provide an output destination write the parsing result.');
    process.exit(1);
} else {
    targetFile = Path.resolve(process.cwd(), program.output);
    try {
        var stat = fs.statSync(targetFile);
        if(!stat.isFile()) {
            logger.error('parser', 'Output path is not a file.');
            process.exit(1);
        }
    } catch(ex) {
        if(ex.code === 'ENOENT') {
            // Okay!
        } else {
            logger.error('parser', 'Error checking output dir: ', ex);
            // Oh dear...
            process.exit(1);
        }
    }
}

try {
    var stat = fs.statSync(Path.join(__dirname, 'templates', `${program.template}.html`));
    if(!stat.isFile()) {
        logger.error('parser', 'Template file if not a regular file: ', program.template);
        process.exit(1);
    }
} catch(ex) {
    if(ex.code === 'ENOENT') {
        logger.error('parser', 'Template file does not exist: ', program.template);
    } else {
        logger.error('parser', 'Error checking template file: ', ex);
    }
    process.exit(1);
}

logger.info('parser', 'Trying to load plugins...');
var pluginLoader = new PluginLoader(settings, logger),
    loadable = pluginLoader.listPlugins(),
    plugins = loadable
        .map((p) => pluginLoader.loadPlugin(p))
        .filter((p) => p)
        .sort((a, b) => a.constructor.priority - b.constructor.priority)
        .sort((a) => a.constructor.isUrlTransformer ? 0 : 1);

logger.verbose('parser', 'Loaded plugins: ', plugins.map(p => p.constructor.name).join(', '));

var m_f = moment(past),
    m_t = moment(now),
    m_format = 'MMMM DD';

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
            url = match[1];
        }
        return [
            url,
            d
        ];
    });
    var processor = new Processor(settings, logger, plugins, docs);
    processor.process((err, result) => {
        var en = new Engine(),
            ex = new EngineExtensions(logger);
        ex.registerExtensionsOn(en.getEnvironment());
        var html = '';
        try {
            html = en.build(`${program.template}.html`, result);
        } catch(ex) {
            logger.error('RenderEngine', 'Failed: ', ex);
        }
        if(html.length) {
            fs.writeFileSync(targetFile, html);
            logger.info('RenderEngine', `Wrote result to ${targetFile}`);
        }
    });
});
