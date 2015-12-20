var logger = require('npmlog');

class Plugin {
    constructor(settings) {
        this.settings = settings;
        this.init();
    }

    init() { }

    canHandle() {
        return false;
    }

    process(url) {
        logger.verbose(this.constructor.name, `Processing ${url}`);
        return this.run(url);
    }

    run(url) {
        return Promise.reject(new Error('Not implemented'));
    }
}

Plugin.isUrlTransformer = false; // When true, automatically sets priority as 2: Super high
Plugin.priority = 0; // Values: -1: Low, 0: Normal, 1: High

module.exports = Plugin;
