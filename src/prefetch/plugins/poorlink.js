var Plugin = require('./baseplugin'),
    request = require('request-promise'),
    cheerio = require('cheerio'),
    sizeOf = require('image-size'),
    URL = require('url'),
    StringDecoder = require('string_decoder').StringDecoder,
    Iconv = require('iconv').Iconv,
    logger = require('npmlog');

class PoorLink extends Plugin {
    canHandle() {
        return true;
    }

    init() {
        this.utf8Decoder = new StringDecoder('utf8');
        this.metaEncodingFinders = [
            body => {
                var item = body('meta[http-equiv]')
                    .toArray()
                    .filter(i => i.attribs && Object.keys(i.attribs).indexOf('http-equiv') > -1)
                    .filter(i => i.attribs['http-equiv'].toLowerCase() === 'content-type')
                    .map(i => i.attribs['content'])[0];
                return this.extractCharsetFromContentType(item);
            },
            body => body('meta[charset]').first().attr('charset')
        ];
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

    loadHtml(value) {
        return cheerio.load(value, { lowerCaseTags: true, lowerCaseAttributeNames : true });
    }

    extractCharsetFromContentType(ct) {
        var result;
        if(ct && typeof ct === 'string') {
            result = ct.split(';')
                .filter(i => i.indexOf('=') > -1)
                .map(i => i.trim().split('='))
                .filter(i => i[0].toLowerCase() === 'charset')[0];
            if(result) {
                result = result[1].trim();
            }
        }
        return result;
    }

    run(url) {
        var opts = {
            method: 'GET',
            uri: url,
            resolveWithFullResponse: true,
            encoding: null
        };
        return request.get(opts)
            .then(response => {
                // First step. Try to detect encoding on http headers
                response.detectedEncoding = this.extractCharsetFromContentType(response.caseless.dict['content-type']);
                return response;
            })
            .then(response => {
                if(!response.detectedEncoding) {
                    // Okay, we couldn't find a thing on http headers. Let's preparse it
                    // as UTF8, load it and storm through its html head tags.
                    response.utf8Dom = this.loadHtml(this.utf8Decoder.write(response.body));
                    var encoding = this.metaEncodingFinders
                        .map(func => func(response.utf8Dom))
                        .filter(r => r)[0];
                    if(encoding) {
                        response.detectedEncoding = encoding;
                    }
                }
                return response;
            })
            .then(response => {
                var encoding = 'utf8', html;
                if(!response.detectedEncoding) {
                    logger.verbose('detectEncoding', `No encoding was detected on document. Falling back to utf8`);
                } else {
                    logger.verbose('detectEncoding', `Encoding detected on document: ${response.detectedEncoding}`);
                    encoding = response.detectedEncoding;
                }
                if(encoding === 'utf8' || encoding === 'utf-8') {
                    if(response.utf8Dom) {
                        return response.utf8Dom;
                    } else {
                        html = this.utf8Decoder.write(response.body);
                    }
                } else {
                    try {
                        var decoder = new Iconv(encoding, 'utf-8//IGNORE');
                        html = decoder.convert(response.body);
                    } catch(ex) {
                        logger.error('poorlink', `Error decoding response with encoding "${encoding}". Falling back to utf8.`, ex);
                        try {
                            html = this.utf8Decoder.write(response.body);
                        } catch(ex) {
                            logger.error('poorlink', `Fallback to utf8 failed. Falling back to ASCII.`, ex);
                            html = response.body.toString();
                        }
                    }
                    return this.loadHtml(html);
                }
            })
            .then($ => {
                var result = {}, r;
                Object.keys(this.processors).forEach(k => {
                    this.processors[k].forEach(p => {
                        if((r = p($))) {
                            result[k] = result[k] || r;
                        }
                    });
                });
                return result;
            })
            .then(result => {
                if(result && result.title && result.image && result.summary) {
                    result.type = 'rich-link';
                    result.image = URL.resolve(url, result.image);
                    return this.processImageSize(result);
                }
                return result;
            })
            .then(result => {
                if(result && result.title && (!result.image || !result.summary)) {
                    result = {
                        type: 'poor-link',
                        title: result.title
                    };
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
            orientation = 'vertical';
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
