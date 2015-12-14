var Datastore = require('nedb'),
    inflection = require('inflection'),
    URI = require('urijs'),
    Settings = require('../shared/settings'),
    Mongo = require('../shared/mongo');

class Bot {
    constructor(slack, logger, settings) {
        this.db = new Mongo(settings.mongoUrl, logger);
        this.slack = slack;
        this.logger = logger;
        this.settings = settings;
        this.looping = false;
        this.quietLoop = true;
        this.queue = [];
        this.channels = settings.channels.map(c => c.toLowerCase());
        this.collection = null;
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
        });

        logger.info('Bot', `Connected to Slack as @${slack.self.name} on ${slack.team.name}`);
        var slackChannels = Object.keys(slack.channels)
            .map(c => slack.channels[c]);
        slackChannels = slackChannels.concat(Object.keys(slack.groups)
            .map(g => slack.groups[g])
            .map(g => {
                g.is_member = true;
                return g;
            })
        );

        var unwatchableChannels = slackChannels
            .filter(c => settings.channels.indexOf(c.name) > -1)
            .filter(c => !c.is_member)
            .map(c => c.name);
        var forgottenChannels = slackChannels
            .filter(c => c.is_member)
            .filter(c => settings.channels.indexOf(c.name) == -1)
            .map(c => c.name);
        var validChannels = settings.channels
            .filter(c => unwatchableChannels.indexOf(c) == -1 && forgottenChannels.indexOf(c) == -1);

        this.channels = validChannels;

        if(unwatchableChannels.length > 0) {
            logger.warn('Bot', `Whoa! I'm trying to watch ${inflection.inflect('', unwatchableChannels.length, 'a channel', 'channels')}${inflection.inflect('', unwatchableChannels.length, '', ' in')} which I'm not a member of: ${unwatchableChannels.join(', ')}`);
        }

        if(forgottenChannels.length > 0) {
            logger.warn('Bot', `Hey! I belong to ${inflection.inflect('an', forgottenChannels.length, null, 'some')} unwatched ${inflection.inflect('channel', forgottenChannels.length)}: ${forgottenChannels.join(', ')}`);
        }

        if(validChannels.length === 0) {
            logger.error('Bot', 'Hmm. Looks like I have nothing to watch! Nothing to do! Yay! See u later, alligator.');
            process.exit(1);
            return;
        } else {
            logger.info('Bot', `Okay, I will watch ${inflection.inflect('', validChannels.length, 'this', 'these')} ${inflection.inflect('channel', validChannels.length)}: ${validChannels.join(', ')}`);
        }

        slack
            .on('raw_message', msg => this.onRawMessage(msg))
            .on('message', msg => this.enqueue(msg));
    }

    onRawMessage(msg) {
        if(msg.type.startsWith('reaction_') || msg.type === 'group_joined') {
            this.enqueue(msg);
        }
    }

    enqueue(msg) {
        this.queue.push(msg);
        if(!this.looping) {
            this.looping = true;
            this.loop();
        }
    }

    loop() {
        if(!this.collection) {
            this.looping = false;
            return;
        }
        var msg = this.queue.shift();
        if(!msg) {
            if(!this.quietLoop) {
                this.logger.verbose('Loopr', 'Queue is empty. Pfew! Breaking loop.');
            }
            this.looping = false;
            this.quietLoop = true;
            return;
        }
        this.quietLoop = false;
        if(msg.subtype) {
            msg.type = msg.subtype;
        }

        var channelCheck = (chn) => {
            if(!chn) {
                this.logger.warn('channelCheck', 'Received empty or false-y chn: ', chn);
                return false;
            }
            var channel = this.slack.getChannelGroupOrDMByID(chn);
            var exists = this.channels.indexOf(channel.name) > -1;
            this.logger.verbose('Loopr', `Checking ${channel.name} against ${this.channels.join(', ')}...`);
            if(!exists) {
                this.quietLoop = true;
            }
            this.logger.verbose('Loopr', `Result: ${exists}`);
            return exists;
        };
        var matches;
        switch(msg.type) {
        case 'reaction_added':
        case 'reaction_removed':
            if(!channelCheck(msg.item.channel)) {
                break;
            }
            var delta = msg.type === 'reaction_added' ? 1 : -1,
                reaction = msg.reaction;
            if(reaction.indexOf('::') > -1) {
                reaction = reaction.split('::')[0];
            }
            this.logger.verbose('Loopr', `Message TS ${msg.item.ts} updating reactions index with delta ${delta}`);
            this.collection.findOne({ ts: msg.item.ts }).then((doc) => {
                    if(doc) {
                        if(!doc.reactions.hasOwnProperty(reaction)) {
                            doc.reactions[reaction] = 0;
                        }
                        doc.reactions[reaction] = Math.max(0, doc.reactions[reaction] + delta);
                        if(doc.reactions[reaction] === 0) {
                            delete doc.reactions[reaction];
                        }
                        this.collection.replaceOne({ _id: doc._id }, doc, () => this.loop());
                    } else {
                        this.loop();
                    }
                })
                .catch((ex) => {
                    logger.error('Loopr', `Error processing findOne for ts ${msg.item.ts}`, ex);
                    this.loop();
                });
            break;
        case 'message_deleted':
            if(!channelCheck(msg.channel)) {
                break;
            }
            this.collection.deleteMany({ ts: msg.deleted_ts }, (err, num) => {
                if(num === 1) {
                    this.logger.verbose('Loopr', `Message TS ${msg.deleted_ts} removed`);
                } else {
                    this.quietLoop = true;
                }
                this.loop();
            });
            break;
        case 'message_changed':
            if(!channelCheck(msg.channel)) {
                break;
            }
            this.logger.verbose('Loopr', `Message TS ${msg.message.ts} was edited.`);
            matches = []
            URI.withinString(msg.message.text, (u) => {
                matches.push(u);
                return u;
            });
            if(matches && matches.length > 0) {
                this.logger.verbose('Loopr', `Message TS ${msg.message.ts} still is eligible.`);
                // Insert or update.
                this.collection.findOne({ ts: msg.message.ts })
                    .then((doc) => {
                        if(doc) {
                            this.logger.verbose('Loopr', `Message TS ${msg.message.ts} found on storage. Updating text...`);
                            // update.
                            doc.text = msg.message.text
                            this.collection.replaceOne({ ts: msg.message.ts }, doc, () => this.loop());
                        } else {
                            // insert.
                            this.logger.verbose('Loopr', `Message TS ${msg.message.ts} not found on storage. Inserting a new one...`);
                            this.collection.insertOne(this.objectForMessage(msg), () => this.loop());
                        }
                });
            } else {
                // delete.
                this.logger.verbose('Loopr', `Message TS ${msg.message.ts} is not eligible anymore and will be removed.`);
                this.collection.deleteMany({ ts: msg.message.ts }, {}, () => this.loop());
            }
            break;
        case 'message':
            if(!channelCheck(msg.channel)) {
                break;
            }
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
                                this.collection.insertOne(this.objectForMessage(msg), () => this.loop());
                            } else {
                                this.logger.verbose('Loopr', `Message TS ${msg.ts} is eligible and already exists on storage. Skipping...`);
                                this.loop();
                            }
                    });
                } else {
                    this.quietLoop = true;
                    this.loop();
                }
            }
            break;
        case 'group_joined':
            if(this.settings.autoWatch) {
                this.logger.info('Loopr', `Yay! I've been invited to ${msg.channel.name}! Updating settings...`);
                var channels = this.settings.channels;
                channels.push(msg.channel.name);
                this.settings.channels = channels;
                if(this.channels.indexOf(msg.channel.name) === -1) {
                    this.channels.push(msg.channel.name);
                }
            }
            break;
        default:
            this.logger.warn('Loopr', `Unknown event caught: ${msg.type}. Ignoring...`);
            this.loop();
            break;
        }
    }

    objectForMessage(msg) {
        var channel = this.slack.getChannelGroupOrDMByID(msg.channel),
            user = this.slack.getUserByID(msg.user);

        var storeUser = {
            'real_name': user.real_name,
            'username': user.name,
            'image': user.profile.image_192,
            'title': user.profile.title
        };

        return {
            ts: msg.ts,
            text: msg.text,
            channel: channel.name,
            reactions: {},
            date: Date.now(),
            user: storeUser
        };
    }
}

module.exports = Bot;
