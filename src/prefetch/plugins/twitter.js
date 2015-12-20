var Plugin = require('./baseplugin'),
    request = require('request-promise'),
    logger = require('npmlog');

class Twitter extends Plugin {
    init() {
        this.regex = /^https?:\/\/twitter\.com\/(?:#!\/)?(\w+)\/status(es)?\/(\d+)$/;
    }

    canHandle(url) {
        return url.match(this.regex) && !!this.settings.twitterConsumerKey && !!this.settings.twitterConsumerSecret;
    }

    run(url) {
        logger.verbose('twitter', 'Running');
        var options = {
            url: `https://api.twitter.com/1/statuses/oembed.json?url=${url}`,
            oauth: {
                consumer_key: this.settings.twitterConsumerKey,
                consumer_secret: this.settings.twitterConsumerSecret
            }
        };
        logger.verbose('twitter', 'Returning');
        return request.get(options)
            .then(body => JSON.parse(body).html)
            .then(html => ({ type: 'tweet', html: html }));
    }
}

module.exports = Twitter;
