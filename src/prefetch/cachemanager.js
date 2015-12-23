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
            .then(() => docReactions = Object.keys(document.reactions))
            .then(reactions => Promise.all(reactions.map(EmojiDb.getEmojiUnicode.bind(EmojiDb))))
            .then(data => docReactions.map((k, i) => ({ name: k, count: document.reactions[k], repr: data[i] })))
            .then(reactions => {
                item.reactions = reactions;
                return item;
            })
            .then(item => JSON.stringify(item))
            .then(item => memcached.set(`${settings.itemCachePrefix}${doc_ts}`, item))
            .then(() => this.collection.updateOne({ ts: doc_ts }, { $set: { ready: true } }));
    }

    generateMetaCacheForDocument(doc_ts) {
        logger.verbose('generateMetaCacheForDocument', 'Running for ', doc_ts);
        return this.collection
            .find({ ts: doc_ts })
            .limit(1)
            .next()
            .then(doc => this.run(doc))
            .then(doc => JSON.stringify(doc))
            .then(doc => memcached.set(`${settings.metaCachePrefix}${doc_ts}`, doc))
            .catch(ex => {
                logger.error('generateMetaCacheForDocument', `Error invoking plugins:`, ex);
            });
    }

    purgeDocument(doc_ts) {
        return this.collection
            .updateOne({ ts: doc_ts }, { $set: { ready: false } })
            .then(() => memcached.del(`${settings.metaCachePrefix}${doc_ts}`))
            .then(() => memcached.del(`${settings.itemCachePrefix}${doc_ts}`));
    }

    run(doc) {
        var url = null;
        URI.withinString(doc.text, (u) => {
            url = url || u;
            return u;
        });
        if(!url) {
            return Promise.reject(new Error('Document does not has a valid url'));
        } else {
            doc.url = url;
            return this.runPlugins(doc);
        }
    }

    runPlugins(doc, index) {
        index = index || 0;
        var plug = this.plugins[index];
        if(!plug) {
            return Promise.reject();
        } else {
            if(plug.canHandle(doc.url)) {
                return plug.process(doc.url)
                    .then(result => {
                        if(plug.constructor.isUrlTransformer) {
                            doc.url = result;
                            return this.runPlugins(doc, ++index);
                        } else {
                            return this.addMeta(result, doc);
                        }
                    }, (ex) => {
                        logger.warn('runPlugins', `${plug.constructor.name} faulted: `, ex ? ex.message : 'No information provided.');
                        return this.runPlugins(doc, ++index);
                    });
            } else {
                return this.runPlugins(doc, ++index);
            }
        }
    }

    addMeta(result, doc) {
        var copiable = ['user', 'date', 'channel', 'reactions', 'url', '_id'];
        copiable.forEach((k) => result[k] = doc[k]);
        return result;
    }
}

module.exports = CacheManager;
