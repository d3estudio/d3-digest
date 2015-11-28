class Plugin {
    constructor(settings, logger) {
        this.settings = settings;
        this.logger = logger;
        this.init();
    }

    init() { }

    canHandle(url) {
        return false;
    }

    process(url, callback) {
        return callback({});
    }
}

Plugin.isUrlTransformer = false; // When true, automatically sets priority as 2: Super high
Plugin.priority = 0; // Values: -1: Low, 0: Normal, 1: High

module.exports = Plugin;
