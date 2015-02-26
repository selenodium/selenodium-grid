var http = require('http'),
    https = require('https'),
    extend = require('extend'),
    request = require('supertest'),
    enableDestroy = require('server-destroy'),
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

function createWebDriverNodeMock(opts, cb) {
    var server = http
        .createServer(function(req, res) {
            var url = req.url.toString(),
                sessionID = testData.getSessionID();

            if (url.indexOf('/session') > -1 && req.method.toUpperCase() !== 'DELETE') {
                res.writeHead(302, {'Location': '/wd/hub/session/' + sessionID});
                res.end();
            } else if (req.method.toUpperCase() === 'DELETE') {
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end('');
            }
        })
        .listen(opts.port || 4444, opts.host || '127.0.0.1', function(err) {
            cb(err, server);
        });

    // add destroy() method
    enableDestroy(server);

    return server;
}

function createAndRegisterWebDriverNodeMock(app, opts, cb) {
    return createWebDriverNodeMock(opts, function(err) {
        if (err) {
            done(err);
            return;
        }

        registerNodeMock(app, opts, function(err, res) {
            cb(err);
        });
    });
}

function registerNodeMock(app, opts, cb) {
    request(app)
        .post('/grid/register')
        .send(createRegisterPost(opts))
        .expect(200, 'OK - Welcome')
        .end(cb);
}

function unregisterNodeMock(app, mock, cb) {
    request(app)
        .get('/grid/unregister?id=' + getServerAddress(mock))
        .expect(200, 'OK - Bye')
        .end(function(err, res) {
            if (err) {
                cb(err);
                return;
            }
            mock.destroy(cb);
        });
}

function getServerAddress(server, path) {
    var addr = server.address(),
        protocol = server instanceof https.Server ? 'https' : 'http';
    return protocol + '://' + addr.address + ':' + addr.port + (path || '');
}

function getSessionId(res) {
    return res.headers.location.replace('/wd/hub/session/', '');
}

exports.createRegisterPost = createRegisterPost;
exports.createWebDriverNodeMock = createWebDriverNodeMock;
exports.createAndRegisterWebDriverNodeMock = createAndRegisterWebDriverNodeMock;
exports.unregisterNodeMock = unregisterNodeMock;
exports.getSessionId = getSessionId;
