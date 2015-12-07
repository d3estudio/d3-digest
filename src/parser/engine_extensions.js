var Path = require('path'),
    fs = require('fs');

Date.prototype.getWeekOfMonth = function () {
    var dayOfMonth = this.getDay();
    var month = this.getMonth();
    var year = this.getFullYear();
    var checkDate = new Date(year, month, this.getDate());
    var checkDateTime = checkDate.getTime();
    var currentWeek = 0;

    for (var i = 1; i < 32; i++) {
        var loopDate = new Date(year, month, i);

        if (loopDate.getDay() === dayOfMonth) {
            currentWeek++;
        }

        if (loopDate.getTime() === checkDateTime) {
            return currentWeek;
        }
    }
};

class EngineExtensions {
    constructor(logger) {
        this.emojiDb = JSON.parse(fs.readFileSync(Path.join(__dirname, 'emoji', 'db.json')));
        this.logger = logger;
    }

    split(val, separator) {
        return val.split(separator);
    }

    emoji(name) {
        var item = this.emojiDb.find((e) => e.aliases.indexOf(name) > -1);
        if(item) {
            return item.emoji;
        }
        this.logger.warn('RenderEngineExtensions', `Unknown emoji: ${name}`);
        return null;
    }

    weekOfMonth(date) {
        var d = new Date(date).getWeekOfMonth(),
            data = ['', 'st', 'nd', 'rd'],
            postfix = 'th';
        if(d < data.length) {
            postfix = data[d];
        }
        return [d, postfix].join('');
    }

    monthName(date) {
        var d = new Date(date);
        return d.toLocaleString("en-us", { month: "long" })
    }

    yearOfDate(date) {
        var d = new Date(date);
        return d.getFullYear();
    }

    domain(string) {
        var r = /(?:https?:\/\/)?([^\/]+).*/,
            result = r.exec(string);
        return result ? result[1] : string;
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
