var _Memcached = require('memcached'),
    settings = require('./settings').sharedInstance(),
    Singleton = require('./singleton');

class Memcached {
    constructor() {
        this.instance = new _Memcached(`${settings.memcachedHost}:${settings.memcachedPort}`);
    }

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
