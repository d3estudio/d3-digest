var Mongo = require('../shared/mongo'),
    URI = require('urijs');

class Proc {
    constructor(logger, settings, redis) {
        this.logger = logger;
        this.redis = redis;
        this.settings = settings;
        this.db = new Mongo(settings.mongoUrl, logger);
        this.channels = [].concat(this.settings.channels);
        this.procId = 0;
        this.checkedCalls = ['reaction_added', 'reaction_removed', 'message_deleted', 'message_changed', 'message'];

        // Ensure index on TS
        this.db.perform((db, callback) => {
            this.collection = db.collection('items');
            db.collection('items').createIndex(
                { 'ts': 1 },
                { 'unique': true },
                function(err, results) {
                    callback();
                }
            );
            this.loop();
        });
    }

    waitForProcess(func, timeout) {
        var released = false,
            releaseTime = null,
            valid = true,
            id = this.procId++,
            timeout;
        var invalidate = () => {
            this.logger.warn(`Proc#${id}`, `Last procedure #${id} took longer than ${timeout}ms. Releasing loop...`);
            valid = false;
            callback();
        }
        var callback = () => {
            clearTimeout(timeout);
            if(!released) {
                if(valid) {
                    this.logger.verbose(`Proc#${id}`, 'Completed.');
                }
                released = true;
                releaseTime = Date.now();
                this.loop();
            } else {
                var now = Date.now();
                this.logger.warn(`Proc#${id}`, `Reentry attempt after ${now - releaseTime}ms.`);
            }
        };
        timeout = setTimeout(timeout, invalidate);
        this.logger.verbose(`Proc#${id}`, 'Starting');
        func(callback);
    }

    loop() {
        this.redis.blpop('digest_process_queue', 0, (err, data) => {
            try {
                this.logger.verbose('Proc', `Dequed: ${data}`);
                data = JSON.parse(data[1]);
                this.waitForProcess((callback) => this.process(data, callback));
            } catch(ex) {
                this.logger.error('Proc', 'Error processing data: ');
                this.logger.error('Proc', ex);
                try {
                    this.redis.rpush('digest_error_queue', JSON.stringify(data))
                    this.logger.info('Proc', 'Old received data has been pushed back to digest_error_queue.');
                } catch(ex) {
                    this.logger.error('Proc', 'Error pushing data to error queue. Data was lost.');
                }
            }
        })
        .catch((ex) => {
            this.logger.error('Proc', 'Error caught: ');
            this.logger.error('Proc', ex);
        });
    }

    channelCheck(chn) {
        if(!chn) {
            this.logger.warn('channelCheck', 'Received empty or false-y chn: ', chn);
            return false;
        }
        var exists = this.channels.indexOf(chn) > -1;
        if(!exists) {
            this.quietLoop = true;
        }
        return exists;
    }

    process(msg, callback) {
        if(!msg) {
            callback();
            return;
        }

        if(msg.subtype) {
            msg.type = msg.subtype;
        }

        if(this.checkedCalls.indexOf(msg.type) > -1 && !this.channelCheck(msg.channel)) {
            callback();
            return;
        }

        var matches;
        switch(msg.type) {
            case 'group_joined':
                if(this.settings.autoWatch) {
                    if(this.channels.indexOf(msg.channel.name) === -1) {
                        this.channels.push(msg.channel.name);
                    }
                }
                callback();
                break;

            case 'reaction_added':
            case 'reaction_removed':
                var delta = msg.type === 'reaction_added' ? 1 : -1,
                    reaction = msg.reaction;
                if(reaction.indexOf('::') > -1) {
                    reaction = reaction.split('::')[0];
                }
                this.logger.verbose('Proc', `Message TS ${msg.item.ts} updating reactions index with delta ${delta}`);
                this.collection.findOne({ ts: msg.item.ts }).then((doc) => {
                        if(doc) {
                            if(!doc.reactions.hasOwnProperty(reaction)) {
                                doc.reactions[reaction] = 0;
                            }
                            doc.reactions[reaction] = Math.max(0, doc.reactions[reaction] + delta);
                            if(doc.reactions[reaction] === 0) {
                                delete doc.reactions[reaction];
                            }
                            this.collection.replaceOne({ _id: doc._id }, doc, () => callback());
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
                this.collection.deleteMany({ ts: msg.deleted_ts }, (err, num) => {
                    if(num === 1) {
                        this.logger.verbose('Proc', `Message TS ${msg.deleted_ts} removed`);
                    }
                    callback();
                });
                break;

            case 'message_changed':
                this.logger.verbose('Proc', `Message TS ${msg.message.ts} was edited.`);
                matches = []
                URI.withinString(msg.message.text, (u) => {
                    matches.push(u);
                    return u;
                });
                if(matches && matches.length > 0) {
                    this.logger.verbose('Proc', `Message TS ${msg.message.ts} still is eligible.`);
                    // Insert or update.
                    this.collection.findOne({ ts: msg.message.ts })
                        .then((doc) => {
                            if(doc) {
                                this.logger.verbose('Proc', `Message TS ${msg.message.ts} found on storage. Updating text...`);
                                // update.
                                doc.text = msg.message.text
                                this.collection.replaceOne({ ts: msg.message.ts }, doc, () => callback());
                            } else {
                                // insert.
                                this.logger.verbose('Proc', `Message TS ${msg.message.ts} not found on storage. Inserting a new one...`);
                                this.collection.insertOne(this.objectForMessage(msg), () => callback());
                            }
                        });
                } else {
                    // delete.
                    this.logger.verbose('Proc', `Message TS ${msg.message.ts} is not eligible anymore and will be removed.`);
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
                                    this.logger.verbose('Loopr', `Message TS ${msg.ts} is eligible and does not exist on storage. Inserting now...`);
                                    this.collection.insertOne(this.objectForMessage(msg), () => callback());
                                } else {
                                    this.logger.verbose('Loopr', `Message TS ${msg.ts} is eligible and already exists on storage. Skipping...`);
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
        };
    }
}

module.exports = Proc;
