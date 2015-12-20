var Plugin = require('./baseplugin'),
    request = require('request-promise'),
    cheerio = require('cheerio');

class XKCD extends Plugin {
    init() {
        this.regex = /^(https?:\/\/)?(www\.)?xkcd\.com\/(\d+)\/?$/i;
    }

    canHandle(url) {
        return url.match(this.regex);
    }

    run(url) {
        return request.get(url)
            .then(html => cheerio.load(html))
            .then($ => $('#comic > img').first())
            .then(img => ({
                type: 'xkcd',
                img: img.attr('src'),
                title: img.attr('alt'),
                explain: img.attr('title'),
                link: url
            }));
    }
}

module.exports = XKCD;
