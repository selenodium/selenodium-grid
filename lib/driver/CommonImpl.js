'use strict';

var inherit = require('inherit'),
    q = require('q'),
    extend = require('extend'),
    proxy = require('../proxy'),
    apps = require('../http-apps'),
    log = require('../log');

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

    getNewSessionFromNode: function(req, node) {
        var self = this,
            caps = self.getRequestCapabilities(req);

        // send open session request
        return self.proxyRequestToNode(req, node)
            .then(function(res) {
                // process response
                return self.parseProxyResponse(res);
            })
            .spread(function(sessionId, resCaps) {
                return {
                    sessionId: sessionId,
                    capabilities: resCaps,
                    desiredCapabilities: caps
                }
            })
            .catch(function(err) {
                log.debug('Error ocured during session opening on node with ID=%s', node.getId());
                log.debug(err.stack || err);
                return q.reject(err);
            });
    },

    endSessionOnNode: function(session, node) {
        // TODO: make number of retries configurable?
        var req = extend({retries: 3}, this.getEndSessionRequest(session));
        return this.proxyRequestToNode(req, node);
    },

    getEndSessionRequest: function(session, node) {
        throw new Error('getEndSessionRequest() not implemented');
    },

    proxyRequestToNode: function(req, node) {
        // TODO: handle session errors (remove session and node)
        /*if (res.body.substring(0, 5).toUpperCase() === 'ERROR') {
            if (res.body.indexOf('session was already stopped') > - 1) {
                log.warn("Session stopped");
            }
        }*/
        return apps.processJsonBody(proxy(req, node));
    }
});
