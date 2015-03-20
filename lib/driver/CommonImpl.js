var inherit = require('inherit'),
    q = require('q'),
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
        var self = this;

        // TODO: handle create session errors and return selenium error response
        return registry.getNewSession(req)
            .then(function(session) {
                if (!session) {
                    return q.reject(seleniumResponse(33));
                }
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
        // TODO: handle session errors (remove session and node)
        //if (res.body.substring(0, 5).toUpperCase() === 'ERROR') {
        //    if (res.body.indexOf('session was already stopped') > - 1) {
        //        log.warn("Session stopped");
        //    }
        //}
        return apps.processJsonBody(proxy(req, node));
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
