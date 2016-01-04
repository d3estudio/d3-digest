var Mongo = require('../shared/mongo').sharedInstance(),
    settings = require('../shared/settings').sharedInstance(),
    memcached = require('../shared/memcached').sharedInstance(),
    EmojiDb = require('./emojidb').sharedInstance(),
    URI = require('urijs'),
    logger = require('npmlog');

/**
 * Manages data stored on Memcached and updates item metadata on db.
 */
class CacheManager {

    /**
     * Initialises a new CacheManager instance with a set of plugins
     * @param  {Array}  plugins     List of plugins to be used when processing new items
     * @return {CacheManager}   A new instance of this class
     */
    constructor(plugins) {
        this.plugins = plugins;
        this.collection = Mongo.collection('items');
    }

    /**
     * Updates an cached item based on stored data.
     * This method relies on precached metadata. When absent, this metadata will be
     * generated.
     * @param  {String}     doc_ts  The ts field of the item that should be updated
     * @return {Promise}    A promise that will be resolved whenever the update opreation
     *                      is completed.
     */
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

    /**
     * Generates and caches metadata for a given document, after processing its contents
     * through the provided plugin list.
     * @param  {String}     doc_ts      The ts field of the item that should have its metadata
     *                                  generated.
     * @return {Promise}    A promise that will be resolved whenever the metadata for the given
     *                      item is generated.
     */
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

    /**
     * Resets the 'ready' state of a document with a given `ts` to `false`, and removes cached
     * metadata and item information from Memcached
     * @param  {string}     doc_ts      The ts field of the item that should be purged.
     * @return {Promise}    A promise that will be resolved whenever the item status has changed
     *                      and its cached entries removed.
     */
    purgeDocument(doc_ts) {
        return this.collection
            .updateOne({ ts: doc_ts }, { $set: { ready: false } })
            .then(() => memcached.del(`${settings.metaCachePrefix}${doc_ts}`))
            .then(() => memcached.del(`${settings.itemCachePrefix}${doc_ts}`));
    }

    /**
     * Runs the provided plugin list against a given document.
     * @param  {object}     doc     The document that should be processed by the process list.
     * @return {Promise}    A promise that will be resolved whenever a plugin matches the
     *                      provided document's content.
     * @private
     */
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

    /**
     * Runs a plugin agains the provided document.
     * @param  {object}     doc         The document to be processed.
     * @param  {number}     index       The index of the plugin to be used. This parameter is used
     *                                  internally.
     * @return {Promise}    A promise that will be reject as soon as the plugin in the given
     *                      index finishes processing
     * @private
     */
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
                        if(ex) {
                            logger.error('runPlugins', `${plug.constructor.name} error:`, ex);
                        }
                        return this.runPlugins(doc, ++index);
                    });
            } else {
                return this.runPlugins(doc, ++index);
            }
        }
    }

    /**
     * Copies a set of properties from the `doc` parameter to `result` parameter,
     * returning the second one with the new properties.
     * @param   {object}    result      Item to which a set of properties will be copied to.
     * @param   {object}    doc         Item in which a set of properties will be copied from.
     * @return  {object}    The resulting object with a set of properties taken from `doc`.
     * @private
     */
    addMeta(result, doc) {
        var copiable = ['user', 'date', 'channel', 'reactions', 'url', '_id'];
        copiable.forEach((k) => result[k] = doc[k]);
        return result;
    }
}

module.exports = CacheManager;
