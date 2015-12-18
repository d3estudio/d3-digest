var Mongo = require('../shared/mongo').sharedInstance(),
    settings = require('../shared/settings').sharedInstance(),
    Memcached = require('memcached'),
    EmojiDb = require('./emojidb').sharedInstance(),
    URI = require('urijs'),
    logger = require('npmlog');

class CacheManager {
    constructor(plugins) {
        this.memcached = new Memcached(`${settings.memcachedHost}:${settings.memcachedPort}`);
        this.plugins = plugins;
    }

    updateItemCacheForDocument(doc_ts) {
        return new Promise((resolve, reject) => {
            Mongo.collection('items').find({ ts: doc_ts }).limit(1).next((err, doc) => {
                if(doc) {
                    this.memcached.get(`${settings.metaCachePrefix}${doc_ts}`, (err, r) => {
                        if(err) {
                            reject(err);
                        } else if(!r) {
                            this.generateMetaCacheForDocument(doc_ts).then(() => {
                                this.updateItemCacheForDocument(doc_ts).then(resolve).catch(reject);
                            }).catch(reject);
                        } else {
                            var item = JSON.parse(r);
                            var keys = Object.keys(doc.reactions);
                            Promise.all(keys.map((k) => EmojiDb.getEmojiUnicode(k)))
                                .then((data) => {
                                    return keys.map((k, i) => ({ name: k, count: doc.reactions[k], repr: data[i] }));
                                })
                                .then((reactions) => {
                                    item.reactions = reactions;
                                    return item;
                                })
                                .then((item) => {
                                    this.memcached.set(`${settings.itemCachePrefix}${doc_ts}`, JSON.stringify(item), 2592000, (err) => {
                                        if(err) {
                                            reject();
                                        } else {
                                            Mongo.collection('items').updateOne({ ts: doc_ts }, { $set: { ready: true } }, (err, r) => {
                                                if(!err) {
                                                    resolve();
                                                } else {
                                                    reject(err);
                                                }
                                            });
                                        }
                                    });
                                });
                        }
                    });
                } else {
                    reject();
                }
            });
        });
    }

    generateMetaCacheForDocument(doc_ts) {
        logger.verbose('generateMetaCacheForDocument', 'Running for ', doc_ts);
        return new Promise((resolve, reject) => {
            Mongo.collection('items').find({ ts: doc_ts }).limit(1).toArray((err, docs) => {
                if(docs && docs.length === 1) {
                    var doc = docs[0];
                    logger.verbose('generateMetaCacheForDocument', 'Acquired doc for ', doc_ts);
                    this.run(doc)
                        .then((result) => {
                            logger.verbose('generateMetaCacheForDocument', 'Got plugin result for ', doc_ts);
                            this.memcached.set(`${settings.metaCachePrefix}${doc_ts}`, JSON.stringify(result), 2592000, (err) => {
                                if(err) {
                                    logger.verbose('generateMetaCacheForDocument', 'Rejected for ', doc_ts);
                                    reject();
                                } else {
                                    logger.verbose('generateMetaCacheForDocument', 'Resolved for ', doc_ts);
                                    resolve();
                                }
                            });
                        })
                        .catch(reject);
                } else {
                    reject();
                }
            });
        });
    }

    purgeDocument(doc_ts) {
        return new Promise((resolve, reject) => {
            Mongo.collection('items').updateOne({ ts: doc_ts }, { $set: { ready: false } }, (err, r) => {
                if(!err) {
                    this.memcached.del(`${settings.metaCachePrefix}${doc_ts}`, () => {});
                    this.memcached.del(`${settings.itemCachePrefix}${doc_ts}`, () => {});
                    resolve();
                } else {
                    reject();
                }
            });
        });
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
                this.runPlugins(doc).then(resolve).catch(reject);
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
                    logger.verbose('runPlugins', 'Result for ' + plug.constructor.name, result);
                    if(!result) {
                        this.runPlugins(doc, ++index, resolve, reject, p);
                    } else {
                        if(plug.constructor.isUrlTransformer) {
                            doc.url = result;
                            this.runPlugins(doc, ++index, resolve, reject, p);
                        } else {
                            logger.verbose('runPlugins', 'Resolving');
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
