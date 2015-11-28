var Plugin = require('./baseplugin'),
    request = require('request');

class YouTube extends Plugin {
    init() {
        this.regex = /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    }

    canHandle(url) {
        return url.match(this.regex);
    }

    process(url, callback) {
        this.logger.verbose('youtube', `processing ${url}`);
        request.get({
            url: `http://www.youtube.com/oembed?url=${url}`
        }, (e, r, body) => {
            if(e) {
                this.logger.error('youtube', 'Error processing request ', e);
                callback(null);
            } else {
                try {
                    var json = JSON.parse(body),
                        fields = ['html', 'thumbnail_height', 'thumbnail_width', 'thumbnail_url'],
                        res = {
                            'type': 'youtube'
                        };
                    fields.forEach((f) => res[f] = json[f]);
                    callback(res);
                } catch(ex) {
                    this.logger.error('youtube', 'Error processing response: ', ex);
                    callback(null);
                }
            }
        });
    }
}

module.exports = YouTube;
