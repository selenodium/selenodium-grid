var q = require('q'),
    http = require('q-io/http'),
    enableDestroy = require('server-destroy'),
    apps = require('./http-apps'),
    log = require('./log');

Error.stackTraceLimit = Infinity;

// servlets
var notImplementedServlet = require('./servlets/notImplemented'),
    welcomeServlet = require('./servlets/welcome'),
    apiHubServlet = require('./servlets/apiHub'),
    apiProxyServlet = require('./servlets/apiProxy'),
    apiTestSessionServlet = require('./servlets/apiTestSession'),
    registerServlet = require('./servlets/register'),
    unregisterServlet = require('./servlets/unregister'),
    requestServlet = require('./servlets/request');

var servletRoutes = {
    '/grid/api/hub': apiHubServlet,
    '/grid/api/proxy': apiProxyServlet,
    '/grid/api/testsession': apiTestSessionServlet,
    '/grid/driver': notImplementedServlet,
    '/grid/resources': notImplementedServlet,
    '/lifecycle-manager': notImplementedServlet,
    '/grid/register': registerServlet,
    '/grid/unregister': unregisterServlet,
    '/selenium-server/driver': requestServlet,
    '/wd/hub/status': notImplementedServlet,
    '/wd/hub/sessions': notImplementedServlet,
    '/wd/hub/session': requestServlet
};

module.exports = function(registry) {
    var server = http.Server(function(req, res) {
        var app = apps.HubRouter(route, registry);
        app = apps.HandleJsonResponses(app);
        app = apps.HandleJsonRequests(app);
        app = apps.HandleUrlEncodedRequests(app);
        app = apps.HandleRejections(app); // must follow after HandleJsonResponses()
        app = apps.ParseQuery(app);
        app = apps.Log(app, log.info, fwd); // must follow before Debug()
        app = apps.Debug(app); // must follow after HandleRejections() and Log()
        app = attachEventListeners(app);

        return app(req, res);
    });

    // add destroy() method
    enableDestroy(server.node);
    server.destroy = function() {
        return q(server.node).nmcall('destroy');
    };

    server.node.httpAllowHalfOpen = true;

    server.node.on('clientError', function(err, sock) {
   	    try {
   	    	if (sock.parser.incoming.url === '/grid/register') {
   	    		return;
   	    	}
   	    } catch (e) {}

   	    if (err.message.indexOf('ECONNRESET') > -1) {
   	    	log.debug(err);
   	    	return;
   	    }

   	    log.warn('!error: client error');
   	    log.warn(err.stack);
   	    log.warn(sock);
   	});

    return server;
};

function fwd(message) {
    return message;
}

function route(req) {
    var app = servletRoutes[req.path];
    if (app) {
        return app;
    }

    // slower lookup of routes
    for (var route in servletRoutes) {
        if (route === req.path.substring(0, route.length)) {
            return servletRoutes[route];
        }
    }

    // root
    if (req.path === '/') {
        return welcomeServlet;
    }

    // 404
    return apps.notFound;
}

function attachEventListeners(app) {
    return function(req, res) {
        req.node.on('close', function() {
            log.warn('!warn: request socket closed');
        });
        req.node.on('error', function(err) {
            log.warn(err.stack || err);
        });

        res.node.on('close', function() {
            log.warn('!warn: response socket closed before we could send');
        });
        res.node.on('error', function(err) {
            log.warn(err.stack || err);
        });

        var timeout = q.defer();

        // Set socket timeout for 60 sec as in Selenium Hub
        res.node.socket.removeAllListeners('timeout');
        res.node.socket.setTimeout(60 * 1000);
        res.node.socket.once('timeout', function() {
            try {
                res.node.writeHead(500, {'Content-Type': 'text/plain'});
                res.node.end('Error: Socket timed out after 6 minutes');
            } catch (e) {}
            try {
                res.node.socket.destroy();
            } catch (e) {}

            timeout.resolve();
        });

        return q.race([timeout.promise, app(req, res)]);
    }
}
