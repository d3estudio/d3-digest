var Mongo = require('../shared/mongo').sharedInstance(),
    settings = require('../shared/settings').sharedInstance(),
    memcached = require('../shared/memcached').sharedInstance(),
    EmojiDb = require('./emojidb').sharedInstance(),
    URI = require('urijs'),
    logger = require('npmlog');

class CacheManager {
    constructor(plugins) {
        this.plugins = plugins;
        this.collection = Mongo.collection('items');
    }

    updateItemCacheForDocument(doc_ts) {
        var document, item, docReactions;
        return this.collection
            .find({ ts: doc_ts })
            .limit(1)
            .next()
            .then(doc => {
                document = doc;
                return memcached.get(`${settings.metaCachePrefix}${doc_ts}`);
            })
            .then(cache_result => (cache_result || this.generateMetaCacheForDocument(doc_ts)))
            .then(_item => item = JSON.parse(_item))
            .then(item => docReactions = Object.keys(document.reactions))
            .then(reactions => Promise.all(reactions.map(EmojiDb.getEmojiUnicode.bind(EmojiDb))))
            .then(data => docReactions.map((k, i) => ({ name: k, count: document.reactions[k], repr: data[i] })))
            .then(reactions => {
                item.reactions = reactions;
                return item;
            })
            .then(item => JSON.stringify(item))
            .then(item => memcached.set(`${settings.itemCachePrefix}${doc_ts}`, item))
            .then(json => this.collection.updateOne({ ts: doc_ts }, { $set: { ready: true } }));
    }

    generateMetaCacheForDocument(doc_ts) {
        logger.verbose('generateMetaCacheForDocument', 'Running for ', doc_ts);
        return this.collection
            .find({ ts: doc_ts })
            .limit(1)
            .next()
            .then(doc => this.run(doc))
            .then(doc => JSON.stringify(doc))
            .then(doc => this.memcached.set(`${settings.metaCachePrefix}${doc_ts}`, doc));
    }

    purgeDocument(doc_ts) {
        return this.collection
            .updateOne({ ts: doc_ts }, { $set: { ready: false } })
            .then(() => memcached.del(`${settings.metaCachePrefix}${doc_ts}`))
            .then(() => memcached.del(`${settings.itemCachePrefix}${doc_ts}`));
    }

    run(doc) {
        return new Promise((resolve, reject) => {
            var url = null;
            URI.withinString(doc.text, (u) => {
                url = url || u;
                return u;
            });
            if(!url) {
                reject();
            } else {
                doc.url = url;
                return this.runPlugins(doc);
            }
        });
    }

    runPlugins(doc, index, resolve, reject, p) {
        if(!resolve && !reject) {
            p = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
        }
        index = index || 0;
        var plug = this.plugins[index];
        if(!plug) {
            reject();
        } else {
            if(plug.canHandle(doc.url)) {
                plug.process(doc.url, (result) => {
                    if(!result) {
                        this.runPlugins(doc, ++index, resolve, reject, p);
                    } else {
                        if(plug.constructor.isUrlTransformer) {
                            doc.url = result;
                            this.runPlugins(doc, ++index, resolve, reject, p);
                        } else {
                            resolve(this.addMeta(result, doc));
                        }
                    }
                });
            } else {
                this.runPlugins(doc, ++index, resolve, reject, p);
            }
        }
        return p;
    }

    addMeta(result, doc) {
        var copiable = ['user', 'date', 'channel', 'reactions', 'url', '_id'];
        copiable.forEach((k) => result[k] = doc[k]);
        return result;
    }
}

module.exports = CacheManager;
