var log = require('./lib/log'),
    store = require('./lib/store'),
    registry = require('./lib/registry'),
    server = require('./server');

function main(args) {
    var port = parseInt(process.argv[2], 10) || process.env.port || 4444,
        // listen on all interfaces by default (IPv4 and IPv6)
        host = process.argv[3] || process.env.host || '::',
        srv = server();

    store.setConfig(args || {});

    process.on('uncaughtException', function(err) {
		log.warn('! Uncaught Exception occurred:\n%s', err.stack || err);
	});

    handleSignals(srv);

    return srv
        .listen(port, host)
        .tap(function() {
            log.info('Server booting up... Listening on ' + port);
        });
}

function handleSignals(server) {
    process.once('SIGINT', _handler);
    process.on('SIGTERM', _handler);

    function _handler() {
        // TODO: reimplememnt so it will respect that processPendingRequest()
        // processes not all pending requests on single call
        //if (registry.pendingRequests.length > 0) {
        //    log.warn('Can\'t stop hub just yet, pending requests!');
        //    // try now
        //    registry.processPendingRequest().done();
        //    return;
        //}

        log.info('Stopping grid');
        server.stop()
            .then(function() {
                process.exit(0);
            });
    }
}

exports.main = main;
