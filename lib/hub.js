'use strict';

var log = require('./log'),
    Registry = require('./registry'),
    server = require('./server'),
    config = require('./config');

function main(opts) {
    var conf = buildConfig(opts),
        registry = new Registry(conf),
        srv = server(registry);

    process.on('uncaughtException', function(err) {
        log.warn('! Uncaught Exception occurred:\n%s', err.stack || err);
    });

    handleSignals(srv);

    return srv
        .listen(conf.port, conf.host)
        .tap(function() {
            var host = (conf.host === '::') ? 'localhost' : conf.host;
            log.info('Hub is listening on http://%s:%s', host, conf.port);
        })
        .thenResolve();
}

function buildConfig(opts) {
    var conf = config();

    if (opts.config) {
        conf.extend(opts.config);
    }

    if (typeof process.env.port !== 'undefined') {
        conf.extend({port: parseInt(process.env.port, 10)});
    }

    if (typeof process.env.host !== 'undefined') {
        conf.extend({host: process.env.host});
    }

    if (typeof opts.port !== 'undefined') {
        conf.extend({port: parseInt(opts.port, 10)});
    }

    if (typeof opts.host !== 'undefined') {
        conf.extend({host: opts.host});
    }

    return conf;
}

function handleSignals(server) {
    process.once('SIGINT', _handler);
    process.on('SIGTERM', _handler);

    function _handler() {
        log.info('Stopping grid');
        server.stop()
            .then(function() {
                process.exit(0); // eslint-disable-line
            });
    }
}

exports.main = main;
