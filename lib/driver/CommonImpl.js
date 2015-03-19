var inherit = require('inherit'),
    q = require('q'),
    capabilityMatcher = require('../capabilityMatcher'),
    proxy = require('../proxy'),
    apps = require('../http-apps'),
    seleniumResponse = require('./util').seleniumResponse;

/**
 * @class
 */
module.exports = inherit(/** @lends CommonImpl.prototype */ {
    getProtocol: function() {
        throw new Error('getProtocol() not implemented');
    },

    getRequestType: function(req) {
        return q.reject(new Error('getRequestType(req) not implemented'));
    },

    newSession: function(req, registry) {
        var self = this,
            desiredCaps = self._getCapabilities(req);

        // TODO: handle create session errors and return selenium error response
        return registry.getNewSession(desiredCaps)
            .then(function(session) {
                // return capabilities received from the node
                return self._newSessionResponse(session);
            });

        // find and lock node
        return self._findAndLockNode(desiredCaps)
            .then(function(node) {
                // send request to node
                return self._proxyRequestToNode(req, node)
                    .then(function(res) {
                        // process response
                        return self._parseProxyResponse(res)
                            .catch(function(err) {
                                // TODO: implement new session retries with default timeout: 2000 + retries * 500
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

    getSessionInfo: function(req, registry) {
        return q.reject(new Error('Not implemented'));
    },

    endSession: function(req, registry) {
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

    runCommand: function(req, registry) {
        // TODO: implement command timeout
        return this._proxyRequest(req);
    },

    _proxyRequest: function(req) {
        var self = this;
        // get session for request
        return self._getRequestSession(req)
            .then(function(session) {
                // touch session so it won't timeout
                session.lastSentTime = (new Date()).getTime();

                // TODO: should we store lastSentBody for later debugging?
                //session.lastSendBody = req.url + ', ' + JSON.stringify(parameters);
                //session.lastSentBody = req.method + ': ' + req.url + ', ' + JSON.stringify(parameters);

                return self._updateSession(session);
            })
            .then(function(session) {
                // get node for session
                return self._getSessionNode(session)
                    .then(function(node) {
                        // make end session request to the node
                        return self._proxyRequestToNode(req, node);
                    })
                    .tap(function() {
                        session.lastUsed = (new Date()).getTime();

                        // TODO: should we update lastResponseTime?
                        //session.lastResponseTime = (new Date()).getTime();

                        // TODO: should we store lastResponseBody?
                        //session.lastResponseBody = res.statusCode + ' - ' + res.body;

                        return self._updateSession(session);
                    });
            });
    },

    _proxyRequestToNode: function(req, node) {
        var self = this;
        return apps.processJsonBody(proxy(req, node))
            .catch(function(err) {
                // TODO: handle session errors (remove session and node)
                //if (res.body.substring(0, 5).toUpperCase() === 'ERROR') {
                //    if (res.body.indexOf('session was already stopped') > - 1) {
                //        log.warn("Session stopped");
                //    }
                //}
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
        return capabilityMatcher(caps)
            .then(function(node) {
                if (!node) {
                    // TODO: add pending request only when throwOnCapabilityNotPresent
                    // hub config option is false
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

        // TODO: remove? (not used)
        if (desiredCaps.alias) {
            session.alias = desiredCaps.alias;
        }

        // TODO: should we update lastResponseTime?
        //session.lastResponseTime = (new Date()).getTime();

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
