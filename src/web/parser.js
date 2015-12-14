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

    itemsInRange(present, past, callback) {
        var slackUrlSeparator = /<(.*)>/;
        this.logger.verbose('parser', `Selecting between ${past} and ${present}...`);
        this.mongo.perform((db, dbCallback) => {
            var query = {
                date: {
                    $lte: present,
                    $gte: past
                }
            };
            if(!this.settings.showLinksWithoutReaction) {
                query.$where = 'Object.keys(this.reactions).length > 0';
            }
            db.collection('items').find(query).toArray((err, docs) => {
                if(err) {
                    callback(err, null);
                } else {
                    this.logger.verbose('parser', `Acquired ${docs.length} documents`);
                    docs = docs
                        .filter((d) => {
                            var reacts = Object.keys(d.reactions);
                            return !this.settings.silencerEmojis.some((e) => reacts.indexOf(e) > -1);
                        })
                        .filter((d) => {
                            var matches = [];
                            URI.withinString(d.text, function(u) {
                                matches.push(u);
                                return u;
                            });
                            return matches.length > 0;
                        });
                    if(docs.length < 1) {
                        this.logger.verbose('parser', 'No valid documents in range.');
                        callback(null, null);
                    } else {
                        docs = docs.map((d) => {
                            var url = null;
                            URI.withinString(d.text, (u) => {
                                url = url || u;
                                return u;
                            });
                            if(!url) {
                                this.logger.verbose('parser', 'Skipping document id ' + d._id);
                                return null;
                            }
                            return [url, d];
                        })
                        .filter((d) => d);
                        this.logger.verbose('parser', `Handling ${docs.length} document(s) to processor...`);
                        var processor = new Processor(this.settings, this.logger, this.plugins, this.memcached, docs);
                        processor.process((err, result) => {
                            callback(err, result)
                        });
                    }
                }
            });
            dbCallback();
        });
    }
}

module.exports = Parser;
