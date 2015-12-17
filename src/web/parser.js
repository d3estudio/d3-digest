var Processor = require('./processor'),
    URI = require('urijs');

class Parser {
    constructor(logger, settings, plugins, mongo, memcached) {
        this.logger = logger;
        this.settings = settings;
        this.mongo = mongo;
        this.memcached = memcached;
        this.plugins = plugins;
    }

    static prepareDocuments(settings, docs) {
        docs = docs
            .filter((d) => !Object.keys(d.reactions).some((r) => settings.silencerEmojis.indexOf(r) > -1))
            .filter((d) => {
                var matches = [];
                URI.withinString(d.text, function(u) {
                    matches.push(u);
                    return u;
                });
                return matches.length > 0;
            });
        if(docs.length < 1) {
            return [];
        }
        return docs.map((d) => {
            var url = null;
            URI.withinString(d.text, (u) => {
                url = url || u;
                return u;
            });
            if(!url) {
                return null;
            }
            return [url, d];
        })
        .filter((d) => d);
    }

    itemsInRange(skipping, callback) {
        var slackUrlSeparator = /<(.*)>/;
        this.logger.verbose('parser', `Selecting ${this.settings.outputLimit} after ${skipping} items...`);
        this.mongo.perform((db, dbCallback) => {
            var query = {},
                opts = {
                    limit: this.settings.outputLimit,
                    sort: 'date'
                };
            if(!this.settings.showLinksWithoutReaction) {
                query.$where = 'Object.keys(this.reactions).length > 0';
            }
            if(skipping > 0) {
                opts.skip = skipping;
            }

            db.collection('items').find(query, opts).toArray((err, docs) => {
                if(err) {
                    callback(err, null);
                } else {
                    this.logger.verbose('parser', `Acquired ${docs.length} documents`);
                    docs = Parser.prepareDocuments(this.settings, docs);
                    if(docs.length < 1) {
                        this.logger.verbose('parser', 'No valid documents in range.');
                        callback(null, null);
                        return;
                    }
                    this.logger.verbose('parser', `Handling ${docs.length} document(s) to processor...`);
                    var processor = new Processor(this.settings, this.logger, this.plugins, this.memcached, docs);
                    processor.process((err, result) => {
                        callback(err, result)
                    });
                }
            });
            dbCallback();
        });
    }
}

module.exports = Parser;
