var settings = require('../shared/settings').sharedInstance(),
    logger = require('npmlog'),
    Redis = require('ioredis'),
    PluginLoader = require('./plugins'),
    CacheManager = require('./cachemanager'),
    EmojiDb = require('./emojidb');

/**
 * Represents the main mechanism of the Prefetch process
 */
class Pref {

    /**
     * Returns a new Prefetch mechanism
     * @return {Prefetch}   A new instance of this class
     */
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
        logger.info('Pref', 'Initialising loop...');
        this.loop();
    }

    /**
     * Main process loop. Waits until an item is available in the prefetch redis queue,
     * dequeues it, and processes it. Actually expects two operations:
     * - prefetch_item: Updates a given item cache on Memcached based on reactions and previously
     *                  created metadata. If metadata is absent, it is automatically generated
     *                  beforehand.
     * - purge_item:    Unmarks a given item as ready from the database, then generates
     *                  metadata and precaches its values for the API.
     * @return {undefined}  Nothing
     * @private
     */
    loop() {
        this.redis.blpop(settings.prefetchQueueName, 0)
            .then((data) => {
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
                        .then(() => logger.verbose('loop', `CacheManager updated document ${data.ts}`))
                        .catch((ex) => logger.error('loop', `CacheManager rejected update promise of ${data.ts}: `, ex));
                    break;
                case 'purge_item':
                    this.cacheManager.purgeDocument(data.ts)
                        .then(() => this.cacheManager.generateMetaCacheForDocument(data.ts))
                        .then(() => this.cacheManager.updateItemCacheForDocument(data.ts))
                        .then(() => logger.verbose('loop', `CacheManager rebuilt document ${data.ts}`))
                        .catch((ex) => logger.error('loop', `CacheManager rejected purge promise of ${data.ts}`, ex));
                    break;
                default:
                    logger.warn('loop', `Received invalid request type "${data.type}"`);
                    break;
                }
                this.loop();
            })
            .catch((ex) => {
                logger.error('loop', 'Error processing: ', ex);
                this.loop();
            });
    }
}

module.exports = Pref;
