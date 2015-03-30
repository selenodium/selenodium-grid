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

    process: function() {
        var self = this,
            list = this.requests.toArray();

        if (!list.length) {
            self.stopProcessing();
            return q();
        }

        return q(list).invoke('map', function(req) {
                if (self.stop) {
                    return;
                }

                // TODO: implement throwOnCapabilityNotPresent == false

                var newSessionWaitTimeout = self.config.newSessionWaitTimeout || DEFAULT_NEW_SESSION_WAIT_TIMEOUT,
                    now = (new Date()).getTime(),
                    waitTime = now - req.since;

                if (newSessionWaitTimeout > -1 && waitTime >= newSessionWaitTimeout) {
                    var msg = util.format('Request timed out waiting for a node to become available (%s)', req.getId());

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

    processUntilStop: function() {
        var self = this;

        if (self.stop) {
            return q();
        }

        return self.process()
            .then(function() {
                if (self.stop) {
                    return;
                }
                return q.delay(100)
                    .then(function() {
                        if (self.stop) {
                            return;
                        }
                        return self.processUntilStop();
                    });
            });
    },

    startProcessing: function() {
        this.stop = false;
        return this.processUntilStop().done();
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
