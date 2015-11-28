var Plugin = require('./baseplugin'),
    unfurl = require('unfurl-url');

class Unfurl extends Plugin {
    canHandle() {
        return true;
    }

    process(url, callback) {
        unfurl.url(url, (err, res) => {
            if(!err) {
                callback(res);
            } else {
                this.logger.error(`Unfurl failed for URL: ${url}: `, err);
                callback(url);
            }
        });
    }
}

Unfurl.isUrlTransformer = true;

module.exports = Unfurl;
