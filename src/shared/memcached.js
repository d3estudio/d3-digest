var _Memcached = require('memcached'),
    settings = require('./settings').sharedInstance(),
    Singleton = require('./singleton');

/**
 * Wraps a Memcached instance in order to provide promisified and overloaded
 * methods
 */
class Memcached {
    /**
     * Initialises a new connection to the Memcached server defined by the application
     * settings.
     * @return {Memcached} A new instance of this class
     */
    constructor() {
        this.instance = new _Memcached(`${settings.memcachedHost}:${settings.memcachedPort}`);
    }

    /**
     * Gets the value for a given key.
     * @param  {String}     key     Key name to be retrieved from the Memcached server
     * @return {Promise}            Promise that will be resolved after getting the value
     *                              for the given key. If key is undefined, `undefined` will
     *                              be passed to the promise resolver.
     */
    get(key) {
        return new Promise((resolve, reject) => {
            this.instance.get(key, (err, d) => {
                if(err) {
                    reject(err);
                } else {
                    resolve(d);
                }
            });
        });
    }

    /**
     * Creates or updates a given key on the Memcached server
     * @param {String}  key     Key to identify this value on the memcached server
     * @param {String}  value   Value for the provided key
     * @return {Promise}        Promise that will be resolved after the value is set on the
     *                          server. The value passed to the resolver is the same value.
     */
    set(key, value) {
        return new Promise((resolve, reject) => {
            this.instance.set(key, value, 2592000, (err) => {
                if(err) {
                    reject(err);
                } else {
                    resolve(value);
                }
            });
        });
    }

    /**
     * Flushes all the data from the memcached server
     * @return {Promise}    A promise that will be resolved after the operation is completed.
     */
    flush() {
        return new Promise((resolve, reject) => {
            this.instance.flush((err) => {
                if(err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Deletes a given key from the memcached server
     * @param  {String}     key     Key to be deleted from the server.
     * @return {Promise}            A promise that will be resolved after the key is
     *                              removed from the server.
     */
    del(key) {
        return new Promise((resolve, reject) => {
            this.instance.del(key, (err) => {
                if(err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = new Singleton(Memcached);
