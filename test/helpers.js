var q = require('q'),
    http = require('q-io/http'),
    apps = require('q-io/http-apps'),
    HttpsServer = require('https').Server,
    extend = require('extend'),
    enableDestroy = require('server-destroy'),
    supertest = require('./q-supertest'),
    testData = require('./testdata');

function createRegisterPost(opts) {
    // do not mutate source opts
    opts = extend(true, {}, opts);

    var res = {
        class: 'org.openqa.grid.common.RegistrationRequest',
        capabilities: [{
            platform: 'WINDOWS',
            seleniumProtocol: 'Selenium',
            browserName: 'firefox',
            maxInstances: 1,
            version: '9',
            alias: 'FF9'
        }],
        configuration: {
            nodeConfig: 'config.json',
            host: '127.0.0.1',
            port: 5590,
            url: 'http://127.0.0.1:5590',
            remoteHost: 'http://127.0.0.1:5590',
            role: 'node',
            hub: 'http://10.0.1.6:4444/grid/register',
            hubHost: '10.0.1.6',
            hubPort: 4444,
            register: true,
            cleanUpCycle: 10000,
            browserTimeout: 20000,
            registerCycle: 5000,
            proxy: 'org.openqa.grid.selenium.proxy.DefaultRemoteProxy',
            maxSession: 1,
            log: 'test.log',
            debug: ''
        }
    };

    // set caps
    if (opts.caps) {
        res.capabilities = Array.isArray(opts.caps)? opts.caps : [opts.caps];
        delete opts.caps;
    }

    // set url and remoteHost based on host and port
    if (opts.port || opts.host) {
        var url = 'http://' + (opts.host || res.configuration.host) + ':' + (opts.port || res.configuration.port);
        opts.url = opts.url || url;
        opts.remoteHost = opts.remoteHost || url;
    }

    // set hub based on hubHost
    if (opts.hubHost && !opts.hub) {
        opts.hub = 'http://' + opts.hubHost + ':4444/grid/register';
    }

    res.configuration = extend(res.configuration, opts);

    return res;
}

function createNodeUrl(opts) {
    // do not mutate source opts
    opts = extend({host: '127.0.0.1', port: 5590}, opts);
    return 'http://' + opts.host + ':' + opts.port;
}

function createNodeMock(opts, cb) {
    var host = opts.host || '127.0.0.1',
        port = opts.port || 4444,
        app = nodeMockApp;

    app = apps.ParseQuery(app);
    app = apps.HandleJsonResponses(app);

    return http
        .Server(app)
        .listen(port, host)
        .then(function(server) {
            // add destroy() method
            enableDestroy(server.node);

            server.destroy = function() {
                return q(server.node).nmcall('destroy');
            };

            return server;
        })
        .catch(function(err) {
            err.message = util.format('Could not start server on %s:%s\n', host, port) + err.message;
            return q.reject(err);
        })
        .nodeify(cb);
}

function nodeMockApp(req, res) {
    var uri = req.path,
        sessionId = testData.getSessionID();

    if (determineProtocol(uri) === 'WebDriver') {
        // WebDriver
        if (uri.indexOf('title') > -1) {
            return {
                status: 200,
                headers: {},
                data: {status: 0, value: req.query.title || 'title'}
            };
        }
        if (uri.indexOf('/session') > -1 && req.method.toUpperCase() !== 'DELETE') {
            return {
                status: 200,
                headers: {},
                data: {sessionId: sessionId, status: 0}
            };
        }
        if (req.method.toUpperCase() === 'DELETE') {
            return {
                status: 200,
                headers: {},
                data: {status: 0}
            };
        }
        return {
            status: 500,
            headers: {},
            data: {status: 13}
        };
    } else {
        // RC
        var cmd = req.query.cmd;
        if (cmd === 'title') {
            return apps.content(req.query.title || 'title', 'text/plain', 200);
        }
        if (cmd == 'getNewBrowserSession') {
            return apps.content('OK,' + sessionId, 'text/plain', 200);
        }
        if (cmd === 'testComplete') {
            return apps.content('OK', 'text/plain', 200);
        }
        return app.content('ERROR: Unknown error', 'text/plain', 500);
    }
}

function location(location, status) {
    return {
        status: status || 301,
        headers: {Location: location},
        body: ''
    }
}

function createAndRegisterNodeMock(app, opts, cb) {
    return createNodeMock(opts)
        .then(function(server) {
            return registerNodeMock(app, opts)
                .thenResolve([server, app]);
        })
        .nodeify(cb);
}

function registerNodeMock(app, opts, cb) {
    return q(app)
        .then(function(app) {
            return supertest(app)
                .post('/grid/register')
                .send(createRegisterPost(opts))
                .expect(200, 'OK - Welcome');
        })
        .nodeify(cb);
}

function unregisterNodeMock(app, mock, cb) {
    return q.all([app, mock])
        .spread(function(app, mock) {
            return supertest(app)
                .get('/grid/unregister?id=' + getServerAddress(mock))
                .expect(200, 'OK - Bye')
                .then(function() {
                    return mock.destroy();
                })
        })
        .nodeify(cb);
}

function getServerAddress(server, path) {
    var addr = server.address(),
        protocol = server instanceof HttpsServer ? 'https' : 'http';
    return protocol + '://' + addr.address + ':' + addr.port + (path || '');
}

function getWDSessionId(res) {
    if (res.body.sessionId) {
        return res.body.sessionId;
    }
    if (res.status === 302 && res.headers.location) {
        return res.headers.location.replace('/wd/hub/session/', '');
    }
    throw Error('Could not extract session ID from response');
}

function getRCSessionId(res) {
    return res.text.substring(3);
}

function determineProtocol(url) {
    return url.indexOf('/selenium-server/driver') > -1 ? 'RC' : 'WebDriver';
}

exports.createRegisterPost = createRegisterPost;
exports.createNodeUrl = createNodeUrl;
exports.createNodeMock = createNodeMock;
exports.createAndRegisterNodeMock = createAndRegisterNodeMock;
exports.unregisterNodeMock = unregisterNodeMock;
exports.getWDSessionId = getWDSessionId;
exports.getRCSessionId = getRCSessionId;
exports.determineProtocol = determineProtocol;
