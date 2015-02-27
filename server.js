/*
Copyright 2013 TestingBot

Licensed under the Apache License, Version 2.0 (the 'License');
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an 'AS IS' BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var q = require('q');
var http = require('http');
var url = require('url');
var net = require('net');
//var repl = require('repl');
var domain = require('domain');
var enableDestroy = require('server-destroy');

// servlets
var apiHubServlet = require('./lib/servlets/apiHub');
var apiProxyServlet = require('./lib/servlets/apiProxy');
var requestHandler = require('./lib/requesthandler');
var registerServlet = require('./lib/registerservlet');
var unregisterServlet = require('./lib/unregisterservlet');
var welcomeServlet = require('./lib/welcomeservlet');

var registry = require('./lib/registry');
var models = require('./lib/models');
var parser = require('./lib/parser');
var log = require('./lib/log');
var store = require('./lib/store');

var servletRoutes = {
    '/grid/api/hub': apiHubServlet,
    '/grid/api/proxy': apiProxyServlet,
    //'/grid/api/testsession': 'not implemented',
    //'/grid/driver': 'not implemented',
    //'/grid/resources': 'not implemented',
    //'/lifecycle-manager': 'not implemented',
    '/grid/register': registerServlet,
    '/grid/unregister': unregisterServlet,
    '/selenium-server/driver': requestHandler,
    //'/wd/hub/status': 'not implemented',
    '/wd/hub/session': requestHandler
};

var parseIncoming = function(req, res, cb) {
	var srvUrl = url.parse(req.url.toString(), true),
        servlet;
	if (servletRoutes[srvUrl.pathname]) {
		servlet = servletRoutes[srvUrl.pathname];
		return servlet.handleRequest(req, cb, res);
	} else {
		// slower lookup of routes
		for (var route in servletRoutes) {
			if (route === srvUrl.pathname.substring(0, route.length)) {
				servlet = servletRoutes[route];
				return servlet.handleRequest(req, cb, res);
			}
		}
	}

	if (srvUrl.pathname === '/') {
		return welcomeServlet.handleRequest(req, cb, res);
	}
	
	return cb(new models.Response(400, 'Unable to handle request - Invalid endpoint or request.'));
};

function main(args, cb) {
    if (typeof args === 'function') {
        cb = args;
        args = {};
    }
    store.setConfig(args || {});

	var port = parseInt(process.argv[2], 10) || 4444,
        server = http.createServer(function(req, res) {
            req.on('close', function(err) {
                log.warn('!error: on close');
            });

            res.on('close', function() {
                log.warn('!error: response socket closed before we could send');
            });

            var reqd = domain.create();
            reqd.add(req);
            reqd.add(res);

            res.socket.setTimeout(6 * 60 * 1000);
            res.socket.removeAllListeners('timeout');
            req.on('error', function(e) {
                log.warn(e);
            });

            reqd.on('error', function(er) {
                log.warn(er);
                log.warn(er.stack);
                log.warn(req.url);
                try {
                    res.writeHead(500);
                    res.end('Error - Something went wrong: ' + er.message);
                } catch (er) {
                    log.warn('Error sending 500');
                    log.warn(er);
                }
            });

            res.on('error', function(e) {
                log.warn(e);
            });

            res.socket.once('timeout', function() {
                try {
                    res.writeHead(500, {'Content-Type': 'text/plain'});
                    res.end('Error - Socket timed out after 6 minutes');
                } catch (e) {}
                try {
                    res.socket.destroy();
                } catch (e) {}
            });

            parseIncoming(req, res, function(response) {
                res.writeHead(response.statusCode, response.headers);
                res.end(response.body);
            });

        });

    enableDestroy(server);
    server.httpAllowHalfOpen = true;

    // TODO: IPv6
    var defer = q.defer();
    server.listen(port, '0.0.0.0', function() {
        log.info('Server booting up... Listening on ' + port);
        defer.resolve(server);
    });

    // TODO: reimplement for tests (need ability to close server); or was it realy working?
    /*var manager = net.createServer(function(socket) {
            repl.start({
                    prompt: 'node via TCP socket> ',
                    input: socket,
                    output: socket,
                    useGlobal: true
                })
                .on('exit', function() {
                    socket.end();
                });
        })
        .listen(4446, '127.0.0.1');*/

	server.on('clientError', function(exception, socket) {
	    try {
	    	if (socket.parser.incoming.url === '/grid/register') {
	    		return;
	    	}
	    } catch (e) {}

	    if (exception.message.indexOf('ECONNRESET') > -1) {
	    	log.debug(exception);
	    	return;
	    }
	    
	    log.warn('!error: client error');
	    log.warn(exception);
	    log.warn(exception.stack);
	    log.warn(socket);
	});

	process.on('SIGTERM', function() {
		// TODO: reimplememnt so it will respect that processPendingRequest()
        // processes not all pending requests on single call
        if (registry.pendingRequests.length > 0) {
			log.warn('Can\'t stop hub just yet, pending requests!');
			// try now
			registry.processPendingRequest();
			return;
		}

		log.info('Stopping hub');
		server.close();
	});

	process.on('uncaughtException', function(err) {
		log.warn('! Uncaught Exception occurred');
		log.warn(err);
		log.warn(err.stack);
	});

    // TODO: reimplement, so the tests will work
	//server.on('close', function() {
	//	store.quit();
	//	process.exit();
	//});

    return defer.promise.nodeify(cb);
}

module.exports = main;

if (require.main === module) {
	main(parser.parseArgs()).done();
}
