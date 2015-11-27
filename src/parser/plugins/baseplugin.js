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

Plugin.isUrlTransformer = false;

module.exports = Plugin;
