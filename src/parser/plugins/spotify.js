var Plugin = require('./baseplugin'),
    request = require('request');

class Spotify extends Plugin {

    init() {
        this.httpRegex = /(?:https?:\/\/)?open\.spotify\.com\/(album|track|user\/[^\/]+\/playlist)\/([a-zA-Z0-9]+)/;
        this.uriRegex = /^spotify:(album|track|user:[^:]+:playlist):([a-zA-Z0-9]+)$/;
    }

    canHandle(url) {
        return this.httpRegex.test(url) || this.uriRegex.test(url);
    }

    process(url, callback) {
        this.logger.verbose('spotify', `processing ${url}`);
        request.get({
            url: `https://embed.spotify.com/oembed/?url=${url}`,
            headers: {'User-Agent': 'request'}
        }, (e, r, body) => {
            if(e) {
                this.logger.error('spotify', 'Error processing request: ', e);
                callback(null);
            } else {
                try {
                    callback({
                        type: 'spotify',
                        html: JSON.parse(body).html
                    });
                } catch(ex) {
                    this.logger.error('spotify', 'Error parsing response: ', ex);
                    this.logger.error('spotify', `Body was: ${body}`);
                    callback(null);
                }
            }
        });
    }
}

module.exports = Spotify;
