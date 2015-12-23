require('../shared/header')('Processor');

var Mongo = require('../shared/mongo');

Mongo.prepare().then(() => {
    var Proc = require('./proc'),
        proc = new Proc(); //eslint-disable-line no-unused-vars
});
