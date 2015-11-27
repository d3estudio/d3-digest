var Plugin = require('./baseplugin'),
    unfurl = require('unfurl-url');

class Unfurl extends Plugin {
    canHandle(url) {
        this.logger.verbose('unfurl', `canHandle ${url}=> yes`);
        return true;
    }

    process(url, callback) {
        unfurl.url(url, (err, res) => {
            if(!err) {
                this.logger.verbose('unfurl', `process result res: ${res}`);
                callback(res);
            } else {
                this.logger.verbose('unfurl', `process result url: ${url}`);
                callback(url);
            }
        });
    }
}

Unfurl.isUrlTransformer = true;

module.exports = Unfurl;
