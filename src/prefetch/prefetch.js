require('../shared/header')('Prefetch');

var Mongo = require('../shared/mongo'),
    EmojiDb = require('./emojidb'),
    logger = require('npmlog');

Mongo.prepare()
    .then(() => EmojiDb.prepare())
    .then(() => {
        var Pref = require('./pref'),
            pref = new Pref(); //eslint-disable-line no-unused-vars
    })
    .catch((ex) => {
        logger.error('Entrypoint', 'General failure: ', ex);
    });
