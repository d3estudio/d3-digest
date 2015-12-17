// Marked to removal
var MongoClient = require('mongodb').MongoClient;

class Mongo {
    constructor(url, logger) {
        this.driver = null;
        this.logger = logger;
        this.queue = [];
        this.performing = false;
        MongoClient.connect(url, (err, db) => {
            if(err) {
                this.logger.error('Mongo', 'Error connecting to MongoDB instance: ', err);
                return;
            }
            this.driver = db;
            this.logger.verbose('Mongo', `Connected: ${url}`);
            this._processQueue();
        });
    }

    isConnected() {
        return this.driver !== null;
    }

    perform(func) {
        if(!this.driver) {
            this.queue.push(func);
        } else {
            func(this.driver, function() {});
        }
    }

    _processQueue() {
        this.queue.forEach((func) => {
            try {
                func(this.driver, function() {});
            } catch(ex) {
                this.logger.error('Mongo', 'Error performing operation: ', ex);
            }
        });
    }
}

module.exports = Mongo;
