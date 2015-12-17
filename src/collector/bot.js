var Datastore = require('nedb'),
    inflection = require('inflection'),
    URI = require('urijs'),
    Settings = require('../shared/settings'),
    Mongo = require('../shared/mongo');

class Bot {
    constructor(slack, logger, settings, redis) {
        this.slack = slack;
        this.logger = logger;
        this.redis = redis;
        this.settings = settings;
        this.looping = false;
        this.quietLoop = true;
        this.queue = [];
        this.channels = settings.channels.map(c => c.toLowerCase());
        this.collection = null;

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
            .on('raw_message', msg => this.guard(() => this.onRawMessage(msg)))
            .on('message', msg => this.guard(() => this.enqueue(msg)))
            .on('emoji_changed', msg => this.guard(() => this.notifyEmojiChange()));
    }

    guard(func) {
        try {
            func();
        } catch(ex) {
            this.logger.error('guard', 'Caught excaption:');
            this.logger.error('guard', ex);
        }
    }

    notifyEmojiChange() {
        this.redis.publish('digest_notifications', JSON.stringify({ type: 'emoji_changed' }));
    }

    onRawMessage(msg) {
        if(msg.type.startsWith('reaction_') || msg.type === 'group_joined') {
            this.enqueue(msg);
        }
    }

    enqueue(msg) {
        var serializable = {};
        var fields = ['channel', 'team', 'text', 'ts', 'type', 'user', 'event_ts', 'item', 'reaction', 'subtype', 'message'];
        fields.forEach((k) => {
            if(msg.hasOwnProperty(k)) {
                serializable[k] = msg[k];
            }
        });

        if(serializable.user) {
            var user = this.slack.getUserByID(serializable.user);
            serializable.user = {
                'real_name': user.real_name,
                'username': user.name,
                'image': user.profile.image_192,
                'title': user.profile.title
            };
        }

        if(!serializable.channel && serializable.item) {
            serializable.channel = serializable.item.channel;
        }

        if(serializable.channel && typeof(serializable.channel) === 'string') {
            this.logger.verbose('collector', `Trying to normalise channel: ${serializable.channel}`);
            serializable.channel = this.slack.getChannelGroupOrDMByID(serializable.channel).name;
        }

        if(Object.keys(msg).length > 0) {
            var serialized = JSON.stringify(serializable);
            this.logger.verbose('collector', `rpushing to digest_process_queue: ${serialized}`);
            this.redis.rpush('digest_process_queue', serialized);
        }

        if(serializable.type === 'group_joined' && this.settings.autoWatch) {
            this.logger.info('Collector', `Yay! I've been invited to ${msg.channel.name}! Updating settings...`);
            var channels = this.settings.channels;
            channels.push(msg.channel.name);
            this.settings.channels = channels;
            if(this.channels.indexOf(msg.channel.name) === -1) {
                this.channels.push(msg.channel.name);
            }
        }
    }
}

module.exports = Bot;
