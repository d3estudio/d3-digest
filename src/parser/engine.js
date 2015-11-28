var nunjucks = require('nunjucks'),
    Path = require('path');

class Engine {
    constructor() { }
    build(file, data) {
        var context = { users: [], items: [], itemsForUser: { } };
        data.forEach((i) => {
            if(!context.users[i.user.username]) {
                context.users[i.user.username] = i.user;
                context.users.push(i.user);
            }
            if(!context.itemsForUser[i.user.username]) {
                context.itemsForUser[i.user.username] = [];
            }
            var reactions = Object.keys(i.reactions)
                .map((rk) => i.reactions[rk]);
            i.totalReactions = 0;
            if(reactions.length) {
                i.totalReactions = reactions.reduce((a, b) => a + b);
            }
            context.itemsForUser[i.user.username].push(i);
            context.items.push(i);
        });
        context.items = context.items.sort((a, b) => b.totalReactions - a.totalReactions);
        // console.dir(context);
        return nunjucks.render(Path.join(__dirname, 'templates', file), context);
    }
}

module.exports = Engine;
