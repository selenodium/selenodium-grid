var CommonImpl = require('./CommonImpl'),
    constants = require('./constants'),
    q = require('q'),
    inherit = require('inherit'),
    extend = require('extend'),
    apps = require('../http-apps'),
    normalizeCapabilities = require('../capability-utils').normalizeCapabilities;

/**
 * @class
 * @extends CommonImpl
 */
module.exports = inherit(CommonImpl, /** @lends RCImpl.prototype */ {
    getProtocol: function() {
        return constants.RC;
    },

    getRequestType: function(req) {
        var type;
        switch (req.query.cmd) {
            case 'getNewBrowserSession':
                type = constants.SESSION_NEW;
                break;
            case 'testComplete':
                type = constants.SESSION_END;
                break;
            default:
                type = constants.SESSION_CMD;
                break;
        }
        return q(type);
    },

    _getRequestParams: function(req) {
        // merge GET and POST body params
        return extend({}, req.query, req.data);
    },

    getRequestSessionId: function(req) {
        return this._getRequestParams(req).sessionId;
    },

    getRequestCapabilities: function(req) {
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

    parseProxyResponse: function(res) {
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

    getNewSessionResponse: function(session) {
        return apps.content('OK,' + session.sessionId, 'text/plain', 200);
    },

    getEndSessionRequest: function(session) {
        return {
            path: '/selenium-server/driver?cmd=testComplete&sessionId=' + session.getId(),
            method: 'POST'
        }
    }
});
