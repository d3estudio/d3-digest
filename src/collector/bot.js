var inflection = require('inflection'),
    settings = require('../shared/settings').sharedInstance(),
    Redis = require('ioredis'),
    logger = require('npmlog'),
    request = require('request');

/**
 * Receives and preprocesses data coming from the Slack RTM
 */
class Bot {

    /**
     * Initialises a new instance of this class, preparing connections to Redis and filtering
     * channels to be watched.
     * @param  {Slack}  slack   Instance of the Slack node client
     * @return {Bot} A new instance of this class
     */
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

        // Defines which message types must be accepted
        this.expectedMessages = ['message', 'reaction_added', 'reaction_removed', 'emoji_changed',
                                'group_joined', 'channel_joined', 'message_deleted'];

        /**
         * Messages which type is defined in this array are checked against the list of watched
         * channels by the `channelCheck` function.
         */
        this.checkedCalls = ['reaction_added', 'reaction_removed', 'message_deleted', 'message_changed', 'message'];
        slack.on('raw_message', msg => this.guard(() => this.processMessage(msg)));
    }

    /**
     * Silly guard function that wraps function calls in a try/catch block
     * @param  {Function}   func    Function to be wrapped in a try/catch block
     * @return {undefined}
     * @private
     */
    guard(func) {
        try {
            func();
        } catch(ex) {
            logger.error('guard', 'Caught excaption:');
            logger.error('guard', ex);
        }
    }

    /**
     * Checks whether a given message is coming from a watched channel
     * @param  {object}     msg     Incoming slack message to be checked
     * @return {bool}   Whether the message belongs to a watched channel or not.
     * @private
     */
    channelCheck(msg) {
        if(!msg.channel) {
            logger.warn('channelCheck', `Received empty or false-y channel ${msg.channel} for message with type ${msg.type}`, msg);
            return false;
        }
        return this.channels.indexOf(msg.channel) > -1;
    }

    /**
     * Processes an incoming slack message
     * @param  {object}     msg     Message to be processed
     * @return {undefined}
     * @private
     */
    processMessage(msg) {

        /*
         * Normalise message types. For instance, a `message_deleted` type is a subtype of
         * `message`, but the subtype information is enough for us.
         */
        if(msg.subtype) {
            msg.type = msg.subtype;
        }
        // Discard any message that is not of the expected type
        if(this.expectedMessages.indexOf(msg.type) === -1) {
            return;
        }


        if(msg.type === 'emoji_changed') {
            /*
             * When the custom emoji list is updated, we publish a notification on the predefined
             * channel, that is also listened by other processes (in this case, the `prefetch`
             * process). This will force the process to reload the custom emoji list from Slack.
             */
            this.redis.publish(settings.notificationChannel, 'emoji_changed');
        } else if(msg.type && msg.type.endsWith('_joined')) {
            /**
             * If the bot is invited to a new group or channel, and is configured to auto-watch,
             * watch it and save settings.
             */
            if(!settings.autoWatch) {
                return;
            }
            logger.info('Collector', `Yay! I've been invited to ${msg.channel.name}! Updating settings...`);
            var channels = settings.channels;
            channels.push(msg.channel.name);
            settings.channels = channels;
            if(this.channels.indexOf(msg.channel.name) === -1) {
                this.channels.push(msg.channel.name);
            }
        } else {

            // Normalise message channel to pass other filters.
            if(msg.item && msg.item.channel) {
                msg.channel = msg.item.channel;
            }

            if(!msg.channel) {
                return;
            }
            if(msg.channel.indexOf('D') === 0) {

                // This is a DM message. Let's deal with it on another function.
                this.processDirectMessage(msg);
            } else {

                // Okay, coming from a Channel or Group. We also process it from another function.
                this.processChannelOrGroupMessage(msg);
            }
        }
    }

    serializeSlackMessage(msg) {
        var serializable = {},
            fields = ['channel', 'team', 'text', 'ts', 'type', 'user', 'event_ts', 'item',
                    'reaction', 'message', 'deleted_ts'];
        /*
         * In order to serialise the message coming from Slack, we must trim some properties.
         * Here we keep only the essential information that may be useful to other processes.
         */
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

        // Silence warnings emitted by channelCheck, since Slack does not provide a channel
        // for reaction_added when item.type === 'file'
        if(serializable.item && serializable.item.type === 'file') {
            return;
        }

        if(serializable.channel && typeof(serializable.channel) === 'string') {
            serializable.channel = this.slack.getChannelGroupOrDMByID(serializable.channel).name;
        }

        return serializable;
    }

    processChannelOrGroupMessage(msg) {

        var serializable = this.serializeSlackMessage(msg);

        if(Object.keys(serializable).length > 0 && (this.checkedCalls.indexOf(serializable.type) > -1 && this.channelCheck(serializable))) {
            var serialized = JSON.stringify(serializable);
            logger.verbose('collector', `rpushing to ${settings.processQueueName}: ${serialized}`);
            // Push item to the processor queue.
            this.redis.rpush(settings.processQueueName, serialized);
        }
    }

    processDirectMessage(msg) {
        if(msg.reply_to) {
            return;
        }
        var incomingDM = this.slack.getChannelGroupOrDMByID(msg.channel),
            slackArchiveRegex = /https?:\/\/(?:[^.]+).slack.com\/archives\/([^\/]+)\/p(\d+)/,
            messageIdSplitter = /(\d+)(\d{6})/;

        if(slackArchiveRegex.test(msg.text)) {
            var archiveItems = slackArchiveRegex.exec(msg.text),
                channel = this.slack.getChannelGroupOrDMByName(archiveItems[1]),
                messageId = archiveItems[2];
            if(!channel || channel.id.indexOf('D') === 0) {
                incomingDM.send(`Hmm. I don't know a channel/group named #{archiveItems[1]} or I'm not part of it. :white_frowning_face:`);
            } else {
                incomingDM.send('An archive link, huh? Let me check it out... :thinking_face:');
                var endpoint = channel.id.indexOf('C') === 0 ? 'channels' : 'groups',
                    messageIdParts = messageIdSplitter.exec(messageId);
                messageIdParts.shift();
                var ts = messageIdParts.join('.');

                var url = `https://slack.com/api/${endpoint}.history?token=${settings.token}&channel=${channel.id}&latest=${ts}&oldest=${ts}&inclusive=1&count=1`;
                logger.verbose('collector', 'Requesting: ', url);
                request.get(url, (e, r, body) => {
                    if(!e) {
                        try {
                            var data = JSON.parse(body);
                            if(data.ok) {
                                var remoteMessage = data.messages[0];
                                if(remoteMessage) {
                                    remoteMessage.channel = channel.id;
                                    var doc = this.serializeSlackMessage(remoteMessage);
                                    doc.reactions = {};
                                    if(remoteMessage.reactions) {
                                        remoteMessage.reactions.forEach((r) => {
                                            doc.reactions[r.name] = r.count;
                                        });
                                    }
                                    var serialized = JSON.stringify({
                                        type: 'process_archived_message',
                                        payload: doc
                                    });
                                    logger.verbose('collector', `rpushing to ${settings.processQueueName}: ${serialized}`);
                                    // Push item to the processor queue.
                                    this.redis.rpush(settings.processQueueName, serialized);
                                    incomingDM.send('Looks good! Thank you! :robot_face::blue_heart:');
                                } else {
                                    logger.verbose('Loopr', `Message ${ts} couldn't be found.`);
                                    incomingDM.send('Oh! Slack said this message does not exist! Do I belong to the channel it was posted? :confounded:');
                                }
                            } else {
                                logger.verbose('Loopr', `Slack refused to hand over message ${ts}.`);
                                incomingDM.send('Looks like something is off with Slack (or they refused to hand over that message). Mind trying again later? :confounded:');
                            }
                        } catch(ex) {
                            logger.error('Loopr', `Error parsing response for message ${ts}:`, ex);
                            incomingDM.send('Erm... Slack replied with gibberish and I couldn\'t understand what they meant. Mind trying again later? :confounded:');
                        }
                    } else {
                        logger.error('Loopr', `HTTP request for message ${ts} failed:`, e);
                        incomingDM.send('Something went awry and I couldn\' talk with Slack. Mind trying again later? :confounded:');
                    }
                });
            }
        } else {
            incomingDM.send(`Hey! I can't help you with that, but I can process or reprocess archive links. :grinning:`);
        }
    }
}

module.exports = Bot;
