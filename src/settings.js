var fs = require('fs'),
    Path = require('path'),
    logger = require('npmlog');

var defaultSettings = {
    token: '',
    modules: [],
    messageMatcherRegex: /\b(http|https)?(:\/\/)?(\S*)\.(\w{2,4})\b/ig,
    channels: ['random'],
    loggerLevel: 'verbose',
    autoWatch: false
};

class Settings {
    static RegexSerializer(key, value) {
        if(key === 'messageMatcherRegex' && value instanceof RegExp) {
            return ['__SERIALIZED_REGEX ', value.toString()].join('');
        } else {
            return value;
        }
    }

    static RegexDeserializer(key, value) {
        if(key === 'messageMatcherRegex' && value.toString().startsWith('__SERIALIZED_REGEX ')) {
            var fields = value.split('__SERIALIZED_REGEX ')[1].match(/\/(.*)\/(.*)?/);
            fields[2] = fields[2] || "";
            fields.shift();
            return new RegExp(...fields);
        } else {
            return value;
        }
    }

    static rootPath() {
        return Path.join(__dirname, '..');
    }

    static storagePath() {
        return Path.join(Settings.rootPath(), 'storage', 'data.db')
    }

    static getSettingsPath() {
        return process.env.WD_SETTINGS || Path.join(Settings.rootPath(), './settings.json');
    }

    static loadSettings() {
        return JSON.parse(fs.readFileSync(Settings.getSettingsPath()), Settings.RegexDeserializer);
    }

    constructor() {
        this.settingsLoaded = false;
        var readSettings = defaultSettings;
        try {
            readSettings = Settings.loadSettings();
            this.settingsLoaded = true;
        } catch(ex) {
            if(ex.code === 'ENOENT') {
                logger.error('settings', 'Settings file could not be found. Assuming default settings...');
            } else if(ex instanceof SyntaxError) {
                logger.error('settings', 'Error parsing Settings file: ', ex)
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
                    fs.writeFileSync(Settings.getSettingsPath(), JSON.stringify(settings, Settings.RegexSerializer, 4));
                } catch(ex) {
                    logger.error('settings', 'Cannot rewrite settings: ', ex);
                }
                this._channels = settings.channels;
            },
        });
    }
}

module.exports = Settings;
