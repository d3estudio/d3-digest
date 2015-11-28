var Path = require('path'),
    fs = require('fs');

class EngineExtensions {
    constructor(logger) {
        this.emojiDb = JSON.parse(fs.readFileSync(Path.join(__dirname, 'emoji', 'db.json')));
        this.logger = logger;
    }

    split(val, separator) {
        return val.split(separator);
    }

    firstProp(val, prop) {
        console.log('FirstProp for ', val);
        var item = null;
        try {
            item = val[prop];
        } catch(ex) {}
        if(item) {
            console.log('returning ', item[prop]);
            return item[prop];
        }
        console.log('returning null');
        return null;
    }

    emoji(name) {
        var item = this.emojiDb.find((e) => e.aliases.indexOf(name) > -1)
        if(!!item) {
            return item.emoji;
        }
        this.logger.warn('RenderEngineExtensions', `Unknown emoji: ${name}`);
        return null;
    }

    registerExtensionsOn(environment) {
        var methods = {};
        var ignorable = ['registerExtensionsOn'];
        for(var name of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
            var method = this[name];
            if(!(method instanceof Function) || method === EngineExtensions) {
                continue;
            }
            if(ignorable.indexOf(name) === -1) {
                methods[name] = method.bind(this);
            }
        }
        Object.keys(methods).forEach((n) => environment.addFilter(n, methods[n]));
    }
}

module.exports = EngineExtensions;
