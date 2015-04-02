var inherit = require('inherit'),
    q = require('q'),
    List = require('collections/list'),
    util = require('util'),
    log = require('../log');

const DEFAULT_NEW_SESSION_WAIT_TIMEOUT = -1;

var SessionQueue = inherit({
    __constructor: function(config, nodes) {
        this.config = config;
        this.nodes = nodes;
        this.requests = new List(null, _listEquals);
        this.stop = true;
    },

    addRequest: function(req) {
        var r = new SessionRequest(req);
        this.requests.add(r);

        if (this.stop) {
            this.startProcessing();
        }

        return r.defer.promise;
    },

    removeRequest: function(req) {
        this.requests.delete(req);
    },

    getRequestCount: function() {
        return this.requests.length;
    },

    process: function() {
        var self = this;
        return q(self.requests.toArray())
            .invoke('map', function(req) {
                var newSessionWaitTimeout = self.config.newSessionWaitTimeout || DEFAULT_NEW_SESSION_WAIT_TIMEOUT,
                    now = (new Date()).getTime(),
                    waitTime = now - req.since,
                    msg;

                if (self.config.throwOnCapabilityNotPresent && !self.nodes.hasCapability(req.req.capabilities)) {
                    msg = util.format('Cannot find capabilities for request (%s):\n%j', req.getId(), req.req.capabilities);
                } else if (newSessionWaitTimeout > -1 && waitTime >= newSessionWaitTimeout) {
                    msg = util.format('Request timed out waiting for a node to become available (%s)', req.getId());
                }

                if (msg) {
                    // reject previously saved defer
                    req.defer.reject(new Error(msg));
                    log.warn(msg);

                    // remove pending request from the list as timed out
                    self.removeRequest(req);
                    return;
                }

                return self.nodes.getNewSession(req.req)
                    .then(function(session) {
                        if (!session) {
                            return;
                        }

                        // resolve previously saved defer with newly created session
                        req.defer.resolve(session);

                        // remove pending request from the list as resolved
                        self.removeRequest(req);
                    })
                    .catch(function(err) {
                        log.warn('Could not create session because of error:\n%s', err.stack || err);
                    });
            })
            .all();
    },

    processUntilEmpty: function() {
        var self = this;

        if (self.getRequestCount() === 0) {
            self.stopProcessing();
            return q();
        }

        return self.process()
            // hack so it will not hang on recursive call for process() when there
            // are pending request left after process() call
            .delay(1)
            .then(function() {
                return self.processUntilEmpty();
            });
    },

    startProcessing: function() {
        this.stop = false;
        return this.processUntilEmpty().done();
    },

    stopProcessing: function() {
        this.stop = true;
    }
});

var SessionRequest = inherit({
    __constructor: function(req) {
        this.req = req;
        this.id = Math.round(Math.random() * 100000000);
        this.defer = q.defer();
        this.since = (new Date()).getTime();
    },

    getId: function() {
        return this.id;
    }
});

function _listEquals(a, b) {
    if (typeof a !== 'string') {
        a = a.getId();
    }
    if (typeof b !== 'string') {
        b = b.getId();
    }
    return a === b;
}

module.exports = SessionQueue;
