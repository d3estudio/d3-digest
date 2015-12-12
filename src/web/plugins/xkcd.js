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

    process(url, callback) {
        this.logger.verbose('xkcd', `processing ${url}`);
        request.get({
            url: url
        }, (e, r, body) => {
            if(e) {
                callback(null);
                this.logger.error('xkcd', 'Error processing request: ', e);
                return;
            }
            var $ = cheerio.load(body),
                img = $('#comic > img').first();
            if(img.length === 1) {
                callback({
                    'type': 'xkcd',
                    'img': img.attr('src'),
                    'title': img.attr('alt'),
                    'explain': img.attr('title'),
                    'link': url
                });
            } else {
                this.logger.error('Empty XKCD #comic > img');
                callback(null);
            }
        });
    }
}

module.exports = XKCD;
