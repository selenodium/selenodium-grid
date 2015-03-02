var log = require('../log'),
    registry = require('../registry'),
    models = require('../models'),
    store = require('../store'),
    capabilityMatcher = require('../capabilitymatcher'),
    qHttpWrapper = require('../qHttpWrapper'),
    proxy = require('../proxy'),
    apps = require('q-io/http-apps'),
    url = require('url'),
    q = require('q'),
    util = require('util');

Error.stackTraceLimit = Infinity;

exports.handleRequest = function(req, res, cb) {
    var app = mainApp;
    app = HandleJsonRequests(app);
    app = apps.HandleJsonResponses(app);
    app = HandleRejections(app);
    app = apps.Log(app); // must follow before Debug()
    app = apps.Debug(app); // must follow after HandleRejections() and Log()
    app = apps.ParseQuery(app);

    qHttpWrapper(req, res, app)
        .then(cb)
        .done(); // is not really needed
};

// 9 UnknownCommand - The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource
// 13 UnknownError - An unknown server-side error occurred while processing the command.
// 33 SessionNotCreatedException - A new session could not be created.

function mainApp(req, res) {
    var proto = getSeleniumProtocol(req),
        driver = getDriver(proto);

    return driver.getRequestType(req)
        .then(function(type) {
            switch (type) {
                case SESSION_NEW:
                    return driver.newSession(req);
                case SESSION_GET:
                    return driver.getSessionInfo(req);
                case SESSION_END:
                    return driver.endSession(req);
                case SESSION_CMD:
                    return driver.runCommand(req);
            }
        });
}

var WD = 'WebDriver',
    RC = 'RC';

function getSeleniumProtocol(req) {
    return (req.path.indexOf('/selenium-server/driver') > -1) ? RC : WD;
}

var SESSION_NEW = 'new',
    SESSION_END = 'end',
    SESSION_GET = 'get',
    SESSION_CMD = 'cmd';

var reSessionGet = new RegExp('^/wd/hub/session/[^\/]+$'),
    reSessionCmd = new RegExp('^/wd/hub/session/[^\/]+/.+?$'),
    reSessionId = new RegExp('^/wd/hub/session/([^\/]+)');

var WebDriverImpl = {
    /**
     * @param req {ServerRequest}
     * @returns {Promise}
     */
    getRequestType: function(req) {
        if (req.path == '/wd/hub/session') {
            if (req.method === 'POST') {
                return q(SESSION_NEW);
            }

            // Method not allowed error
            // TODO: should include Allows header with POST method
            return statusResponse(req, 405);
        }

        if (reSessionGet.test(req.path)) {
            switch (req.method) {
                case 'GET':
                    return q(SESSION_GET);
                case 'DELETE':
                    return q(SESSION_END);
                default:
                    // Method not allowed error
                    // TODO: should include Allows header with GET and DELETE method
                    return statusResponse(req, 405);
            }
        }

        if (reSessionCmd.test(req.path)) {
            return q(SESSION_CMD);
        }

        // Not found error
        return statusResponse(req, 404);
    },

    getRequestSessionId: function(req) {
        return this._getPathSessionId(req.path);
    },

    _getPathSessionId: function(path) {
        var match = path.match(reSessionId);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    },

    getResponseSessionId: function(res) {
        if (res.data && res.data.sessionId) {
            return res.data.sessionId;
        }
        if (res.headers.location) {
            return this._getPathSessionId(res.headers.location);
        }
        return null;
    },

    getCapabilities: function(req) {
        // TODO: support requiredCapabilities
        // https://code.google.com/p/selenium/wiki/JsonWireProtocol#POST_/session
        return normalizeCapabilities(req.data.desiredCapabilities);
    },

    newSession: function(req) {
        var self = this,
            desiredCaps = self.getCapabilities(req);

        // find and lock node
        return self._findAndLockNode(desiredCaps)
            .spread(function(node, nodeCaps) {
                // send request to node
                return self.proxyRequestToNode(req, node)
                    .then(function(res) {
                        // get sessionId
                        var sessionId = self.getResponseSessionId(res),
                            data = res.data;

                        // TODO: replace 0 with constant name
                        if (!data || data.status !== 0 || !sessionId) {
                            // unlock node in case of error and return response to the client
                            return self._unlockNode(node)
                                .thenReject(res);
                        }

                        var resCaps = data && data.value || {};

                        // add session to the store
                        return self._addSession(self._createSession(sessionId, node, resCaps, desiredCaps));
                    });
            })
            .then(function(session) {
                // return capabilities received from the node
                return seleniumResponse(0, session.capabilities, session.sessionID);
            });
    },

    proxyRequest: function(req) {
        var self = this;
        // get session for request
        return self.getRequestSession(req)
            .then(function(session) {
                // touch session so it won't timeout
                session.lastSentTime = (new Date()).getTime();
                return self._updateSession(session);
            })
            .then(function(session) {
                // get node for session
                return self._getSessionNode(session)
                    .then(function(node) {
                        // make end session request to the node
                        // TODO: handle session errors (remove session and node)
                        return self.proxyRequestToNode(req, node);
                    })
                    .tap(function() {
                        session.lastUsed = (new Date()).getTime();
                        return self._updateSession(session);
                    });
            });
    },

    proxyRequestToNode: function(req, node) {
        return processJsonBody(proxy(req, node))
    },

    _findAndLockNode: function(caps) {
        var self = this;
        // find node
        return self._findNode(caps)
            .spread(function(node, nodeCaps) {
                // lock node
                return self._lockNode(node)
                    .thenResolve([node, nodeCaps]);
            });
    },

    _findNode: function(caps) {
        var defer = q.defer();
        capabilityMatcher.findNode(caps, function(node, nodeCaps) {
            if (!node) {
                // TODO: more descriptive error; replace magic number with const name
                // TODO: move this out of this method; should handle rejection outside
                return defer.reject(seleniumResponse(33));
            }
            defer.resolve([node, nodeCaps]);
        });
        return defer.promise;
    },

    _lockNode: function(node) {
        var defer = q.defer();
        store.removeAvailableNode(node.host, node.port, function() {
            defer.resolve();
        });
        return defer.promise;
    },

    _unlockNode: function(node) {
        var defer = q.defer();
        store.addAvailableNode(node, function() {
            defer.resolve();
        });
        return defer.promise;
    },

    _getNode: function(host, port) {
        return q(store.getNode(host, port));
    },

    _getSessionNode: function(session) {
        return this._getNode(session.nodeHost, session.nodePort);
    },

    _createSession: function(sessionId, node, caps, desiredCaps) {
        var time = (new Date()).getTime(),
            session = new models.Session('WebDriver', node.host, node.port, sessionId);
        // TODO: remove? (not used)
        session.platform = caps.platform;
        session.capabilities = caps;
        session.desiredCapabilities = desiredCaps;
        session.startTime = time;
        session.lastSentTime = time;
        return session;
    },

    _addSession: function(session) {
        var defer = q.defer();
        registry.addSession(session.sessionID, session, null, function() {
            defer.resolve(session);
        });
        return defer.promise;
    },

    _getSession: function(sessionId) {
        var defer = q.defer();
        registry.getSessionById(sessionId, function(session) {
            if (!session) {
                // wrong session, or session has ended already?
                defer.reject(new Error('Unknown sessionId: ' + sessionId));
                return;
            }
            defer.resolve(session);
        });
        return defer.promise;
    },

    _updateSession: function(session) {
        var defer = q.defer();
        store.updateSession(session, function() {
            defer.resolve(session);
        });
        return defer.promise;
    },

    _removeSession: function(session) {
        var defer = q.defer();
        registry.removeSession(session.sessionID, function() {
            defer.resolve();
        });
        return defer.promise;
    },

    getRequestSession: function(req) {
        return this._getSession(this.getRequestSessionId(req))
            .fail(function(err) {
                return q.reject(apps.responseForStatus(req, 404, err.message));
            });
    },

    getSessionInfo: function(req) {
        return this.getRequestSession(req)
            .then(function(session) {
                return seleniumResponse(0, session.capabilities);
            });
    },

    endSession: function(req) {
        var self = this;
        // get session for request
        return self.getRequestSession(req)
            .then(function(session) {
                // get node for session
                return self._getSessionNode(session)
                    .then(function(node) {
                        // make end session request to the node
                        return self.proxyRequestToNode(req, node);
                    })
                    .tap(function() {
                        // remove session from registry
                        return self._removeSession(session);
                    });
            });
    },

    runCommand: function(req) {
        return this._proxyRequest(req);
    }
};

var RCImpl = {

};

var drivers = {
    WebDriver: WebDriverImpl,
    RC: RCImpl
};

function getDriver(protocol) {
    return drivers[protocol];
}

function statusResponse(req, status, addendum) {
    return q.reject(apps.responseForStatus(req, status, req.method + ' ' + req.path + (addendum ? '\n' + addendum : '')));
}

function seleniumResponse(status, value, sessionId) {
    status = status || 0;
    var data = {status: status};
    if (value) {
        data.value = value;
    }
    if (sessionId) {
        data.sessionId = String(sessionId);
    }
    return {
        // TODO: more precise HTTP status based on selenium status code
        status: status === 0 ? 200 : 500,
        headers: {},
        data: data
    };
}

function HandleRejections(app) {
    return function(req, res) {
        return q.fcall(app, req, res)
            .fail(function(err) {
                // real uncatched errors must pass through
                if (err instanceof Error) {
                    return q.reject(err);
                }
                // transform response rejections into normal responses
                return err;
            });
    }
}

function HandleJsonRequests(app) {
    return function(req, res) {
        return processJsonBody(req)
            .catch(function(err) {
                // TODO: should be 500 in case of syntax or any other error in processJsonBody() code
                return statusResponse(req, 400, err.stack || err);
            })
            .then(function(req) {
                return app(req, res);
            });
    }
}

function processJsonBody(obj) {
    return q(obj)
        .then(function(obj) {
            var contentType = obj.headers['content-type'];
            if (contentType && contentType.indexOf('json') > -1) {
                return obj.body.read()
                    .then(function(body) {
                        obj.data = JSON.parse(body);
                        return obj;
                    });
            }
            return obj;
        });
}

function normalizeCapabilities(caps) {
    var newCaps = {};

    Object.keys(caps)
        .forEach(function(key) {
            var normKey = normalizeKey(key);

            if (isBasicCapability(normKey)) {
                // version should always be a string
                newCaps[normKey] = (normKey === 'version') ? caps[key].toString() : caps[key];
                return;
            }

            // copy custom capabilities as is
            newCaps[key] = caps[key];
        });

    return new models.Capability(newCaps);
}

function normalizeKey(key) {
    var normKey = key.toLowerCase();

    // fix browserName key
    if (normKey === 'browsername') {
        normKey = 'browserName';
    }

    return normKey;
}

function isBasicCapability(key) {
    return key === 'browserName' || key === 'version' || key === 'platform';
}
