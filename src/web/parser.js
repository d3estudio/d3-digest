var settings = require('../shared/settings').sharedInstance(),
    Mongo = require('../shared/mongo').sharedInstance(),
    memcached = require('../shared/memcached').sharedInstance(),
    logger = require('npmlog');

class Parser {
    constructor() { }

    itemsInRange(skipping) {
        logger.verbose('parser', `Selecting ${settings.outputLimit} after ${skipping} items...`);
        var query = { ready: true },
            opts = { };

        if(!settings.showLinksWithoutReaction) {
            query.$where = 'Object.keys(this.reactions).length > 0';
        }

        if(skipping > 0) {
            opts.skip = skipping;
        }

        return Mongo.collection('items')
            .find(query, opts)
            .limit(settings.outputLimit)
            .sort({ 'date': -1 })
            .toArray()
            .then(docs => {
                logger.verbose('parser', `Acquired ${docs.length} documents`);
                return docs;
            })
            .then(docs => {
                docs = docs
                    .filter(d => !Object.keys(d.reactions).some((r) => settings.silencerEmojis.indexOf(r) > -1))
                    .map(d => `${settings.itemCachePrefix}${d.ts}`)
                    .map(d => memcached.get(d));
                return Promise.all(docs)
                    .then(result => result.filter(r => r))
                    .then(result => result.map(JSON.parse))
                    .then(result => this.digest(result));
            });
    }

    digest(result) {
        var context = { users: [], items: [], itemsForUser: { } };
        result.forEach((i) => {
            i.reactions = i.reactions
                .sort((a, b) => b.count - a.count);

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
                u.emojis = {};
            }
            i.reactions.forEach(r => {
                if(!u.emojis[r.name]) {
                    u.emojis[r.name] = r;
                }
                u.emojis[r.name].count += r.count;
            });
        });
        context.users = context.users.map(u => {
            u.emojis = Object.keys(u.emojis)
                .map((k) => u.emojis[k])
                .sort((a, b) => b.count - a.count)
                .map((o) => o.repr);
            return u;
        });
        context.items = context.items.sort((a, b) => b.totalReactions - a.totalReactions);
        return context;
    }
}

module.exports = Parser;
