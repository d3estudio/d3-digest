var Mongo = require('../shared/mongo').sharedInstance(),
    settings = require('../shared/settings').sharedInstance(),
    logger = require('npmlog'),
    Redis = require('ioredis'),
    URI = require('urijs');

/**
 * The Proc class is reponsible for receiving items from the Collector process and
 * acting accordingly, by incrementing and decrementing reaction counts, inserting,
 * updating and removing items from the database, and notifying other processes of
 * changes on these affected objects.
 */
class Proc {

    /**
     * Initialises a new instance of this class, connects to Redis server and
     * waits for information to be processed.
     * @return {Proc} A new instance of this class
     */
    constructor() {
        logger.verbose('Proc', `Connecting to Redis @ ${settings.redisUrl}...`);
        this.redis = new Redis(settings.redisUrl);
        this.procId = 0;

        // Ensure index on TS
        this.collection = Mongo.collection('items');
        this.collection.createIndex({ ts: 1 }, { unique: true });
        this.loop();
    }


    /**
     * Ensures a given function finishes and invokes a callback in order to allow
     * the next enqueued item to be processed. In case of noncompliance, the next
     * item is dequeued after the given timeout, and the function is prevented from
     * dequeuing the next item.
     * @param  {Function}   func        Function to be monitored
     * @param  {Number}     timeout     Timeout, in milliseconds, in which the function must
     *                                  finish its execution and invoke the callback.
     * @return {undefined}
     * @private
     */
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

    /**
     * Waits until there's an item to be dequeued, dequeues it and sets a guard to ensure
     * its execution does not takes longer than 30 seconds.
     * @return {undefined}
     * @private
     */
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

    /**
     * Requests a prefetch operation to the Prefetch process for a given document
     * @param  {object}     doc     Document to which the prefetch will be requested
     * @return {Promise}            A Redis Promise that will be resolved after the item is
     *                              enqueued on the Prefetch queue
     * @private
     */
    requestPrefetch(doc) {
        return this.redis.rpush(settings.prefetchQueueName, JSON.stringify({
            type: 'prefetch_item',
            ts: doc.ts
        }));
    }

    /**
     * Requests a prefetched document to have its metadata and compiled data removed from the
     * Memcached server. Please notice that this operation is attended by the Prefetch process
     * and does not only removes the item from the memcached server.
     * @param  {object}     doc     Document that will be removed from the memcached server
     * @return {Promise}            A Redis Promise that will be resolved after the item is
     *                              enqueued on the Prefetch queue.
     * @private
     */
    requestPurge(doc) {
        return this.redis.rpush(settings.prefetchQueueName, JSON.stringify({
            type: 'purge_item',
            ts: doc.ts
        }));
    }

    /**
     * Processes a given slack payload
     * @param  {object}     msg         Preprocessed Slack message coming from the Collector process
     * @param  {Function}   callback    Guard callback passed by the guardProcess function.
     * @return {undefined}
     * @private
     */
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

        case 'process_archived_message':
            // This method is a little tricky... or not. It fetches a message from the archive,
            // upserts it and updates the reactions.
            logger.verbose('Loopr', 'Processing archived message.');
            this.collection.findOne({ ts: msg.payload.ts })
                .then((doc) => {
                    if(!doc) {
                        doc = this.objectForMessage(msg.payload);
                        doc.reactions = msg.payload.reactions;
                        this.collection.insertOne(doc).then((result) => {
                            logger.verbose('Loopr', `Requesting prefetch for processed archived message: ${doc.ts}`);
                            this.requestPrefetch(result.ops[0]);
                            callback();
                        });
                    } else {
                        var newDoc = this.objectForMessage(msg.payload);
                        newDoc.date = doc.date;
                        doc = newDoc;
                        doc.reactions = msg.payload.reactions;
                        this.collection.replaceOne({ ts: msg.payload.ts }, doc, () => {
                            logger.verbose('Loopr', `Requesting purge for processed archived message: ${doc.ts}`);
                            this.requestPurge(doc);
                            callback();
                        });
                    }
                });
            break;
        }
    }

    /**
     * Normalises a received slack message to a format that can be stored in the database.
     * @param  {object}         msg     Preprocessed Slack message that will be normalised
     *                                  to the MongoDB storage
     * @return {object}                 Normalised message
     * @private
     */
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
