/*eslint no-console: 0*/
require('./header')('Lost And Found');

var settings = require('./settings').sharedInstance(),
    Mongo = require('./mongo'),
    memcached = require('./memcached').sharedInstance(),
    readline = require('readline'),
    Redis = require('ioredis'),
    logger = require('npmlog'),
    Promise = require('bluebird');

var run = function() {
    var rl = readline.createInterface(process.stdin, process.stdout);
    console.log('Fixing missing items...', rl);
    perform();
};

var perform = function() {
    var redis, collection, items, broken = [];

    logger.info('LostAndFound', `Preparing: Connecting to Redis @ ${settings.redisUrl}`);
    redis = new Redis(settings.redisUrl);
    collection = Mongo.sharedInstance().collection('items');

    logger.info('LostAndFound', 'Performing step 1/7: Obtaining database items...');
    collection
        .find({ $where: 'Object.keys(this).indexOf("ready") === -1 || this.ready' })
        .project({ ts: 1 })
        .toArray()
        .then(result => {
            if(result.length < 1) {
                logger.info('LostAndFound', 'No database items were aquired.');
                process.exit(0);
                return;
            }
            items = {};
            result.forEach(i => items[i.ts] = i);
            return result;
        })
        .then(result => result.map(i => i.ts))
        .then(result => {
            logger.info('LostAndFound', 'Performing step 2/7: Checking memcached meta state...');
            var proms = {};
            result.forEach(ts => proms[ts] = memcached.get(`#{settings.metaCachePrefix}#{ts}`));
            return Promise.props(proms);
        })
        .then(result => {
            logger.info('LostAndFound', 'Performing step 3/7: Checking memcached item state...');
            var proms = {};
            Object
                .keys(result)
                .forEach(k => {
                    if(!result[k]) {
                        broken.push(k);
                    } else {
                        proms[k] = memcached.get(`#{settings.itemCachePrefix}#{k}`);
                    }
                });
            return Promise.props(proms);
        })
        .then(result => {
            logger.info('LostAndFound', 'Performing step 4/7: Preparing items for prefetching...');
            Object
                .keys(result)
                .forEach(k => {
                    if(!result[k]) {
                        broken.push(k);
                    }
                });
            broken = Array(...new Set(broken).values());
            return broken;
        })
        .then(result => {
            if(result.length < 1) {
                logger.info('LostAndFound', 'No items to process.');
                process.exit(0);
                return Promise.reject();
            }
            logger.info('LostAndFound', 'Performing step 5/7: Updating database state...');
            collection.updateMany({ ts: { $in: result } }, { $set: { ready: false } });
        })
        .then(() => {
            logger.info('LostAndFound', 'Performing step 6/7: Purging memcached data for broken items...');
            var proms = [];
            broken.forEach(i => {
                proms.push(memcached.get(`#{settings.metaCachePrefix}#${i}`));
                proms.push(memcached.get(`#{settings.itemCachePrefix}#${i}`));
            });
            return Promise.all(proms);
        })
        .then(() => {
            logger.info('LostAndFound', 'Performing step 7/7: Enqueuing items to Prefetch process...');
            var pipe = redis.pipeline();
            broken
                .map(i => ({ type: 'prefetch_item', ts: i }))
                .map(JSON.stringify)
                .forEach(i => pipe.rpush(settings.prefetchQueueName, i));
            return pipe.exec();
        })
        .then(() => {
            logger.info('LostAndFound', 'Done.');
            process.exit(0);
        })
        .catch((ex) => {
            logger.error('LostAndFound', 'Error: ');
            logger.error('LostAndFound', ex);
            logger.warn('LostAndFound', 'System may be in an inconsistent state.');
            process.exit(1);
        });
};

Mongo.prepare()
    .then(run)
    .catch((ex) => {
        logger.error('LostAndFound', 'Error: ', ex);
        process.exit(1);
    });
