var fs = require('fs'),
    Path = require('path'),
    logger = require('npmlog');

var defaultSettings = {
    token: '',
    channels: ['random'],
    loggerLevel: 'info',
    autoWatch: false,
    silencerEmojis: ['no_entry_sign'],
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/digest',
    memcachedHost: process.env.MEMCACHED_HOST || '127.0.0.1',
    memcachedPort: process.env.MEMCACHED_PORT || '11211',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6380/1',
    outputDayRange: 1,
    timezone: 'America/Sao_Paulo',
    showLinksWithoutReaction: false
};

class Settings {
    static rootPath() {
        return Path.join(__dirname, '..', '..');
    }

    static getSettingsPath() {
        return process.env.WD_SETTINGS || Path.join(Settings.rootPath(), './settings.json');
    }

    static loadSettings() {
        return JSON.parse(fs.readFileSync(Settings.getSettingsPath()));
    }

    constructor() {
        this.settingsLoaded = false;
        this.messageMatcherRegex = /\b(http|https)?(:\/\/)?(\S*)\.(\w{2,4})(\/([^\s]+))?\b/ig;
        var readSettings = defaultSettings;
        try {
            readSettings = Settings.loadSettings();
            this.settingsLoaded = true;
        } catch(ex) {
            if(ex.code === 'ENOENT') {
                logger.error('settings', 'Settings file could not be found. Assuming default settings...');
            } else if(ex instanceof SyntaxError) {
                logger.error('settings', 'Error parsing Settings file: ', ex);
            } else {
                logger.error('settings', 'Unexpected error: ', ex);
            }
        }
        var settingsKeys = Object.keys(readSettings),
            defaultKeys = Object.keys(defaultSettings),
            channels = defaultSettings.channels;
        defaultKeys.forEach(key => {
            if(key !== 'channels') {
                if(settingsKeys.indexOf(key) === -1) {
                    readSettings[key] = defaultSettings[key];
                }
            } else {
                if(settingsKeys.indexOf('channels') > -1) {
                    channels = readSettings.channels;
                }
            }
        });
        delete readSettings['channels'];
        this._channels = channels;
        Object.assign(this, readSettings);
        Object.defineProperty(this, 'channels', {
            get: () => {
                return this._channels;
            },
            set: value => {
                var settings = readSettings;
                try {
                    settings = Settings.readSettings();
                } catch(ex) {
                    /* Too bad. */
                }
                settings.channels = [ ...new Set(this._channels.concat(settings.channels).concat(value)) ].filter(v => v);
                try {
                    fs.writeFileSync(Settings.getSettingsPath(), JSON.stringify(settings, null, 4));
                } catch(ex) {
                    logger.error('settings', 'Cannot rewrite settings: ', ex);
                }
                this._channels = settings.channels;
            }
        });
    }
}

module.exports = Settings;
