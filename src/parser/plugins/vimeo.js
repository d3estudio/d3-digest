var Plugin = require('./baseplugin'),
    request = require('request');

class Vimeo extends Plugin {
    init() {
        this.regex = /^https?:\/\/vimeo\.com\/.*$/;
    }

    canHandle(url) {
        return url.match(this.regex);
    }

    process(doc, callback) {
        this.logger.verbose('vimeo', `processing ${doc}`);
        request.get({
            url: `https://vimeo.com/api/oembed.json?url=${doc}`
        }, (e, r, body) => {
            if(e) {
                this.logger.error('vimeo', 'Error processing request: ', e);
                callback(null);
            } else {
                try {
                    var json = JSON.parse(body),
                        fields = ['html', 'thumbnail_height', 'thumbnail_width', 'thumbnail_url'],
                        res = {
                            type: 'vimeo'
                        };
                    fields.forEach((f) => res[f] = json[f]);
                    callback(res);
                } catch(ex) {
                    this.logger.error('vimeo', 'Error processing response: ', ex);
                    callback(null);
                }
            }
        });
    }
}

module.exports = Vimeo;
