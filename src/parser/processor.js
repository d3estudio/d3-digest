var async = require('async');

class Processor {
    constructor(settings, logger, plugins, items) {
        this.settings = settings;
        this.logger = logger;
        this.plugins = plugins;
        this.items = items;
    }

    addMeta(result, doc) {
        var copiable = ['reactions', 'user', 'date', 'channel'];
        copiable.forEach((k) => result[k] = doc[1][k]);
        result.url = doc[0];
        result.id = doc[1]._id;
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

    process(callback) {
        async.map(this.items, this.runPlugins.bind(this), (err, result) => {
            callback(err, result);
        });
    }
}

module.exports = Processor;
