var q = require('q'),
    http = require('q-io/http'),
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
            port: 5590,
            nodeConfig: 'config.json',
            host: '127.0.0.1',
            cleanUpCycle: 10000,
            browserTimeout: 20000,
            hubHost: '10.0.1.6',
            registerCycle: 5000,
            debug: '',
            hub: 'http://10.0.1.6:4444/grid/register',
            log: 'test.log',
            url: 'http://127.0.0.1:4444',
            remoteHost: 'http://127.0.0.1:4444',
            register: true,
            proxy: 'org.openqa.grid.selenium.proxy.DefaultRemoteProxy',
            maxSession: 1,
            role: 'node',
            hubPort: 4444
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

function createNodeMock(opts, cb) {
    return http
        .Server(function(req, res) {
            var uri = req.path,
                sessionID = testData.getSessionID();

            if (determineProtocol(uri) === 'WebDriver') {
                // WebDriver
                if (uri.indexOf('/session') > -1 && req.method.toUpperCase() !== 'DELETE') {
                    res.node.writeHead(302, {'Location': '/wd/hub/session/' + sessionID});
                    res.node.end();
                } else if (req.method.toUpperCase() === 'DELETE') {
                    res.node.writeHead(200, {'Content-Type': 'text/plain'});
                    res.node.end('');
                }
            } else {
                // RC
                if (uri.indexOf('getNewBrowserSession') > -1) {
                    res.node.writeHead(200, {'Content-Type': 'text/plain'});
                    res.node.end('OK,' + sessionID);
                } else if (uri.indexOf('testComplete') > -1) {
                    res.node.writeHead(200, {'Content-Type': 'text/plain'});
                    res.node.end('OK');
                }
            }
        })
        .listen(opts.port || 4444, opts.host || '127.0.0.1')
        .then(function(server) {
            // add destroy() method
            enableDestroy(server.node);

            server.destroy = function() {
                return q(server.node).nmcall('destroy');
            };

            return server;
        })
        .nodeify(cb);
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
    return supertest(app)
        .get('/grid/unregister?id=' + getServerAddress(mock))
        .expect(200, 'OK - Bye')
        .then(function() {
            return mock.destroy();
        })
        .nodeify(cb);
}

function getServerAddress(server, path) {
    var addr = server.address(),
        protocol = server instanceof HttpsServer ? 'https' : 'http';
    return protocol + '://' + addr.address + ':' + addr.port + (path || '');
}

function getWDSessionId(res) {
    return res.headers.location.replace('/wd/hub/session/', '');
}

function getRCSessionId(res) {
    return res.text.replace('OK,', '');
}

function determineProtocol(url) {
    return url.indexOf('/selenium-server/driver') > -1 ? 'RC' : 'WebDriver';
}

exports.createRegisterPost = createRegisterPost;
exports.createNodeMock = createNodeMock;
exports.createAndRegisterNodeMock = createAndRegisterNodeMock;
exports.unregisterNodeMock = unregisterNodeMock;
exports.getWDSessionId = getWDSessionId;
exports.getRCSessionId = getRCSessionId;
exports.determineProtocol = determineProtocol;
