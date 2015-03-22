var inherit = require('inherit'),
    q = require('q'),
    http = require('q-io/http'),
    async = require('../q-async'),
    util = require('util'),
    extend = require('extend'),
    EventEmitter = require('eventemitter3').EventEmitter,
    log = require('../log'),
    normalizeCaps = require('../normalizeCaps'),
    NodeSlot = require('./NodeSlot');

const DEFAULT_POLLING_INTERVAL = 10000;
const DEFAULT_UNREGISTER_DELAY = 60000;
const DEFAULT_DOWN_POLLING_LIMIT = 2;
const DEFAULT_NODE_STATUS_CHECK_TIMEOUT = 2000;

var Node = inherit(EventEmitter, {
    __constructor: function(config, json) {
        // call EventEmitter constructor
        this.__base();

        if (!json.capabilities) {
            var msg = 'Could not add a node without any available capabilities';
            log.warn(msg);
            log.debug('Node config: %j', json);
            throw new Error(msg);
        }

        var conf = extend(true, {}, config, json.configuration || {});
        this.config = conf;
        /** @type {Array} */
        this.caps = extend(true, json.capabilities.map(function(caps) {
            return normalizeCaps(caps)
        }));
        this.request = json;

        // parse remoteHost value if there are no host or port
        // TODO: parse url
        // "url":"http://ip:port/selenium-server/driver" (< v2.9, RC),
        // "url":"http://ip:port/wd/hub" (< v2.9, wb)
        if ((!conf.host || !conf.port) && conf.remoteHost) {
            // "remoteHost": "http://ip:port" (> v2.9 )
            var hostParts = conf.remoteHost.replace('http://', '').split(':');
            this.host = hostParts[0];
            this.port = parseInt(hostParts[1], 10);
        } else {
            this.host = conf.host;
            this.port = parseInt(conf.port, 10);
        }

        this.id = json.id || this.buildId();
        this.name = json.name || '';
        this.description = json.description || '';

        // populate testing slots by node capabilities
        var self = this;
        /** @type {Array} */
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

        this.on('register', this.onRegister, this);
        this.on('unregister', this.onUnregister, this);
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

    onRegister: function(registry) {
        this.resetMonitoring();
        this.startMonitoring();
    },

    onUnregister: function(registry) {
        this.stopMonitoring();
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

module.exports = Node;
