var Plugin = require('./baseplugin'),
    request = require('request');

class Twitter extends Plugin {
    init() {
        this.regex = /^https?:\/\/twitter\.com\/(?:#!\/)?(\w+)\/status(es)?\/(\d+)$/;
    }

    canHandle(url) {
        return url.match(this.regex) && !!this.settings.twitterConsumerKey && !!this.settings.twitterConsumerSecret;
    }

    process(url, callback) {
        this.logger.verbose('twitter', `processing ${url}`);
        request.get({
            url: `https://api.twitter.com/1/statuses/oembed.json?url=${url}`,
            oauth: {
                consumer_key: this.settings.twitterConsumerKey,
                consumer_secret: this.settings.twitterConsumerSecret
            }
        }, (e, r, body) => {
            if(e) {
                this.logger.error('twitter', 'Error processing request: ', e);
                callback(null);
            } else {
                try {
                    callback({
                        type: 'tweet',
                        html: JSON.parse(body).html
                    });
                } catch(ex) {
                    this.logger.error('twitter', 'Error processing response: ', e);
                    callback(null);
                }
            }
        });
    }
}

module.exports = Twitter;
