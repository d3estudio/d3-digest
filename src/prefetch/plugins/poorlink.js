var Plugin = require('./baseplugin'),
    request = require('request-promise'),
    cheerio = require('cheerio'),
    sizeOf = require('image-size');

class PoorLink extends Plugin {
    canHandle() {
        return true;
    }

    init() {
        this.processors = {
            title: [
                body => body('meta[property="og:title"]').first().attr('content'),                  // OGP
                body => body('meta[name="twitter:title"]').attr('content'),                         // Twitter Card
                body => body('meta[itemprop="name"]').first().attr('content') || body('title').first().text() || body('h1').first().text() || body('h2').first().text() || body('h3').first().text()
            ],
            summary: [
                body => body('meta[property="og:description"]').first().attr('content'),            // OGP
                body => body('meta[name="twitter:description"]').attr('content'),                   // Twitter Card
                body => body('meta[itemprop="description"]').first().attr('content') || body('meta[name="description"]').first().attr('content')
            ],
            image: [
                body => body('meta[property="og:image"]').first().attr('content'),                  // OGP
                body => body('meta[name="twitter:image"]').attr('content'),                         // Twitter Card
                body => body('meta[itemprop="image"]').first().attr('content') || body('div img').first().attr('src')
            ]
        };
    }

    run(url) {
        return request.get(url)
            .then(body => cheerio.load(body))
            .then($ => {
                var result = {}, r;
                Object.keys(this.processors).forEach(k => {
                    this.processors[k].forEach(p => {
                        if(r = p($)) {
                            result[k] = result[k] || r;
                        }
                    });
                });
                return result;
            })
            .then(result => {
                if(result && result.title && result.image && result.summary) {
                    result.type = 'rich-link';
                    return this.processImageSize(result);
                }
                return result;
            })
            .then(result => {
                if(result && result.title && (!result.image || !result.summary)) {
                    result = {
                        type: 'poor-link',
                        title: result.title
                    }
                    if(!result.title) {
                        result = null;
                    }
                }
                return result;
            });
    }

    processImageSize(result) {
        var opts = {
                url: result.image,
                encoding: null
            },
            orientation = 'vertical',
            size;
        return request.get(opts)
            .then(body => sizeOf(body))
            .then(size => {
                if(size.width > size.height) {
                    orientation = 'horizontal';
                }
                result.imageOrientation = orientation;
                result.imageSize = size;
                return result;
            });
    }
}

PoorLink.priority = -2;
module.exports = PoorLink;
