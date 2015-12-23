/*eslint no-console: 0*/
require('./header')('Flush');

var settings = require('./settings').sharedInstance(),
    Mongo = require('./mongo'),
    memcached = require('./memcached').sharedInstance(),
    readline = require('readline'),
    Redis = require('ioredis'),
    logger = require('npmlog');

var run = function() {
    var rl = readline.createInterface(process.stdin, process.stdout);
    console.log(['',
                 '',
                 ' Heads up! You are about to destroy all precached data and reset all item\'s',
                 ' database state. After cleaning up memcached and resetting the database, this',
                 ' will enqueue all items back to the Prefetch process, which may cause delays',
                 ' on new posted items. Running this operation is only recommended after',
                 ' upgrading D3 Digest to another upper version (when required!), or after',
                 ' a power failure, or catastrophic data loss on Memcached or the database.'].join('\n'));
    console.log('');
    rl.setPrompt('Do you really want to continue? (y/N) ');
    rl.prompt();
    rl.on('line', (answer) => {
        if(answer.toString().toLowerCase() === 'y') {
            logger.info('Flush', 'Performing...');
            perform();
        } else {
            logger.info('Flush', 'Aborted.');
            process.exit(0);
        }
    }).on('close', () => {
        logger.info('Flush', 'Aborted.');
        process.exit(0);
    });
};

var perform = function() {
    var redis, collection, items;

    logger.info('Flush', `Preparing: Connecting to Redis @ ${settings.redisUrl}`);
    redis = new Redis(settings.redisUrl);
    collection = Mongo.sharedInstance().collection('items');

    logger.info('Flush', 'Performing step 1/4: Obtaining database items...');
    collection
        .find({ ready: true })
        .project({ ts: 1 })
        .toArray()
        .then(arr => arr.map(i => i.ts))
        .then(result => {
            if(result.length < 1) {
                logger.info('Flush', 'No database items were aquired.');
                process.exit(0);
                return;
            }
            items = result;
            return result;
        })
        .then(result => {
            logger.info('Flush', 'Performing step 2/4: Resetting database state...');
            return collection.updateMany({ ts: { $in: result } }, { $set: { ready: false } });
        })
        .then(() => {
            logger.info('Flush', 'Performing step 3/4: Cleaning memcached state...');
            return memcached.flush();
        })
        .then(() => {
            logger.info('Flush', 'Performing step 4/4: Enqueuing items to Prefetch process...');
            var pipe = redis.pipeline();
            items
                .map(i => ({ type: 'prefetch_item', ts: i }))
                .map(JSON.stringify)
                .forEach(i => pipe.rpush(settings.prefetchQueueName, i));
            return pipe.exec();
        })
        .then(() => {
            logger.info('Flush', 'Done.');
            process.exit(0);
        })
        .catch((ex) => {
            logger.error('Flush', 'Error: ');
            logger.error('Flush', ex);
            logger.warn('Flush', 'System may be in an inconsistent state.');
            process.exit(1);
        });
};

Mongo.prepare()
    .then(run)
    .catch((ex) => {
        logger.error('Flush', 'Error: ', ex);
        process.exit(1);
    });
