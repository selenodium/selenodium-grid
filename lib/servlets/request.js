var log = require('../log'),
    registry = require('../registry'),
    models = require('../models'),
    store = require('../store'),
    capabilityMatcher = require('../capabilitymatcher'),
    proxy = require('../proxy'),
    apps = require('../http-apps'),
    url = require('url'),
    q = require('q'),
    inherit = require('inherit'),
    util = require('util'),
    extend = require('extend');

module.exports = function(req, res) {
    var proto = getSeleniumProtocol(req),
        driver = getDriver(proto);

    return driver.getRequestType(req)
        .catch(function(err) {
            // Not found error
            return apps.statusResponse(req, 404, err.message);
        })
        .then(function(type) {
            // TODO: implement command timeout
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
};

// 9 UnknownCommand - The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource
// 13 UnknownError - An unknown server-side error occurred while processing the command.
// 33 SessionNotCreatedException - A new session could not be created.

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

/**
 * @class
 */
var CommonImpl = inherit(/** @lends CommonImpl.prototype */ {
    getProtocol: function() {
        throw new Error('getProtocol() not implemented');
    },

    getRequestType: function(req) {
        return q.reject(new Error('getRequestType(req) not implemented'));
    },

    newSession: function(req) {
        var self = this,
            desiredCaps = self._getCapabilities(req);

        // find and lock node
        return self._findAndLockNode(desiredCaps)
            .then(function(node) {
                // send request to node
                return self._proxyRequestToNode(req, node)
                    .then(function(res) {
                        // process response
                        return self._parseProxyResponse(res)
                            .catch(function(err) {
                                // unlock node in case of error and return response to the client
                                return self._unlockNode(node)
                                    .thenReject(err);
                            })
                            .spread(function(sessionId, resCaps) {
                                // add session to the store
                                return self._addSession(self._createSession(sessionId, node, resCaps, desiredCaps));
                            });
                    });
            })
            .then(function(session) {
                // return capabilities received from the node
                return self._newSessionResponse(session);
            });
    },

    getSessionInfo: function(req) {
        return q.reject(new Error('Not implemented'));
    },

    endSession: function(req) {
        var self = this;
        // get session for request
        return self._getRequestSession(req)
            .then(function(session) {
                // get node for session
                return self._getSessionNode(session)
                    .then(function(node) {
                        // make end session request to the node
                        return self._proxyRequestToNode(req, node);
                    })
                    .tap(function() {
                        // remove session from registry
                        return self._removeSession(session);
                    });
            });
    },

    runCommand: function(req) {
        return this._proxyRequest(req);
    },

    _proxyRequest: function(req) {
        var self = this;
        // get session for request
        return self._getRequestSession(req)
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
                        return self._proxyRequestToNode(req, node);
                    })
                    .tap(function() {
                        session.lastUsed = (new Date()).getTime();
                        return self._updateSession(session);
                    });
            });
    },

    _proxyRequestToNode: function(req, node) {
        var self = this;
        return apps.processJsonBody(proxy(req, node))
            .catch(function(err) {
                return self._removeNode(node)
                    .thenReject(err);
            });
    },

    _findAndLockNode: function(caps) {
        var self = this;
        // find node
        return self._findNode(caps)
            .then(function(node) {
                // lock node
                return self._lockNode(node)
                    .thenResolve(node);
            });
    },

    _findNode: function(caps) {
        return capabilityMatcher.findNode(caps)
            .then(function(node) {
                if (!node) {
                    // TODO: should add pending with timeout?
                    return registry.addPendingRequest(caps);
                }
                return node;
            })
            .catch(function(err) {
                // TODO: more descriptive error; replace magic number with const name
                // TODO: move seleniumResponse() out of this method; should handle rejection outside
                return q.reject(seleniumResponse(33));
            });
    },

    _lockNode: function(node) {
        return store.removeAvailableNode(node.host, node.port);
    },

    _unlockNode: function(node) {
        return store.addAvailableNode(node);
    },

    _removeNode: function(node) {
        return registry.removeNode(node.host, node.port);
    },

    _getSessionNode: function(session) {
        return store.getNode(session.nodeHost, session.nodePort);
    },

    _createSession: function(sessionId, node, caps, desiredCaps) {
        var time = (new Date()).getTime(),
            session = new models.Session(this.getProtocol(), node.host, node.port, sessionId);
        // TODO: remove? (not used)
        session.platform = caps.platform;
        session.capabilities = caps;
        session.desiredCapabilities = desiredCaps;
        session.startTime = time;
        session.lastSentTime = time;
        return session;
    },

    _addSession: function(session) {
        return registry.addSession(session.sessionId, session);
    },

    _getSession: function(sessionId) {
        return registry.getSessionById(sessionId)
            .then(function(session) {
                if (!session) {
                    // wrong session, or session has ended already?
                    return q.reject(new Error('Unknown sessionId: ' + sessionId));
                }
                return session;
            });
    },

    _updateSession: function(session) {
        return store.updateSession(session)
            .thenResolve(session);
    },

    _removeSession: function(session) {
        return registry.removeSession(session.sessionId);
    },

    _getRequestSession: function(req) {
        return this._getSession(this._getRequestSessionId(req))
            .catch(function(err) {
                return apps.statusResponse(req, 404, err.message);
            });
    }
});

/**
 * @class
 * @extends CommonImpl
 */
var WebDriverImpl = inherit(CommonImpl, /** @lends WebDriverImpl.prototype */ {
    getProtocol: function() {
        return WD;
    },

    getRequestType: function(req) {
        if (req.path == '/wd/hub/session') {
            if (req.method === 'POST') {
                return q(SESSION_NEW);
            }

            // Method not allowed error
            // TODO: should include Allows header with POST method
            return apps.statusResponse(req, 405);
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
                    return apps.statusResponse(req, 405);
            }
        }

        if (reSessionCmd.test(req.path)) {
            return q(SESSION_CMD);
        }

        return q.reject(new Error('Could not determine request type'));
    },

    getSessionInfo: function(req) {
        return this._getRequestSession(req)
            .then(function(session) {
                return seleniumResponse(0, session.capabilities);
            });
    },

    _getRequestSessionId: function(req) {
        return this._getPathSessionId(req.path);
    },

    _getPathSessionId: function(path) {
        var match = path.match(reSessionId);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    },

    _getCapabilities: function(req) {
        // TODO: support requiredCapabilities
        // https://code.google.com/p/selenium/wiki/JsonWireProtocol#POST_/session
        return normalizeCapabilities(req.data.desiredCapabilities);
    },

    _getResponseSessionId: function(res) {
        var sessionId = null;
        if (res.data && res.data.sessionId) {
            sessionId = res.data.sessionId;
        } else if (res.headers.location) {
            sessionId = this._getPathSessionId(res.headers.location);
        }
        return q(sessionId);
    },

    _parseProxyResponse: function(res) {
        return this._getResponseSessionId(res)
            .then(function(sessionId) {
                var data = res.data;

                // TODO: replace 0 with constant name
                if (!data || data.status !== 0 || !sessionId) {
                    return q.reject(res);
                }

                var caps = data && data.value || {};
                return [sessionId, caps];
            });
    },

    _newSessionResponse: function(session) {
        return seleniumResponse(0, session.capabilities, session.sessionId);
    }
});

/**
 * @class
 * @extends CommonImpl
 */
var RCImpl = inherit(CommonImpl, /** @lends RCImpl.prototype */ {
    getProtocol: function() {
        return RC;
    },

    getRequestType: function(req) {
        var type;
        switch (req.query.cmd) {
            case 'getNewBrowserSession':
                type = SESSION_NEW;
                break;
            case 'testComplete':
                type = SESSION_END;
                break;
            default:
                type = SESSION_CMD;
                break;
        }
        return q(type);
    },

    _getRequestParams: function(req) {
        // merge GET and POST body params
        return extend({}, req.query, req.data);
    },

    _getRequestSessionId: function(req) {
        return this._getRequestParams(req).sessionId;
    },

    _getCapabilities: function(req) {
        var params = this._getRequestParams(req),
            caps = {};

        if (typeof params['1'] !== 'undefined') {
            caps.browserName = params['1'];
        }

        // TODO: do not loose url in params['2']

        if (typeof params['4'] !== 'undefined') {
            var extraCaps = decodeURIComponent(params['4'].replace(/\+/g, '%20')).split(';');
            extraCaps.forEach(function(capStr) {
                var components = capStr.split('=');
                if (components.length === 2) {
                    caps[components[0]] = components[1];
                }
            });
        }

        return normalizeCapabilities(caps);
    },

    _getResponseSessionId: function(res) {
        return res.body.read()
            .then(function(body) {
                body = body.toString();
                if (body.substring(0, 3) === 'OK,') {
                    return body.substring(3);
                }
                return null;
            });
    },

    _parseProxyResponse: function(res) {
        return this._getResponseSessionId(res)
            .then(function(sessionId) {
                if (res.status !== 200 || !sessionId) {
                    // fix status
                    res.status = 500;
                    return q.reject(res);
                }
                return [sessionId, {}];
            });
    },

    _newSessionResponse: function(session) {
        return apps.content('OK,' + session.sessionId, 'text/plain', 200);
    }
});

var drivers = {
    WebDriver: new WebDriverImpl(),
    RC: new RCImpl()
};

function getDriver(protocol) {
    return drivers[protocol];
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
