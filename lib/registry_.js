var inherit = require('inherit'),
    SortedSet = require('collections/sorted-set'),
    Set = require('collections/set'),
    EventEmitter = require('events').EventEmitter,
    q = require('q'),
    http = require('q-io/http'),
    async = require('./q-async'),
    extend = require('extend'),
    util = require('util'),
    log = require('./log'),
    driver = require('./driver'),
    matchesCaps = require('./matcher'),
    normalizeCaps = require('./normalizeCaps');

module.exports = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new NodeSet();
        this.sessions = new SessionSet();
    },

    getNewSession: function(req) {
        var self = this;
        return self.nodes.getNewSession(req)
            .then(function(session) {
                if (session) {
                    //console.log('session: %j', session);
                    self.sessions.add(session);
                }
                return session;
            });
    },

    getSessionById: function(sessionId) {
        return this.sessions.getById(sessionId);
    },

    createNode: function(json) {
        return new Node(this, json);
    },

    add: function(node) {
        var self = this;
        return self.removeIfPresent(node)
            .then(function() {
                return self.nodes.add(node);
            });
    },

    removeIfPresent: function(node) {
        var self = this;
        return self.nodes.has(node)
            .then(function(exists) {
                if (!exists) {
                    return;
                }
                return self.nodes.getById(node.getId())
                    .then(function(node) {
                        return node.unregister();
                    });
            });
    },

    remove: function(node) {
        return this.nodes.remove(node);
    },

    getById: function(id) {
        return this.nodes.getById(id);
    }
});

function _setEquals(val, storedVal) {
    if (typeof val !== 'string') {
        val = val.getId();
    }
    return val === storedVal.getId();
}

function _setCompare(val, storedVal) {
    if (typeof val !== 'string') {
        val = val.getId();
    }
    if (val > storedVal) {
        return 1;
    }
    if (val > storedVal) {
        return -1;
    }
    return 0;
}

var NodeSet = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new SortedSet([], _setEquals, _setCompare);
    },

    getNewSession: function(req) {
        return async.doFirstSeries(this.nodes.toArray(), function(node) {
            return node.getNewSession(req);
        });
    },

    getById: function(id) {
        var res = this.nodes.find(id);
        return q(res && res.value);
    },

    add: function(node) {
        return q(this.nodes.add(node));
    },

    remove: function(node) {
        return q(this.nodes.remove(node));
    },

    has: function(node) {
        return q(this.nodes.has(node));
    }
});

const DEFAULT_POLLING_INTERVAL = 10000;
const DEFAULT_UNREGISTER_DELAY = 60000;
const DEFAULT_DOWN_POLLING_LIMIT = 2;
const DEFAULT_NODE_STATUS_CHECK_TIMEOUT = 2000;

var Node = inherit(EventEmitter, {
    __constructor: function(registry, json) {
        // call EventEmitter constructor
        this.__base();

        if (!json.capabilities) {
            throw new Error('Could not add a node without any available capabilities');
        }

        var config = extend(true, {}, registry.config, json.configuration || {});
        this.registry = registry;
        this.config = config;
        this.caps = extend(true, json.capabilities.map(function(caps) {
            return normalizeCaps(caps)
        }));
        this.request = json;

        // parse remoteHost value if there are no host or port
        // TODO: parse url
        // "url":"http://ip:port/selenium-server/driver" (< v2.9, RC),
        // "url":"http://ip:port/wd/hub" (< v2.9, wb)
        if ((!config.host || !config.port) && config.remoteHost) {
            // "remoteHost": "http://ip:port" (> v2.9 )
            var hostParts = config.remoteHost.replace('http://', '').split(':');
            this.host = hostParts[0];
            this.port = parseInt(hostParts[1], 10);
        } else {
            this.host = config.host;
            this.port = parseInt(config.port, 10);
        }

        this.id = json.id || this.buildId();
        this.name = json.name || '';
        this.description = json.description || '';

        // populate testing slots by node capabilities
        var self = this;
        this.slots = [];
        this.caps.forEach(function(caps) {
            var maxInstances = caps.maxInstances || 1;
            for (var i = 0; i < maxInstances; i++) {
                self.slots.push(new NodeSlot(self, caps));
            }
        });

        //this.sessions = new Set();

        // node monitoring
        this.downPollingCounter = 0;
        this.downSince = 0;
        this.down = false;

        this.on('broken', this.unregister.bind(this));
    },

    getNewSession: function(req) {
        log.debug('Trying to open session for node with ID=%s', this.getId());
        if (this.down) {
            log.warn('Could not open session for node with ID=%s, node is down', this.getId());
            return null;
        }

        // TODO: check for caps match

        var maxSession = this.config.maxSession;
        if (this.getTotalUsed() >= maxSession) {
            log.warn('Could not open more than %s sessions on node with ID=%s', maxSession, this.getId());
            return null;
        }

        // TODO: save session to this.sessions?
        return async.doFirstSeries(this.slots, function(slot) {
            return slot.getNewSession(req);
        });
    },

    register: function() {
        this.resetMonitoring();
        this.startMonitoring();
        this.emit('register', this.registry);
        return this.registry.add(this);
    },

    unregister: function() {
        this.stopMonitoring();
        this.emit('unregister', this.registry);
        return this.registry.remove(this);
    },

    getId: function() {
        return this.id;
    },

    buildId: function() {
        return this.getRemoteHost();
    },

    getRemoteHost: function() {
        return 'http://' + this.host + ':' + this.port;
    },

    getTotalUsed: function() {
        var used = 0;
        this.slots.forEach(function(slot) {
            if (slot.isLocked()) {
                ++used;
            }
        });
        return used;
    },

    isBusy: function() {
        return this.getTotalUsed() > 0;
    },

    isAlive: function() {
        var self = this,
            statusCheckTimeout = this.config.nodeStatusCheckTimeout || DEFAULT_NODE_STATUS_CHECK_TIMEOUT;
        log.debug('Checking status of node with ID=%s; timeout %sms', this.getId(), statusCheckTimeout);
        return http
            .request({
                timeout: statusCheckTimeout,
                hostname: this.host,
                port: this.port,
                path: '/wd/hub/status',
                method: 'get'
            })
            .then(function(res) {
                log.debug('Node with ID=%s returned %s on status check', self.getId(), res.status);
                return res.status === 200;
            })
            .catch(function(err) {
                log.debug('Error occured during status check of node with ID=%s', self.getId());
                log.debug(err.stack || err);
                return false;
            });
    },

    isDown: function() {
        return q(this.down);
    },

    monitor: function() {
        var self = this,
            downPollingLimit = this.config.downPollingLimit || DEFAULT_DOWN_POLLING_LIMIT,
            unregisterIfStillDownAfter = this.config.unregisterIfStillDownAfter || DEFAULT_UNREGISTER_DELAY;

        this.isAlive()
            .then(function(alive) {
                if (alive) {
                    return self.resetMonitoring();
                }

                ++self.downPollingCounter;

                var msg;
                if (!self.down) {
                    // mark node as down after downPollingLimit tries
                    if (self.downPollingCounter >= downPollingLimit) {
                        self.down = true;
                        self.downSince = (new Date()).getTime();

                        msg = util.format('Cannot reach the node for %s tries.', self.downPollingCounter);
                        log.warn(msg);
                        self.emit('down', new Error(msg));
                    }
                    return;
                }

                // schedule node unregister after unregisterIfStillDownAfter ms
                var downFor = (new Date()).getTime() - self.downSince;
                if (downFor > unregisterIfStillDownAfter) {
                    msg = util.format('The node has been down for %s milliseconds.', downFor);
                    log.warn(msg);
                    self.emit('broken', new Error(msg));
                }
            })
            // TODO: should log failures instead?
            .done();
    },

    startMonitoring: function() {
        if (!this._monitoringInterval) {
            var pollingInterval = this.config.nodePolling || DEFAULT_POLLING_INTERVAL;
            log.debug('Started monitoring for node with ID=%s; %sms interval', this.getId(), pollingInterval);
            this._monitoringInterval = setInterval(this.monitor.bind(this), pollingInterval);
            this._monitoringInterval.unref();
        }
    },

    stopMonitoring: function() {
        if (this._monitoringInterval) {
            log.debug('Stopped monitoring for node with ID=%s', this.getId());
            clearInterval(this._monitoringInterval);
        }
    },

    resetMonitoring: function() {
        this.downPollingCounter = 0;
        this.downSince = 0;
        this.down = false;
    },

    toJSON: function() {
        var node = {id: this.id};
        if (this.name) {
            node.name = this.name;
        }
        if (this.description) {
            node.description = this.description;
        }
        return extend(node, {
            configuration: extend(true, this.config),
            capabilities: extend(true, this.caps)
        });
    }
});

var NodeSlot = inherit({
    __constructor: function(node, caps) {
        this.locked = false;
        this.node = node;
        this.caps = caps;
        // TODO: use constants from driver
        this.protocol = (caps.seleniumProtocol === 'Selenium') ? 'RC' : 'WebDriver';
        this.session = null;
    },

    getNewSession: function(req) {
        var self = this;
        if (self.isLocked()) {
            log.debug('Slot on node with ID=%s is locked, skip', self.node.getId());
            return null;
        }

        var driver = self.getDriver(),
            caps = driver._getCapabilities(req);

        // match capabilities
        if (!matchesCaps(caps, self.caps)) {
            log.debug('Capabilities for slot on node with ID=%s do not match', self.node.getId());
            log.debug('* desired capabilities: %j', caps);
            log.debug('* slot capabilities: %j', self.caps);
            return null;
        }

        this.lock();

        // send open session request
        return driver._proxyRequestToNode(req, self.node)
            .then(function(res) {
                // process response
                return driver._parseProxyResponse(res)
                    .spread(function(sessionId, resCaps) {
                        // add session to the store
                        //return self._addSession(self._createSession(sessionId, node, resCaps, desiredCaps));

                        // TODO: save session on success
                        var session = new Session(sessionId, self.node, resCaps, caps);
                        self.session = session;
                        return session;
                    });
            })
            .catch(function(err) {
                log.debug('Error ocured during session opening on node with ID=%s', self.node.getId());
                log.debug(err.stack || err);

                self.unlock();
                return q.reject(err);
            });
    },

    terminateSession: function() {
        // TODO: send termination request
        this.release();
    },

    release: function() {
        // TODO: clear session
        this.session = null;
        this.unlock();
    },

    getDriver: function() {
        return driver.getDriver(this.protocol);
    },

    lock: function() {
        if (this.locked) {
            throw new Error('Could not lock already locked slot.');
        }
        this.locked = true;
    },

    unlock: function() {
        if (!this.locked) {
            throw new Error('Could not unlock already unlocked slot.');
        }
        this.locked = false;
    },

    isLocked: function() {
        return this.locked;
    }
});

var Session = inherit({
    __constructor: function(id, node, caps, desiredCaps) {
        this.id = id;
        this.node = node;
        this.capabilities = caps;
        this.desiredCapabilities = desiredCaps;
    },

    getId: function() {
        return this.id;
    },

    toJSON: function() {
        return {
            id: this.getId(),
            node: this.node.getId(),
            capabilities: extend(true, this.capabilities),
            desiredCapabilities: extend(true, this.desiredCapabilities)
        }
    }
});

var SessionSet = inherit({
    __constructor: function() {
        this.sessions = new SortedSet([], _setEquals, _setCompare);
    },

    getById: function(id) {
        var res = this.sessions.find(id);
        return q(res && res.value);
    },

    add: function(node) {
        return q(this.sessions.add(node));
    },

    remove: function(node) {
        return q(this.sessions.remove(node));
    },

    has: function(node) {
        return q(this.sessions.has(node));
    }
});
