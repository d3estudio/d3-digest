// Marked to removal
var MongoClient = require('mongodb').MongoClient,
    settings = require('./settings').sharedInstance(),
    logger = require('npmlog');

class Mongo {
    static prepare(callback) {
        if(!Mongo.db) {
            MongoClient.connect(settings.mongoUrl, (err, db) => {
                if(err) {
                    this.logger.error('Mongo', 'Error connecting to MongoDB instance: ', err);
                    return;
                } else {
                    this.logger.verbose('Mongo', `Connected: ${settings.mongoUrl}`);
                    Mongo.db = db;
                    callback();
                }
            });
        } else {
            callback();
        }
    }
    static sharedInstance() {
        return Mongo.db;
    }
}

module.exports = Mongo;
