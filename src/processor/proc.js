var Mongo = require('../shared/mongo').sharedInstance(),
    settings = require('../shared/settings').sharedInstance(),
    logger = require('npmlog'),
    Redis = require('ioredis'),
    URI = require('urijs');

class Proc {
    constructor() {
        logger.verbose('Proc', `Connecting to Redis @ ${settings.redisUrl}...`);
        this.redis = new Redis(settings.redisUrl);
        this.procId = 0;

        // Ensure index on TS
        this.collection = Mongo.collection('items');
        this.collection.createIndex({ ts: 1 }, { unique: true });
        this.loop();
    }

    guardProcess(func, timeout) {
        var released = false,
            releaseTime = null,
            valid = true,
            id = this.procId++,
            tout;
        var invalidate = () => {
            logger.warn(`guardProcess(#${id})`, `Last procedure #${id} took longer than ${timeout}ms. Releasing loop...`);
            valid = false;
            callback();
        };
        var callback = () => {
            clearTimeout(tout);
            if(!released) {
                if(valid) {
                    logger.verbose(`guardProcess(#${id})`, 'Completed.');
                }
                released = true;
                releaseTime = Date.now();
                this.loop();
            } else {
                var now = Date.now();
                logger.warn(`guardProcess(#${id})`, `Reentry attempt after ${now - releaseTime}ms.`);
            }
        };
        tout = setTimeout(invalidate, timeout);
        logger.verbose(`guardProcess(#${id})`, 'Starting');
        func(callback);
    }

    loop() {
        this.redis.blpop(settings.processQueueName, 0, (err, data) => {
            try {
                logger.verbose('Proc', `Dequed: ${data}`);
                data = JSON.parse(data[1]);
                this.guardProcess((callback) => this.process(data, callback), 30000);
            } catch(ex) {
                logger.error('Proc', 'Error processing data: ');
                logger.error('Proc', ex);
                try {
                    this.redis.rpush(settings.errorQueueName, data);
                    logger.info('Proc', `Old received data has been pushed back to ${settings.errorQueueName}`);
                } catch(ex) {
                    logger.error('Proc', 'Error pushing data to error queue. Data was lost.');
                }
            }
        })
        .catch((ex) => {
            logger.error('Proc', 'Error caught: ');
            logger.error('Proc', ex);
        });
    }

    requestPrefetch(doc) {
        return this.redis.rpush(settings.prefetchQueueName, JSON.stringify({
            type: 'prefetch_item',
            ts: doc.ts
        }));
    }

    requestPurge(doc) {
        return this.redis.rpush(settings.prefetchQueueName, JSON.stringify({
            type: 'purge_item',
            ts: doc.ts
        }));
    }

    process(msg, callback) {
        if(!msg) {
            callback();
            return;
        }

        var matches;
        switch(msg.type) {
        case 'reaction_added':
        case 'reaction_removed':
            var delta = msg.type === 'reaction_added' ? 1 : -1,
                reaction = msg.reaction;
            if(reaction.indexOf('::') > -1) {
                reaction = reaction.split('::')[0];
            }
            logger.verbose('Proc', `Message TS ${msg.item.ts}: updating reactions index with delta ${delta}`);
            this.collection.findOne({ ts: msg.item.ts }).then((doc) => {
                if(doc) {
                    if(!doc.reactions.hasOwnProperty(reaction)) {
                        doc.reactions[reaction] = 0;
                    }
                    doc.reactions[reaction] = Math.max(0, doc.reactions[reaction] + delta);
                    if(doc.reactions[reaction] === 0) {
                        delete doc.reactions[reaction];
                    }
                    this.collection.replaceOne({ _id: doc._id }, doc, () => {
                        this.requestPrefetch(doc);
                        callback();
                    });
                } else {
                    callback();
                }
            })
            .catch((ex) => {
                logger.error('Proc', `Error processing findOne for ts ${msg.item.ts}`, ex);
                callback();
            });
            break;

        case 'message_deleted':
            this.collection.deleteMany({ ts: msg.deleted_ts }, (err, res) => {
                if(res) {
                    logger.verbose('Proc', `Message TS ${msg.deleted_ts} removed. Affected row(s): `, res.deletedCount);
                }
                callback();
            });
            break;

        case 'message_changed':
            logger.verbose('Proc', `Message TS ${msg.message.ts} was edited.`);
            matches = [];
            URI.withinString(msg.message.text, (u) => {
                matches.push(u);
                return u;
            });
            if(matches && matches.length > 0) {
                logger.verbose('Proc', `Message TS ${msg.message.ts} still is eligible.`);
                // Insert or update.
                this.collection.findOne({ ts: msg.message.ts })
                    .then((doc) => {
                        if(doc) {
                            // update.
                            if(doc.text !== msg.message.text) {
                                logger.verbose('Proc', `Message TS ${msg.message.ts} found on storage. Updating text...`);
                                doc.text = msg.message.text;
                                doc.ready = false;
                                this.collection.replaceOne({ ts: msg.message.ts }, doc, () => {
                                    this.requestPurge(doc);
                                    callback();
                                });
                            } else {
                                logger.vebose('Proc', `Message TS ${msg.message.ts} suffered metadata changes, but text is still the same. Skipping...`);
                                callback();
                            }
                        } else {
                            // insert.
                            logger.verbose('Proc', `Message TS ${msg.message.ts} not found on storage. Inserting a new one...`);
                            this.collection.insertOne(this.objectForMessage(msg)).then((result) => {
                                this.requestPrefetch(result.ops[0]);
                                callback();
                            });
                        }
                    });
            } else {
                // delete.
                logger.verbose('Proc', `Message TS ${msg.message.ts} is not eligible anymore and will be removed.`);
                this.collection.deleteMany({ ts: msg.message.ts }, {}, () => callback());
            }
            break;

        case 'message':
            if(msg.text) {
                matches = [];
                URI.withinString(msg.text, (u) => {
                    matches.push(u);
                    return u;
                });
                if(matches && matches.length > 0) {
                    this.collection.findOne({ ts: msg.ts })
                        .then((doc) => {
                            if(!doc) {
                                logger.verbose('Loopr', `Message TS ${msg.ts} is eligible and does not exist on storage. Inserting now...`);
                                this.collection.insertOne(this.objectForMessage(msg)).then((result) => {
                                    this.requestPrefetch(result.ops[0]);
                                    callback();
                                });
                            } else {
                                logger.verbose('Loopr', `Message TS ${msg.ts} is eligible and already exists on storage. Skipping...`);
                                callback();
                            }
                        });
                } else {
                    callback();
                }
            } else {
                callback();
            }
            break;
        }
    }

    objectForMessage(msg) {
        return {
            ts: msg.ts,
            text: msg.text,
            channel: msg.channel,
            reactions: {},
            date: Date.now(),
            user: msg.user,
            ready: false
        };
    }
}

module.exports = Proc;
