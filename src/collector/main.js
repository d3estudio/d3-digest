console.log(['                                                                                ', //eslint-disable-line no-console
'                                                                                    ',
'             ╒▄      ╔▄⌐     ╓▄                      ▓─       ▐▓                    ',
'              ▓▌    ╒▓▓▓     ▓▌                      ▓µ       ▐▓                    ',
'              ▐▓    ▓▓\'▓▌   ▐▓ⁿ  ▄▓███▓▄   ▄▓███▓▄   ▓µ   ▄▓▀ ▐▓ █▓      ▓▀         ',
'               ▓▌  ▐▓¬ ╚▓⌐  ▓▌  ▓▓     █▓ ▓▓.    ▐▓  ▓µ ╓▓▀¬  ▐▓  ▓▌    ▓▌          ',
'               ▐▓  ▓▀   █▓ ▐▓~  ▓▀▀▀▀▀▀▀▀ ▓▓▀▀▀▀▀▀▀  ▓█▓▓,    ▐▓  "▓▄  ▓▓           ',
'                ▓▌▓▌     ▓▌▓▌   ▓▌        ▓▓         ▓µ └█▓,  ▐▓   ╙▓ ▐▓            ',
'                ▐▓▓      ╙▓▓     ▀▓▄▄▄▄▄▌  ▀▓▄▄▄▄▄▌  ▓µ   ╙█▓µ▐▓    ▐▓▓Γ            ',
'                 .        .┌       .╘┘─      .└┘,    .      .. .    ╒▓▀             ',
'              ╟▓████▓▓▄    ▀▀                                ╓▄  ╒▄▄▓▀              ',
'              ╟▓      ╙█▓         ,;;        ,;,      ,;;,   ╟▓   .                 ',
'              ╟▓        ▓▌ ▐▓  ╓▓█▀▀▀▀▓▓▀²,▓▀▀▀▀▀▓╕ ▓▓▀▀▀▀▀▀▀▓▓▀▀▀                  ',
'              ╟▓        ╟▓ ▐▓  ▓▌      ▓▌ ▓▌▄▄▄▄▄▓▓ █▓,      ╟▓                     ',
'              ╟▓        ▓▌ ▐▓  ╙▓▄▄▄▄▄▓█  ▓ΓΓΓΓΓΓΓΓ  ¬Γ▀▀▓▄  ╟▓                     ',
'              ╟▓      ▄▓▀  ▐▓   ▓▀Γ▀ΓΓ    █▓              ▓▌ ╟▓                     ',
'              ╚█████▀▀Γ    ▐█  ;▓█████▓▓▄  ╙▀█████▀ ▀█████▀   ▀████                 ',
'                              ▐▓,      ▐▓                                           ',
'                              `█▓▓▄▄▄▄▓█Γ                                           ',
'                                  ¬╘─                                               ',
''].join('\n'));



var logger = require('npmlog');
var Settings = require('../shared/settings'),
    settings = new Settings();

if(settings.loggerLevel) {
    logger.level = settings.loggerLevel;
}

if(!settings.token) {
    logger.error('entrypoint', 'You must set your token before getting started. For further information, refer to the Slack documentation: https://api.slack.com/bot-users and this project\'s README file');
    return;
}

// Keep Slack shut.
process.env.SLACK_LOG_LEVEL = 'alert';

var Slack = require('slack-client'),
    Redis = require('ioredis'),
    Bot = require('./bot');

logger.verbose('entrypoint', `Connecting to Redis @ ${settings.redisUrl}`);
var slack = new Slack(settings.token, true, true),
    redis = new Redis(settings.redisUrl);

logger.info('entrypoint', 'Connecting to Slack...');
slack.on('open', () => {
    var bot = new Bot(slack, logger, settings, redis); //eslint-disable-line no-unused-vars
})
.on('error', err => logger.error('entrypoint', 'Error: ', err))
.login();
