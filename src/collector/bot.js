var Datastore = require('nedb'),
    inflection = require('inflection'),
    URI = require('urijs'),
    settings = require('../shared/settings').sharedInstance(),
    Mongo = require('../shared/mongo'),
    Redis = require('ioredis'),
    logger = require('npmlog');

class Bot {
    constructor(slack) {
        this.slack = slack;
        this.redis = new Redis(settings.redisUrl);
        this.channels = settings.channels.map(c => c.toLowerCase());

        logger.info('Bot', `Connected to Redis @ ${settings.redisUrl}`);
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
            logger.error('Bot', 'Hmm. Looks like I have nothing to watch! Nothing to do! Yay! See you later, alligator.');
            process.exit(1);
            return;
        } else {
            logger.info('Bot', `Okay, I will watch ${inflection.inflect('', validChannels.length, 'this', 'these')} ${inflection.inflect('channel', validChannels.length)}: ${validChannels.join(', ')}`);
        }

        this.expectedMessages = ['message', 'reaction_added', 'reaction_removed', 'emoji_changed',
                                'group_joined', 'message_deleted'];
        this.checkedCalls = ['reaction_added', 'reaction_removed', 'message_deleted', 'message_changed', 'message'];
        slack.on('raw_message', msg => this.guard(() => this.processMessage(msg)));
    }

    guard(func) {
        try {
            func();
        } catch(ex) {
            logger.error('guard', 'Caught excaption:');
            logger.error('guard', ex);
        }
    }

    channelCheck(chn) {
        if(!chn) {
            logger.warn('channelCheck', 'Received empty or false-y chn: ', chn);
            return false;
        }
        return this.channels.indexOf(chn) > -1;
    }

    processMessage(msg) {
        if(msg.subtype) {
            msg.type = msg.subtype;
        }
        if(this.expectedMessages.indexOf(msg.type) === -1) {
            logger.verbose('collector', 'Skipping message with type: ', msg.type);
            return;
        }
        if(msg.type === 'emoji_changed') {
            this.redis.publish(settings.notificationChannel, JSON.stringify({ type: 'emoji_changed '}));
        } else if(msg.type === 'group_joined') {
            if(!settings.autoWatch) {
                return;
            }
            logger.info('Collector', `Yay! I've been invited to ${msg.channel.name}! Updating settings...`);
            var channels = this.settings.channels;
            channels.push(msg.channel.name);
            this.settings.channels = channels;
            if(this.channels.indexOf(msg.channel.name) === -1) {
                this.channels.push(msg.channel.name);
            }
        } else {
            var serializable = {},
                fields = ['channel', 'team', 'text', 'ts', 'type', 'user', 'event_ts', 'item',
                        'reaction', 'message', 'deleted_ts'];

            fields.forEach((k) => {
                if(msg.hasOwnProperty(k)) {
                    serializable[k] = msg[k];
                }
            });

            if(serializable.user) {
                var user = this.slack.getUserByID(serializable.user);
                serializable.user = {
                    real_name: user.real_name,
                    username:  user.name,
                    image:     user.profile.image_192,
                    title:     user.profile.title
                };
            }

            if(!serializable.channel && serializable.item) {
                serializable.channel = serializable.item.channel;
            }

            if(serializable.channel && typeof(serializable.channel) === 'string') {
                serializable.channel = this.slack.getChannelGroupOrDMByID(serializable.channel).name;
            }

            if(Object.keys(serializable).length > 0 && (this.checkedCalls.indexOf(serializable.type) > -1 && this.channelCheck(serializable.channel))) {
                var serialized = JSON.stringify(serializable);
                logger.verbose('collector', `rpushing to ${settings.queueName}: ${serialized}`);
                this.redis.rpush(settings.queueName, serialized);
            }
        }
    }
}

module.exports = Bot;
