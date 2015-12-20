var Plugin = require('./baseplugin'),
    unfurl = require('unfurl-url'),
    logger = require('npmlog');

class Unfurl extends Plugin {
    canHandle() {
        return true;
    }

    run(url) {
        return new Promise((resolve, reject) => {
            unfurl.url(url, (err, res) => {
                if(!err) {
                    resolve(res);
                } else {
                    reject(url);
                }
            });
        });
    }
}

Unfurl.isUrlTransformer = true;

module.exports = Unfurl;
