var Plugin = require('./baseplugin'),
    request = require('request'),
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

    process(url, callback) {
        this.logger.verbose('poorLink', `processing ${url}`);
        request.get(url, (e, r, body) => {
            if(e || r.statusCode !== 200) {
                callback(null);
                this.logger.error('poorLink', `Error processing request: ${url}`, (e || 'Server error: ' + r.statusCode));
                return;
            }
            var $ = cheerio.load(body);
            var result = {};
            Object.keys(this.processors).forEach(k => {
                this.processors[k].forEach(p => {
                    if(!result[k]) {
                        var r = p($);
                        if(r) {
                            result[k] = r;
                        }
                    }
                });
            });
            if(result && result.title && result.image && result.summary) {
                result.type = 'rich-link';
                this.processImageSize(result, callback);
                return;
            } else {
                var procs = this.processors.title,
                    title = null;
                procs.forEach(p => title = title || p($));
                result = {
                    type: 'poor-link',
                    title: title
                };
                if(!result.title) {
                    result = null;
                }
            }
            callback(result);
        });
    }

    processImageSize(result, callback) {
        request({
            url: result.image,
            encoding: null
        }, (error, response, body) => {
            var orientation = 'vertical',
                size = { width: undefined, height: undefined };
            if(!error && response.statusCode === 200) {
                try {
                    var dim = sizeOf(body);
                    if(dim.width > dim.height) {
                        orientation = 'horizontal';
                    }
                    size = dim;
                } catch(err) {
                    this.logger.error('poorLink', 'Error processing image size: ', err);
                }
            }
            result.imageOrientation = orientation;
            result.imageSize = size;
            callback(result);
        });
    }
}

PoorLink.priority = -2;
module.exports = PoorLink;
