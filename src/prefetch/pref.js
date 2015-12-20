var settings = require('../shared/settings').sharedInstance(),
    logger = require('npmlog'),
    Redis = require('ioredis'),
    PluginLoader = require('./plugins'),
    CacheManager = require('./cachemanager'),
    EmojiDb = require('./emojidb');

class Pref {
    constructor() {
        logger.info('Pref', 'Trying to load plugins...');
        var pluginLoader = new PluginLoader(settings, logger),
            loadable = pluginLoader.listPlugins(),
            plugins = loadable
                .map((p) => pluginLoader.loadPlugin(p))
                .filter((p) => p)
                .sort((a, b) => a.constructor.priority - b.constructor.priority)
                .sort((a) => a.constructor.isUrlTransformer ? 0 : 1);

        logger.verbose('Pref', 'Loaded plugins: ', plugins.map(p => p.constructor.name).join(', '));

        this.redis = new Redis(settings.redisUrl);
        var pRedis = new Redis(settings.redisUrl);

        logger.info('Pref', `Using redis @ ${settings.redisUrl}`);

        pRedis.on('message', function(channel, message) {
            if(message === 'emoji_changed') {
                EmojiDb.fetchCustomEmojis(true);
            }
        });
        pRedis.subscribe(settings.notificationChannel);
        this.cacheManager = new CacheManager(plugins);

        this.loop();
    }

    loop() {
        this.redis.blpop(settings.prefetchQueueName, 0, (err, data) => {
            logger.verbose('loop', 'dequeued: ', data[1]);
            try {
                data = JSON.parse(data[1]);
            } catch(ex) {
                logger.error('loop', 'Error deserialising data: ', ex);
                this.loop();
            }
            switch(data.type) {
            case 'prefetch_item':
                this.cacheManager.updateItemCacheForDocument(data.ts)
                    .then(() => {
                        logger.verbose('loop', `CacheManager updated document ${data.ts}`);
                    })
                    .catch((ex) => {
                        logger.warn('loop', `CacheManager rejected update promise of ${data.ts}: `, ex);
                    });
                break;
            case 'purge_item':
                this.cacheManager.purgeDocument(data.ts).then(() => {
                    this.cacheManager.generateMetaCacheForDocument(data.ts)
                        .then(() => {
                            return this.cacheManager.updateItemCacheForDocument(data.ts);
                        })
                        .then(() => {
                            logger.verbose('loop', `CacheManager rebuilt document ${data.ts}`);
                        });
                }).catch(() => {
                    logger.warn('loop', `CacheManager rejected purge promise of ${data.ts}`);
                });
                break;
            default:
                logger.warn('loop', `Received invalid request type "${data.type}"`);
                break;
            }
            this.loop();
        });
    }
}

module.exports = Pref;
