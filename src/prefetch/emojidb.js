var settings = require('../shared/settings').sharedInstance(),
    MongoDb = require('../shared/mongo'),
    logger = require('npmlog'),
    fs = require('fs'),
    Path = require('path'),
    request = require('request'),
    Mongo;

/**
 * Manages Emoji representations on text and custom Slack emojis
 */
class EmojiDb {

    /**
     * Prepares the EmojiDb class for handling future requests. This method must be called
     * before using the singleton through `sharedInstance`.
     * @return {Promise}    A promise that will be resolved whenever the emoji list is loaded
     *                      and the emoji collection and aliases are ready.
     */
    static prepare() {
        Mongo = MongoDb.sharedInstance();
        try {
            EmojiDb.baseEmojis = JSON.parse(fs.readFileSync(Path.join(__dirname, 'emoji', 'db.json')));
        } catch(ex) {
            logger.error('EmojiDb', 'Error preloading emoji database: ', ex);
            return Promise.reject(ex);
        }
        EmojiDb.emojiCollection = Mongo.collection('emoji');
        EmojiDb.customEmojis = {};
        EmojiDb.instance = new EmojiDb();
        return EmojiDb.emojiCollection
            .find()
            .toArray()
            .then((docs) => {
                var emojis = {};
                docs.forEach(function(i) {
                    emojis[i.name] = i.value;
                });
                EmojiDb.extraEmoji = emojis;
                EmojiDb.normaliseEmojiAliases();
            });
    }

    /**
     * Returns the current singleton instance of this class
     * @return {EmojiDb}
     */
    static sharedInstance() {
        return EmojiDb.instance;
    }

    /**
     * Normalises the aliased emoji entries returned by Slack to their URL values
     * @return {undefined}      Nothing
     */
    static normaliseEmojiAliases() {
        logger.verbose('EmojiDb', 'NormaliseAliases: Starting...');
        var emojis = EmojiDb.extraEmoji;
        Object.keys(emojis)
            .forEach(function(k) {
                var value = emojis[k];
                if(value.indexOf('alias') === 0) {
                    value = emojis[value.split(':')[1]];
                    emojis[k] = value;
                }
            });
        logger.verbose('EmojiDb', 'NormaliseAliases: Completed.');
    }

    /**
     * Fetches the custom Emoji list from Slack and updates the database entries.
     * This method will refuse to run twice in a period of 10 minutes
     * @param  {boolean}    force   When true, ignores the 10 minutes check and executes the
     *                              process right away.
     * @return {Promise}    A promise that will be resolved whenever custom emojis are acquired
     *                      from slack and updated on the database.
     */
    static fetchCustomEmojis(force) {
        logger.verbose('EmojiDb', 'FetchCustomEmojis: Starting...');
        return new Promise((resolve) => {
            if(!force && EmojiDb.lastEmojiUpdate && Date.now() - EmojiDb.lastEmojiUpdate > 600000) {
                logger.verbose('EmojiDb', 'Table updated in less than 10 minutes. Resolving...');
                resolve();
                return;
            }
            request.get(`https://slack.com/api/emoji.list?token=${settings.token}`, (e, r, body) => {
                if(!e) {
                    try {
                        var data = JSON.parse(body);
                        if(data.ok) {
                            var emoji = data.emoji;
                            Object.keys(emoji).forEach((k) => {
                                EmojiDb.emojiCollection.findAndModify(
                                    { name: k }, /* Query */
                                    [], /* Sort */
                                    { value: emoji[k], name: k }, /* Values */
                                    { new: true, upsert: true }, /* Options */
                                    function() { } /* Noop */
                                );
                                if(!EmojiDb.extraEmoji) {
                                    EmojiDb.extraEmoji = {};
                                }
                                EmojiDb.extraEmoji[k] = emoji[k];
                            });
                            logger.verbose('EmojiDb', `FetchCustomEmojis: ${Object.keys(emoji).length} emoji(s) processed.`);
                            EmojiDb.normaliseEmojiAliases();
                            EmojiDb.lastEmojiUpdate = Date.now();
                            resolve();
                        } else {
                            logger.error('EmojiDb', 'FetchCustomEmojis: Request failed: Invalid payload.');
                            resolve();
                        }
                    } catch(ex) {
                        logger.error('EmojiDb', 'FetchCustomEmojis: Error requesting:');
                        logger.error('EmojiDb', 'FetchCustomEmojis: ', ex);
                        resolve();
                    }
                } else {
                    logger.error('EmojiDb', 'FetchCustomEmojis: Request failed:');
                    logger.error('EmojiDb', 'FetchCustomEmojis: ', e);
                    resolve();
                }
            });
        });
    }

    /**
     * Initialises a new instance of this class
     * @return {EmojiDB} A new instance of this class.
     */
    constructor() { }

    /**
     * Gets a emoji representation or HTML display code based on its name
     * @param  {string}     name        The name representing a given emoji, custom or not.
     * @param  {bool}       reentry     Used internally to control recursion.
     * @return {Promise}    A promise that will be resolved whenever an Emoji is acquired
     *                      or not. In the second case, `null` will be returned.
     */
    getEmojiUnicode(name, reentry) {
        return new Promise((resolve) => {
            if(EmojiDb.baseEmojis) {
                var item = EmojiDb.baseEmojis.find((e) => e.aliases.indexOf(name) > -1);
                if(item && item.emoji) {
                    resolve(item.emoji);
                    return;
                }
            }
            if(EmojiDb.extraEmoji) {
                var emo = EmojiDb.extraEmoji[name];
                if(!emo && !reentry) {
                    EmojiDb.fetchCustomEmojis().then(() => this.getEmojiUnicode(name, true).then(resolve));
                    return;
                } else {
                    if(emo.indexOf('http') === -1 && !reentry) {
                        this.getEmojiUnicode(emo, true).then(resolve);
                        return;
                    } else {
                        resolve(`<img src="${emo}" class="emoji" />`);
                        return;
                    }
                }
            }
            logger.warn('getEmojiUnicode', `Unknown emoji ${name}. Sources exhausted.`);
            resolve(null);
        });
    }
}

module.exports = EmojiDb;
