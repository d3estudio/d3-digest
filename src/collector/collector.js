require('../shared/header')('Collector');
var settings = require('../shared/settings').sharedInstance(),
    logger = require('npmlog');

if(!settings.token) {
    logger.error('entrypoint', 'You must set your token before getting started. For further information, refer to the Slack documentation: https://api.slack.com/bot-users and this project\'s README file');
    return;
}

// Keep Slack shut.
process.env.SLACK_LOG_LEVEL = 'alert';

var Slack = require('slack-client'),
    Bot = require('./bot');

var slack = new Slack(settings.token, true, true);
logger.info('entrypoint', 'Connecting to Slack...');
slack.on('open', () => {
    var bot = new Bot(slack); //eslint-disable-line no-unused-vars
})
.on('error', err => {
    logger.error('entrypoint', 'Error: ', err);
    if(err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
        logger.warn('entrypoint', 'Slack is reconnecting...');
        slack.login();
    }
})
.login();
