var inherit = require('inherit'),
    SortedSet = require('collections/sorted-set'),
    EventEmitter = require('events').EventEmitter,
    q = require('q'),
    http = require('q-io/http'),
    extend = require('extend'),
    util = require('util'),
    log = require('./log');

module.exports = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new LocalNodeSet();
    },

    createNode: function(json) {
        return new Node(this, json);
    },

    add: function(node) {
        var self = this;
        return this.nodes.has(node)
            .then(function(exists) {
                if (exists) {
                    log.info('Node already exists:', node.getId());
                    return true;
                }
                return self.nodes.add(node);
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

var LocalNodeSet = inherit(NodeSet, {
});

var DistributedNodeSet = inherit(NodeSet, {
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
        this.caps = extend(true, json.capabilities);
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

        // TODO: testSlots

        // TODO: do we need this?
        this.lastSeen = (new Date()).getTime();

        // node monitoring
        this.downPollingCounter = 0;
        this.downSince = 0;
        this.down = false;

        this.on('broken', this.unregister.bind(this));
    },

    register: function() {
        this.resetMonitoring();
        this.startMonitoring();
        return this.registry.add(this);
    },

    unregister: function() {
        this.stopMonitoring();
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

    isAlive: function() {
        var statusCheckTimeout = this.config.nodeStatusCheckTimeout || DEFAULT_NODE_STATUS_CHECK_TIMEOUT;
        return http
            .request({
                timeout: statusCheckTimeout,
                hostname: this.host,
                port: this.port,
                path: '/wd/hub/status',
                method: 'get'
            })
            .then(function(res) {
                return res.status === 200;
            })
            .catch(function() {
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
            this._monitoringInterval = setInterval(this.monitor.bind(this), pollingInterval);
            this._monitoringInterval.unref();
        }
    },

    stopMonitoring: function() {
        if (this._monitoringInterval) {
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
