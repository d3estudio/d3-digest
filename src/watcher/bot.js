var Datastore = require('nedb'),
    inflection = require('inflection'),
    Settings = require('../settings');

var db = new Datastore({ filename: Settings.storagePath(), autoload: true });

class Bot {
    constructor(slack, logger, settings) {
        this.slack = slack;
        this.logger = logger;
        this.settings = settings;
        this.looping = false;
        this.quietLoop = true;
        this.queue = [];
        this.channels = settings.channels.map(c => c.toLowerCase());
        db.ensureIndex({ fieldName: 'ts', unique: true}, function(err) { });

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
        if(!!msg.subtype) {
            msg.type = msg.subtype;
        }

        var channelCheck = (chn) => {
            var channel = this.slack.getChannelGroupOrDMByID(chn);
            var exists = this.channels.indexOf(channel.name) > -1;
            this.logger.verbose('Loopr', `Checking ${channel.name} against ${this.channels.join(', ')}...`);
            if(!exists) {
                this.quietLoop = true;
            }
            this.logger.verbose('Loopr', `Result: ${exists}`);
            return exists;
        };

        switch(msg.type) {
            case 'reaction_added':
            case 'reaction_removed':
                if(!channelCheck(msg.item.channel)) {
                    break;
                }
                var delta = msg.type === 'reaction_added' ? 1 : -1,
                    reaction = msg.reaction;
                this.logger.verbose('Loopr', `Message TS ${msg.item.ts} updating reactions index with delta ${delta}`);
                db.find({ ts: msg.item.ts }, (err, docs) => {
                    if(docs && docs.length === 1) {
                        var d = docs[0];
                        if(!d.reactions.hasOwnProperty(reaction)) {
                            d.reactions[reaction] = 0;
                        }
                        d.reactions[reaction] = Math.max(0, d.reactions[reaction] + delta);
                        if(d.reactions[reaction] === 0) {
                            delete d.reactions[reaction]
                        }
                        db.update({ ts: d.ts }, d, {}, () => this.loop());
                    } else {
                        this.loop();
                    }
                });
                break;
            case 'message_deleted':
                if(!channelCheck(msg.channel)) {
                    break;
                }
                db.remove({ ts: msg.deleted_ts }, {}, (err, num) => {
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
                var matches = msg.message.text.match(this.settings.messageMatcherRegex);
                if(matches && matches.length > 0) {
                    this.logger.verbose('Loopr', `Message TS ${msg.message.ts} still is eligible.`);
                    // Insert or update.
                    db.find({ ts: msg.message.ts }, (err, docs) => {
                        if(!!docs && docs.length == 1) {
                            this.logger.verbose('Loopr', `Message TS ${msg.message.ts} found on storage. Updating text...`);
                            // update.
                            db.update({ ts: msg.message.ts }, { text: msg.message.text }, {}, _ => this.loop());
                        } else {
                            // insert.
                            this.logger.verbose('Loopr', `Message TS ${msg.message.ts} not found on storage. Inserting a new one...`);
                            var channel = this.slack.getChannelGroupOrDMByID(msg.channel);
                            db.insert({ ts: msg.message.ts, text: msg.message.text, channel: channel.name, reactions: {}, date: Date.now() }, _ => this.loop());
                        }
                    });
                } else {
                    // delete.
                    this.logger.verbose('Loopr', `Message TS ${msg.message.ts} is not eligible anymore and will be removed.`);
                    db.remove({ ts: msg.message.ts }, {}, _ => this.loop());
                }
                break;
            case 'message':
                if(!channelCheck(msg.channel)) {
                    break;
                }
                if(msg.text) {
                    var matches = msg.text.match(this.settings.messageMatcherRegex);
                    if(matches && matches.length > 0) {
                        db.find({ ts: msg.ts }, (err, docs) => {
                            if(!!docs && docs.length < 1) {
                                this.logger.verbose('Loopr', `Message TS ${msg.ts} is eligible and does not exist on storage. Inserting now...`);
                                var channel = this.slack.getChannelGroupOrDMByID(msg.channel);
                                db.insert({ ts: msg.ts, text: msg.text, channel: channel.name, reactions: {}, date: Date.now() }, _ => this.loop());
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
}

module.exports = Bot;
