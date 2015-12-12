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
        this.queue.push(func);
        if(!this.performing && this.isConnected()) {
            this.performing = true;
            this._processQueue();
        }
    }

    _processQueue() {
        var func = this.queue.shift();
        if(!func) {
            this.performing = false;
            return;
        } else {
            try {
                func(this.driver, this._processQueue.bind(this));
            } catch(ex) {
                this.logger.error('Mongo', 'Error performing operation: ', ex);
                this.logger.error('Mongo', 'Resuming...');
                this._processQueue();
            }
        }
    }
}

module.exports = Mongo;
