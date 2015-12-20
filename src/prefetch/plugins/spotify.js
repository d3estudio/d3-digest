var Plugin = require('./baseplugin'),
    request = require('request-promise');

class Spotify extends Plugin {

    init() {
        this.httpRegex = /(?:https?:\/\/)?open\.spotify\.com\/(album|track|user\/[^\/]+\/playlist)\/([a-zA-Z0-9]+)/;
        this.uriRegex = /^spotify:(album|track|user:[^:]+:playlist):([a-zA-Z0-9]+)$/;
    }

    canHandle(url) {
        return this.httpRegex.test(url) || this.uriRegex.test(url);
    }

    run(url) {
        var options = {
            url: `https://embed.spotify.com/oembed/?url=${url}`,
            headers: {'User-Agent': 'request'}
        };
        return request.get(options)
            .then(body => JSON.parse(body).html)
            .then(html => ({ type: 'spotify', html: html }));
    }
}

module.exports = Spotify;
