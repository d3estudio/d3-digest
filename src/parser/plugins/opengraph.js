var Plugin = require('./baseplugin'),
    og = require('open-graph'),
    firstBy = require('thenBy.js');

class OpenGraph extends Plugin {
    canHandle() {
        return true;
    }

    // open-graph results sucks. No, really!
    processOGResult(obj) {
        if(!obj) { return; }
        if(obj.image && obj.image.url && obj.image.url.length > 0) {
            var urls = obj.image.url,
                heights = obj.image.height || [],
                widths = obj.image.width || [],
                types = obj.image.type || [],
                images = [];
            for(var i = 0; i < urls.length; i++) {
                var r = {
                    url: urls[i],
                    type: types[i],
                    width: widths[i],
                    height: heights[i]
                };
                if(widths[i] && heights[i]) {
                    r.size = `${widths[i]}x${heights[i]}`;
                }
                images.push(r);
            }
            delete obj['image'];
            obj.images = images;
        }
        return obj;
    }

    arrayOrValue(o) {
        return Array.isArray(o) ? o[0] : o;
    }

    process(url, callback) {
        this.logger.verbose('openGraph', `processing ${url}`);
        og(url, (err, meta) => {
            if(err) {
                this.logger.warning('openGraph', `Cannot process url ${url}: `, err);
                callback(null);
                return;
            } else {
                meta = this.processOGResult(meta);
                var images = meta.images;
                if(images) {
                    images = images.sort(
                        firstBy('width')
                        .thenBy('height')
                    ).reverse();
                }
                if(!meta.site_name && !meta.title && !meta.description) {
                    callback(null);
                } else {
                    callback({
                        type: 'rich-link',
                        ogType: this.arrayOrValue(meta.type),
                        site_name: this.arrayOrValue(meta.site_name),
                        title: this.arrayOrValue(meta.title),
                        description: this.arrayOrValue(meta.description),
                        image: images ? images[0] : null
                    });
                }
            }
        });
    }
}

OpenGraph.priority = -1;
module.exports = OpenGraph;
