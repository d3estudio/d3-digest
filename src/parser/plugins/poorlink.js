var Plugin = require('./baseplugin'),
    request = require('request'),
    cheerio = require('cheerio'),
    sizeOf = require('image-size');

class PoorLink extends Plugin {
    canHandle() {
        return true;
    }

    openGraph(body, url, callback) {
        var result = {
            title: body('meta[property="og:title"]').first().attr('content'),
            summary: body('meta[property="og:description"]').first().attr('content'),
            image: body('meta[property="og:image"]').first().attr('content')
        };

        if(result.title && result.summary && result.image) {
            callback(result);
        } else {
            callback(null);
        }
    }

    twitterCard(body, url, callback) {
        var result = {
            title: body('meta[name="twitter:title"]').attr('content'),
            summary: body('meta[name="twitter:description"]').attr('content'),
            image: body('meta[name="twitter:image"]').attr('content')
        };

        if(result.title && result.summary && result.image) {
            callback(result);
        } else {
            callback(null);
        }
    }

    metaTags(body, url, callback) {
        var result = {};
        result.title = body('meta[itemprop="name"]').first().attr('content') ||
                        body('title').first().text() ||
                        body('h1').first().text() ||
                        body('h2').first().text() ||
                        body('h3').first().text();
        result.summary = body('meta[itemprop="description"]').first().attr('content') ||
                            body('meta[name="description"]').first().attr('content');
        result.image = body('meta[itemprop="image"]').first().attr('content') ||
                        body('div img').first().attr('src');

        if(result.title && result.summary && result.image) {
            callback(result);
        } else {
            callback(null);
        }
    }

    process(url, callback) {
        this.logger.verbose('poorLink', `processing ${url}`);
        request.get(url, (e, r, body) => {
            this.processors = [this.openGraph, this.twitterCard, this.metaTags];
            if(e) {
                callback(null);
                this.logger.error('poorLink', 'Error processing request: ', e);
                return;
            }
            var $ = cheerio.load(body);
            var nextCallback = (r) => {
                if(r) {
                    r.type = 'rich-link';
                    this.processImageSize(r, callback);
                } else {
                    callback(r);
                }
            };
            this.execute($, url, nextCallback);
        });
    }

    execute(body, url, callback, result) {
        if(result) {
            callback(result);
            return;
        } else {
            var next = this.processors.shift();
            if(next) {
                next(body, url, (r) => this.execute(body, url, callback, r));
            } else {
                callback(null);
                return;
            }
        }
    }

    processImageSize(result, callback) {
        request({
            url: result.image,
            encoding: null
        }, (error, response, body) => {
            var orientation = 'vertical';
            if(!error && response.statusCode === 200) {
                try {
                    var dim = sizeOf(body);
                    if(dim.width > dim.height) {
                        orientation = 'horizontal';
                    }
                } catch(err) {
                    this.logger.error('poorLink', 'Error processing image size: ', err);
                }
                result.imageOrientation = orientation;
                callback(result);
            } else {
                result.imageOrientation = orientation;
                callback(result);
            }
        });
    }
}

PoorLink.priority = -2;
module.exports = PoorLink;
