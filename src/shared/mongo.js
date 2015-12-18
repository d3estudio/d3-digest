// Marked to removal
var MongoClient = require('mongodb').MongoClient,
    settings = require('./settings').sharedInstance(),
    logger = require('npmlog');

class Mongo {
    static prepare() {
        return new Promise((resolve, reject) => {
            if(!Mongo.db) {
                MongoClient.connect(settings.mongoUrl, (err, db) => {
                    if(err) {
                        logger.error('Mongo', 'Error connecting to MongoDB instance: ', err);
                        reject();
                    } else {
                        logger.verbose('Mongo', `Connected: ${settings.mongoUrl}`);
                        Mongo.db = db;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
    static sharedInstance() {
        return Mongo.db;
    }
}

module.exports = Mongo;
