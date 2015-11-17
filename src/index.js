var Slack = require('slack-client'),
    token = require('./token'),
    Bot = require('./bot'),
    channels = ['aleatorio', 'random', 'general'];

var slackToken = ,
    slack = new Slack(slackToken, true, true),
    bot;

slack
    .on('open', function() {
        bot = new Bot(slack, channels);
    })
    .on('error', function(err) {
        console.error('Error', err);
    })
    .on('raw_message', function(m) { console.log(m); })
    .login();
