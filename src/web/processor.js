var async = require('async'),
    Path = require('path'),
    fs = require('fs');

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

    getEmojiUnicode(name) {
        var result = name;
        if(Processor.emojis) {
            var item = Processor.emojis.find((e) => e.aliases.indexOf(name) > -1);
            if(item) {
                result = item.emoji;
            } else {
                this.logger.warn('getEmojiUnicode', `Unknown emoji: ${name}`);
            }
        }
        return result;
    }

    addMeta(result, doc) {
        var copiable = ['user', 'date', 'channel'];
        var obj = doc[1];
        copiable.forEach((k) => result[k] = obj[k]);
        result.url = doc[0];
        result.id = obj._id;
        result.reactions = Object.keys(obj.reactions)
            .map(r => ({ name: r, count: obj.reactions[r], repr: this.getEmojiUnicode(r) }))
            .sort((a, b) => b.count - a.count);
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
            callback(null, this.addMeta({
                type: 'poor-link',
                url: doc[0]
            }, doc));
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
                    cached.push(JSON.parse(r));
                }
                this.getCached(processable, cached, callback);
            });
        }
    }

    process(callback) {
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
    }

    digest(result, callback) {
        var context = { users: [], items: [], itemsForUser: { } };
        result.forEach((i) => {
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
        context.items = context.items.sort((a, b) => b.totalReactions - a.totalReactions);
        callback(null, context);
    }
}

module.exports = Processor;
