var Processor = require('./processor');

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
                        .filter((d) => !this.settings.silencerEmojis.some((e) => d.text.indexOf(e) > -1))
                        .filter((d) => d.text.match(this.settings.messageMatcherRegex));
                    if(docs.length < 1) {
                        this.logger.verbose('parser', 'No valid documents in range.');
                        callback(null, null);
                    } else {
                        docs = docs.map((d) => {
                            var url = d.text.match(this.settings.messageMatcherRegex)[0],
                                match = slackUrlSeparator.exec(url);
                            if(match) {
                                url = match[1];
                            }
                            return [url, d];
                        });
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
