var async = require('async'),
    Path = require('path'),
    fs = require('fs'),
    request = require('request'),
    logger = require('npmlog');

class Processor {
    constructor(settings, logger, plugins, memcached, items) {
        this.settings = settings;
        this.logger = logger;
        this.plugins = plugins;
        this.items = items;
        this.memcached = memcached;
        if(!Processor.emojis) {
            try {
                Processor.emojis = JSON.parse(fs.readFileSync(Path.join(__dirname, 'emoji', 'db.json')));
            } catch(ex) {
                this.logger.error('parser', 'Error preloading emoji database. Mayhem is on its way!');
                Processor.emojis = null;
            }
        }
    }

    getEmojiUnicode(name, reentry) {
        var result = null;
        if(Processor.emojis) {
            var item = Processor.emojis.find((e) => e.aliases.indexOf(name) > -1);
            if(item) {
                result = item.emoji;
            }
        }
        if(!reentry && !result && Processor.extraEmoji) {
            var emo = Processor.extraEmoji[name];
            if(!emo && (!Processor.lastEmojiUpdate || (Date.now() - Processor.lastEmojiUpdate) > 360000)) {
                Processor.updateCustomEmojis(this.settings);
            } else {
                if(emo.indexOf('http') === -1) {
                    emo = getEmojiUnicode(emo, true);
                } else {
                    emo = `<img src="${emo}" />`;
                }
                result = emo;
            }
        }
        if(reentry && !result) {
            this.logger.warn('getEmojiUnicode', `Unknown emoji ${name}. Sources exhausted.`);
        }
        return result;
    }

    addMeta(result, doc) {
        var copiable = ['user', 'date', 'channel', 'reactions'];
        var obj = doc[1];
        copiable.forEach((k) => result[k] = obj[k]);
        result.url = doc[0];
        result.id = obj._id;
        this.memcached.set(['d-', doc[1].ts].join(''), JSON.stringify(result), 2592000, (err) => {
            if(err) {
                this.logger.error('memcached', 'Error storing cache data: ', err);
            }
        });
        return result;
    }

    runPlugins(doc, callback, index) {
        index = index || 0;
        var plug = this.plugins[index];
        if(!plug) {
            // Plugin list is over, and yet document could not be processed.
            callback(null, null);
            return;
        } else {
            if(plug.canHandle(doc[0])) {
                plug.process(doc[0], (result) => {
                    if(!result) {
                        this.runPlugins(doc, callback, ++index);
                    } else {
                        if(plug.constructor.isUrlTransformer) {
                            doc[0] = result;
                            this.runPlugins(doc, callback, ++index);
                        } else {
                            callback(null, this.addMeta(result, doc));
                        }
                    }
                });
            } else {
                this.runPlugins(doc, callback, ++index);
            }
        }
    }

    getCached(processable, cached, callback) {
        var item = this.items.shift();
        if(!item) {
            callback();
        } else {
            this.memcached.get(['d-', item[1].ts].join(''), (err, r) => {
                if(err || !r) {
                    if(err) {
                        this.logger.error('memcached', 'Error getting item from cache: ', err);
                    }
                    processable.push(item);
                } else {
                    var c = JSON.parse(r);
                    c.reactions = item[1].reactions;
                    cached.push(c);
                }
                this.getCached(processable, cached, callback);
            });
        }
    }

    static ensureEmojiCollection(then) {
        if(!Processor.extraEmoji) {
            Processor.emojiCollection.find().toArray((err, docs) => {
                var emojis = {};
                docs.forEach(function(i) {
                    emojis[i.name] = i.value;
                });
                Processor.extraEmoji = emojis;
                Processor.normaliseEmojiAliases();
                then();
            });
        } else {
            then();
        }
    }

    static normaliseEmojiAliases() {
        logger.verbose('normaliseEmojiAliases', 'Starting...');
        var emojis = Processor.extraEmoji;
        Object.keys(emojis)
            .forEach(function(k) {
                var value = emojis[k];
                if(value.indexOf('alias') === 0) {
                    value = emojis[value.split(':')[1]]
                    emojis[k] = value;
                }
            });
        logger.verbose('normaliseEmojiAliases', 'Completed.');
    }

    static updateCustomEmojis(settings) {
        logger.verbose('updateCustomEmojis', 'Updating custom emojis...');
        request.get(`https://slack.com/api/emoji.list?token=${settings.token}`, (e, r, body) => {
            if(!e) {
                try {
                    var data = JSON.parse(body);
                    if(data.ok) {
                        var emoji = data.emoji;
                        Object.keys(emoji).forEach((k) => {
                            Processor.emojiCollection.findAndModify(
                                { name: k }, /* Query */
                                [], /* Sort */
                                { value: emoji[k], name: k }, /* Values */
                                { new: true, upsert: true }, /* Options */
                                function() { } /* Noop */
                            );
                            if(!Processor.extraEmoji) {
                                Processor.extraEmoji = {};
                            }
                            Processor.extraEmoji[k] = emoji[k];
                        });
                        logger.verbose('updateCustomEmojis', `${Object.keys(emoji).length} emoji(s) processed.`);
                        Processor.normaliseEmojiAliases();
                        Processor.lastEmojiUpdate = Date.now();
                    } else {
                        logger.error('updateCustomEmojis', 'Request failed: Invalid payload.');
                    }
                } catch(ex) {
                    logger.error('updateCustomEmojis', 'Error requesting:');
                    logger.error('updateCustomEmojis', ex);
                }
            } else {
                logger.error('updateCustomEmojis', 'Request failed:');
                logger.error('updateCustomEmojis', e);
            }
        });
    }

    process(callback) {
        Processor.ensureEmojiCollection(() => {
            var processable = [],
                cached = [];
            this.getCached(processable, cached, () => {
                this.logger.verbose('processor', `Process result: ${cached.length} cached item(s), ${processable.length} processable items.`);
                async.map(processable, this.runPlugins.bind(this), (err, result) => {
                    if(err) {
                        this.logger.error('processor', 'Error running async plugns:', err);
                    }
                    result = (result || []).filter((r) => r);
                    this.digest([].concat(cached, result), callback);
                });
            });
        });
    }

    digest(result, callback) {
        var context = { users: [], items: [], itemsForUser: { } };
        result.forEach((i) => {
            i.reactions = Object.keys(i.reactions)
                .map(r => ({ name: r, count: i.reactions[r], repr: this.getEmojiUnicode(r) }))
                .sort((a, b) => b.count - a.count);

            if(!context.users.some(u => u.username === i.user.username)) {
                context.users.push(i.user);
            }
            if(!context.itemsForUser[i.user.username]) {
                context.itemsForUser[i.user.username] = [];
            }
            var totalReactions = i.reactions
                .map(r => r.count);
            if(totalReactions.length) {
                totalReactions = totalReactions.reduce((a, b) => a + b);
            } else {
                totalReactions = 0;
            }
            i.totalReactions = totalReactions;
            context.itemsForUser[i.user.username].push(i);
            context.items.push(i);
            var u = context.users.find(u => u.username === i.user.username);
            if(!u.emojis) {
                u.emojis = {};
            }
            i.reactions.forEach(r => {
                if(!u.emojis[r.name]) {
                    u.emojis[r.name] = {
                        name: r.name,
                        repr: this.getEmojiUnicode(r.name),
                        count: 0
                    };
                }
                u.emojis[r.name].count += r.count;
            });
        });
        context.users = context.users.map(u => {
            u.emojis = Object.keys(u.emojis)
                .map((k) => u.emojis[k])
                .sort((a, b) => b.count - a.count)
                .map((o) => o.repr);
            return u;
        });
        callback(null, context);
    }
}

module.exports = Processor;
