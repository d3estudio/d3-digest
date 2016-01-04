var fs = require('fs'),
    Path = require('path'),
    settings = require('../shared/settings').sharedInstance(),
    logger = require('npmlog');

/**
 * Manages the available plugins
 */
class Plugins {

    /**
     * Initialises a new manager
     * @return {Plugins} A new instance of this class
     */
    constructor() {
        this.pluginsDir = Path.join(__dirname, 'plugins');
        this.ignorablePlugins = ['baseplugin.js'];
    }

    /**
     * Gets a list of loadable plugins
     * @return {Array}  List of loadable plugins from the plugins folder
     */
    listPlugins() {
        return fs.readdirSync(this.pluginsDir)
            .filter((f) => this.ignorablePlugins.indexOf(f) === -1)
            .map((f) => Path.join(this.pluginsDir, f))
            .filter((f) => !fs.statSync(f).isDirectory());
    }

    /**
     * Tries to load a given plugin
     * @param  {string}     item    Path to the plugin to be loaded
     * @return {object}     A loaded and initialised plugin instance
     */
    loadPlugin(item) {
        var plugin = null;
        try {
            logger.verbose('pluginLoader', `Loading plugin: ${item}`);
            var raw_plugin = require(item);
            if(raw_plugin.priority > 1) {
                logger.error('pluginLoader', `Refusing to load plugin "${item}": Incorrect priority value ${raw_plugin.priority}`);
            } else {
                plugin = new raw_plugin(settings, logger);
            }
        } catch(ex) {
            logger.error('pluginLoader', `Error loading plugin at ${item}: `, ex);
        }
        return plugin;
    }
}

module.exports = Plugins;
