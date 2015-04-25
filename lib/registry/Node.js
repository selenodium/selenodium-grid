'use strict';

var inherit = require('inherit'),
    q = require('q'),
    http = require('q-io/http'),
    HttpAgent = require('http').Agent,
    async = require('../q-async'),
    url = require('url'),
    util = require('util'),
    extend = require('extend'),
    EventEmitter = require('eventemitter3').EventEmitter,
    log = require('../log'),
    normalizeCapabilities = require('../capability-utils').normalizeCapabilities,
    NodeSlot = require('./NodeSlot');

var DEFAULT_POLLING_INTERVAL = 10000,
    DEFAULT_UNREGISTER_DELAY = 60000,
    DEFAULT_DOWN_POLLING_LIMIT = 2,
    DEFAULT_NODE_STATUS_CHECK_TIMEOUT = 2000;

var Node = inherit(EventEmitter, {
    __constructor: function(config, json) {
        // call EventEmitter constructor
        this.__base();

        this.validateJson(json);

        var conf = mergeConfig(config, json.configuration || {});
        this.config = conf;
        /** @type {Array} */
        this.capabilities = (json.capabilities || []).map(normalizeCapabilities);
        this.request = json;

        var hostParts;
        if (conf.host && conf.port) {
            this.host = conf.host;
            this.port = parseInt(conf.port, 10);
        } else if (conf.remoteHost || conf.url) {
            // parse remoteHost or url value if there are no host or port
            // remoteHost="http://ip:port" (> v2.9 )
            // url="http://ip:port/wd/hub" (< v2.9, wb)
            // url="http://ip:port/selenium-server/driver" (< v2.9, RC),
            hostParts = url.parse(conf.remoteHost || conf.url);
            this.host = hostParts.hostname;
            this.port = parseInt(hostParts.port) || 80;
        }

        this.id = json.id || this.buildId();
        this.name = json.name || '';
        this.description = json.description || '';

        // populate testing slots by node capabilities
        /** @type {Array} */
        this.slots = this.createSlots(this.capabilities);

        // node monitoring
        this.downPollingCounter = 0;
        this.downSince = 0;
        this.down = false;

        this.on('register', this.onRegister, this);
        this.on('unregister', this.onUnregister, this);
    },

    validateJson: function(json) {
        var capabilities = json.capabilities || [],
            conf = json.configuration || {},
            msg;

        if (!Array.isArray(capabilities)) {
            msg = 'Capabilities must be an array';
        } else if (!capabilities.length) {
            msg = 'Could not add a node without any available capabilities';
        } else if ((!conf.host || !conf.port) && !conf.remoteHost && !conf.url) {
            msg = 'Could not find node remote host';
        }

        if (msg) {
            log.warn(msg);
            log.debug('Node config: %j', json);
            throw new Error(msg);
        }
    },

    hasCapability: function(caps) {
        var res = false;
        for (var i = 0; i < this.slots.length; i++) {
            res = this.slots[i].hasCapability(caps);
            if (res) {
                break;
            }
        }
        return res;
    },

    getNewSession: function(req) {
        log.debug('Trying to open session for node with ID=%s', this.getId());
        if (this.down) {
            log.warn('Could not open session for node with ID=%s, node is down', this.getId());
            return q(null);
        }

        // TODO: check for caps match

        var maxSession = this.config.maxSession || this.getTotal();
        if (this.getTotalUsed() >= maxSession) {
            log.warn('Could not open more than %s sessions on node with ID=%s', maxSession, this.getId());
            return q(null);
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
        return 'http://' + this.host + (this.port === 80 ? '' : ':' + this.port);
    },

    createSlots: function(capabilities) {
        var self = this,
            slots = [];

        capabilities.forEach(function(caps) {
            var maxInstances = caps.maxInstances || 1;
            for (var i = 0; i < maxInstances; i++) {
                slots.push(self.createSlot(caps));
            }
        });

        return slots;
    },

    createSlot: function(caps) {
        return new NodeSlot(this, caps);
    },

    getTotal: function() {
        return this.slots.length;
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
                // TODO: Selenium RC node could return 404 and it is okay
                return res.status === 200;
            })
            .catch(function(err) {
                log.debug('Error occured during status check of node with ID=%s', self.getId());
                log.debug(err.stack || err);
                return false;
            });
    },

    isDown: function() {
        return this.down;
    },

    monitor: function() {
        var self = this,
            downPollingLimit = Object.has(this.config, 'downPollingLimit')
                ? parseInt(this.config.downPollingLimit, 10)
                : DEFAULT_DOWN_POLLING_LIMIT,
            unregisterIfStillDownAfter = Object.has(this.config, 'unregisterIfStillDownAfter')
                ? parseInt(this.config.unregisterIfStillDownAfter, 10)
                : DEFAULT_UNREGISTER_DELAY;

        return this.isAlive()
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
                }

                // schedule node unregister after unregisterIfStillDownAfter ms
                var downFor = (new Date()).getTime() - self.downSince;
                if (downFor >= unregisterIfStillDownAfter) {
                    msg = util.format('The node has been down for %s milliseconds.', downFor);
                    log.warn(msg);
                    self.emit('broken', new Error(msg));
                }
            });
    },

    startMonitoring: function() {
        if (!this._monitoringInterval) {
            var self = this,
                pollingInterval = this.config.nodePolling || DEFAULT_POLLING_INTERVAL;
            log.debug('Started monitoring for node with ID=%s; %sms interval', this.getId(), pollingInterval);
            this._monitoringInterval = setInterval(function() {
                // TODO: should we log failures instead of crashing?
                self.monitor().done();
            }, pollingInterval);
            this._monitoringInterval.unref();
        }
    },

    stopMonitoring: function() {
        if (this._monitoringInterval) {
            log.debug('Stopped monitoring for node with ID=%s', this.getId());
            clearInterval(this._monitoringInterval);
            delete this._monitoringInterval;
        }
    },

    resetMonitoring: function() {
        this.downPollingCounter = 0;
        this.downSince = 0;
        this.down = false;
    },

    getAgent: function() {
        if (this.httpAgent) {
            // number of sockets equals number of slots plus one for node polling
            this.httpAgent = new HttpAgent({maxSockets: this.getTotal() + 1});
        }
        return this.httpAgent;
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
            capabilities: extend(true, this.capabilities)
        });
    }
});

function mergeConfig(hubConfig, nodeConfig) {
    return extend(true, {}, hubConfig, {host: null, port: null}, nodeConfig);
}

module.exports = Node;
