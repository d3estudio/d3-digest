var Plugin = require('./baseplugin'),
    request = require('request'),
    cheerio = require('cheerio');

class XKCD extends Plugin {
    init() {
        this.regex = /^(https?:\/\/)?(www\.)?xkcd\.com\/(\d+)\/?$/i;
    }

    canHandle(url) {
        return url.match(this.regex);
    }

    process(doc, callback) {
        this.logger.verbose('xkcd', `processing ${doc}`);
        request.get({
            url: doc
        }, (e, r, body) => {
            if(e) {
                callback(null);
                this.logger.error('vimeo', 'Error processing request: ', e);
                return;
            }
            var $ = cheerio.load(body),
                img = $('#comic > img').first();
            if(img.length === 1) {
                callback({
                    'type': 'xkcd',
                    'img': img.attr('src'),
                    'title': img.attr('alt'),
                    'link': doc
                });
            } else {
                this.logger.error('Empty XKCD #comic > img');
                callback(null);
            }
        });
    }
}

module.exports = XKCD;
