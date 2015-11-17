var Datastore = require('nedb'),
    db = new Datastore({ filename: './data', autoload: true });

var Bot = function(slack, channels) {
    this.queue = [];
    this.urlRegex = /\b(http|https)?(:\/\/)?(\S*)\.(\w{2,4})\b/ig;
    this.slack = slack;
    this.channels = channels.map(function(c) { return c.toLowerCase(); })
    db.ensureIndex({ fieldName: 'ts', unique: true }, function (err) { });
    slack
        .on('raw_message', this.onRawMessage.bind(this))
        .on('message', this.onMessage.bind(this))
        .on('reaction_added', this.recalculateReactions.bind(this))
        .on('reaction_removed', this.recalculateReactions.bind(this));

    var invalid_channels = Object.keys(slack.channels)
        .map(function(p) { return slack.channels[p] })
        .filter(function(c) { return this.channels.indexOf(c.name) > -1; }.bind(this))
        .filter(function(c) { return !c.is_member; });
    if(invalid_channels.length > 0) {
        console.log('WARNING: Watching channel(s) in which the bot is not a member of: ' + invalid_channels.map(function(x) { return x.name; }).join(', '));
    }
};

Bot.prototype = {
    onRawMessage: function(msg) {
        if(msg.type.indexOf('reaction') === 0) {
            this.recalculateReactions(msg);
        }
    },
    onMessage: function(msg) {
        var channel = this.slack.getChannelGroupOrDMByID(msg.channel);
        if(this.channels.indexOf(channel.name.toLowerCase()) > -1) {
            if(msg.type === 'message') {
                if(msg.subtype === 'message_deleted') {
                    db.remove({ ts: msg.deleted_ts });
                } else {
                    if(msg.text) {
                        var matches = msg.text.match(this.urlRegex);
                        if(matches && matches.length > 0) {
                            db.find({ ts: msg.ts }, function(err, docs) {
                                if(docs.length < 1) {
                                    this.enqueueOperation('insert', { ts: msg.ts, text: msg.text, channel: channel.name, reactions: 0, date: Date.now() })
                                }
                            })
                        }
                    }
                }
            }
        }
    },
    recalculateReactions: function(msg) {
        var delta = msg.type === 'reaction_added' ? 1 : -1;
        this.enqueueOperation('update', { ts: msg.item.ts }, { $inc: { reactions: delta } });
    },
    enqueueOperation: function(operation) {
        var args = Array.prototype.slice.call(arguments);
        args.shift();
        this.queue.push([operation, args]);
        if(!this.dequeing) {
            this.dequeing = true;
            this.dequeue();
        }
    },
    dequeue: function() {
        var result;
        if(!(result = this.queue.shift())) {
            this.dequeing = false;
        } else {
            result[1].push(this.dequeue.bind(this));
            db[result[0]].apply(db, result[1]);
        }
    }
}

module.exports = Bot;
