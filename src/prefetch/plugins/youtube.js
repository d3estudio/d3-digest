var Plugin = require('./baseplugin'),
    request = require('request-promise');

class YouTube extends Plugin {
    init() {
        this.regex = /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    }

    canHandle(url) {
        return url.match(this.regex);
    }

    run(url) {
        var result = { type: 'youtube' },
            fields = ['title', 'html', 'thumbnail_height', 'thumbnail_width', 'thumbnail_url'];

        return request.get(`http://www.youtube.com/oembed?url=${url}`)
            .then(body => JSON.parse(body))
            .then(json => fields.forEach(k => result[k] = json[k]))
            .then(() => result);
    }
}

module.exports = YouTube;
