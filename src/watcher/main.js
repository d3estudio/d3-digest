console.log(['                                                                                ',
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
var Settings = require('../settings'),
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
    Bot = require('./bot'),
    bot;
logger.info('entrypoint', 'Connecting to Slack...');
var slack = new Slack(settings.token, true, true);
var ignoredEvents = ['pong', 'hello', 'user_typing', 'presence_change', 'group_marked', 'channel_marked'];

slack.on('open', _ => {
        bot = new Bot(slack, logger, settings);
    })
    .on('error', err => console.error('entrypoint', 'Error: ', err))
    .login();
