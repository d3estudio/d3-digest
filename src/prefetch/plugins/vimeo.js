var Plugin = require('./baseplugin'),
    request = require('request-promise');

class Vimeo extends Plugin {
    init() {
        this.regex = /^https?:\/\/vimeo\.com\/.*$/;
    }

    canHandle(url) {
        return url.match(this.regex);
    }

    run(url) {
        var result = { type: 'vimeo' },
            fields = ['description', 'title', 'html', 'thumbnail_height', 'thumbnail_width', 'thumbnail_url'];

        return request.get(`https://vimeo.com/api/oembed.json?url=${url}`)
            .then(body => JSON.parse(body))
            .then(json => fields.forEach(k => result[k] = json[k]))
            .then(() => result);
    }
}

module.exports = Vimeo;
