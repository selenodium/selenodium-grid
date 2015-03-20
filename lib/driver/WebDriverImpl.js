var CommonImpl = require('./CommonImpl'),
    constants = require('./constants'),
    q = require('q'),
    inherit = require('inherit'),
    apps = require('../http-apps'),
    normalizeCapabilities = require('../normalizeCaps');
    seleniumResponse = require('./util').seleniumResponse;

var reSessionGet = new RegExp('^/wd/hub/session/[^\/]+$'),
    reSessionCmd = new RegExp('^/wd/hub/session/[^\/]+/.+?$'),
    reSessionId = new RegExp('^/wd/hub/session/([^\/]+)');

/**
 * @class
 * @extends CommonImpl
 */
module.exports = inherit(CommonImpl, /** @lends WebDriverImpl.prototype */ {
    getProtocol: function() {
        return constants.WebDriver;
    },

    getRequestType: function(req) {
        if (req.path == '/wd/hub/session') {
            if (req.method === 'POST') {
                return q(constants.SESSION_NEW);
            }

            // Method not allowed error
            // TODO: should include Allows header with POST method
            return apps.statusResponse(req, 405);
        }

        if (reSessionGet.test(req.path)) {
            switch (req.method) {
                case 'GET':
                    return q(constants.SESSION_GET);
                case 'DELETE':
                    return q(constants.SESSION_END);
                default:
                    // Method not allowed error
                    // TODO: should include Allows header with GET and DELETE method
                    return apps.statusResponse(req, 405);
            }
        }

        if (reSessionCmd.test(req.path)) {
            return q(constants.SESSION_CMD);
        }

        return q.reject(new Error('Could not determine request type'));
    },

    getSessionInfo: function(req, registry) {
        return this._getRequestSession(req, registry)
            .then(function(session) {
                return seleniumResponse(0, session.capabilities, session.getId());
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
        return seleniumResponse(0, session.capabilities, session.getId());
    }
});

