'use strict';

var CommonImpl = require('./CommonImpl'),
    constants = require('./constants'),
    q = require('q'),
    inherit = require('inherit'),
    apps = require('../http-apps'),
    normalizeCapabilities = require('../capability-utils').normalizeCapabilities;

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
        if (req.pathname === '/wd/hub/session') {
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

    getRequestCapabilities: function(req) {
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

    parseProxyResponse: function(res) {
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

    getNewSessionResponse: function(session) {
        return this.seleniumResponse(0, session.capabilities, session.getId());
    },

    getEndSessionRequest: function(session) {
        return {
            path: '/wd/hub/session/' + session.getId(),
            method: 'DELETE'
        }
    },

    seleniumResponse: function(status, value, sessionId) {
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
});
