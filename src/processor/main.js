var logger = require('npmlog'),
    Redis = require('ioredis');

var Settings = require('../shared/settings'),
    Proc = require('./proc'),
    settings = new Settings();

if(settings.loggerLevel) {
    logger.level = settings.loggerLevel;
}

logger.verbose('entrypoint', `Connecting to Redis @ ${settings.redisUrl}`);
var redis = new Redis(settings.redisUrl),
    proc = new Proc(logger, settings, redis);

