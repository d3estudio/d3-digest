var fs = require('fs'),
    Path = require('path');

class Plugins {
    constructor(settings, logger) {
        this.settings = settings;
        this.pluginsDir = Path.join(__dirname, 'plugins');
        this.logger = logger;
        this.ignorablePlugins = ['baseplugin.js'];
    }

    listPlugins() {
        return fs.readdirSync(this.pluginsDir)
            .filter((f) => this.ignorablePlugins.indexOf(f) === -1)
            .map((f) => Path.join(this.pluginsDir, f))
            .filter((f) => !fs.statSync(f).isDirectory());
    }

    loadPlugin(item) {
        var plugin = null;
        try {
            this.logger.verbose('pluginLoader', `Loading plugin: ${item}`);
            var raw_plugin = require(item);
            if(raw_plugin.priority > 1) {
                this.logger.error('pluginLoader', `Refusing to load plugin "${item}": Incorrect priority value ${raw_plugin.priority}`);
            } else {
                plugin = new raw_plugin(this.settings, this.logger);
            }
        } catch(ex) {
            this.logger.error('pluginLoader', `Error loading plugin at ${item}: `, ex);
        }
        return plugin;
    }
}

module.exports = Plugins;
