var nunjucks = require('nunjucks'),
    Path = require('path');

class Engine {
    constructor() {
        this.environment = new nunjucks.Environment(new nunjucks.FileSystemLoader(Path.join(__dirname, 'templates')));
    }

    getEnvironment() {
        return this.environment;
    }

    build(file, data) {
        var context = { users: [], items: [], itemsForUser: { } };
        data.forEach((i) => {
            if(!context.users.some(u => u.username === i.user.username)) {
                context.users.push(i.user);
            }
            if(!context.itemsForUser[i.user.username]) {
                context.itemsForUser[i.user.username] = [];
            }
            var totalReactions = i.reactions
                .map(r => r.count);
            if(totalReactions.length) {
                totalReactions = totalReactions.reduce((a, b) => a + b);
            } else {
                totalReactions = 0;
            }
            i.totalReactions = totalReactions;
            context.itemsForUser[i.user.username].push(i);
            context.items.push(i);
            var u = context.users.find(u => u.username === i.user.username);
            if(!u.emojis) {
                u.emojis = {}
            }
            i.reactions.forEach(r => {
                if(!u.emojis[r.name]) {
                    u.emojis[r.name] = 0;
                }
                u.emojis[r.name] += r.count;
            })
        });
        context.users.map(u => {
            u.emojis = Object.keys(u.emojis)
                .sort((a, b) => u.emojis[b] - u.emojis[b]);
            return u;
        });
        context.items = context.items.sort((a, b) => b.totalReactions - a.totalReactions);
        return this.environment.render(file, context);
    }
}

module.exports = Engine;
