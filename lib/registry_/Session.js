var inherit = require('inherit'),
    extend = require('extend'),
    util = require('util'),
    EventEmitter = require('eventemitter3').EventEmitter,
    log = require('../log'),
    driver = require('../driver');

const DEFAULT_POLLING_INTERVAL = 2000; // 2 sec
const DEFAULT_IDLE_TIMEOUT = 120000; // 2 min
const DEFAULT_MAX_DURATION = 1800000; // 30 min
const MAXIMUM_IDLE_TIMEOUT = 900000; // 15 min
const MAXIMUM_MAX_DURATION = 10800000; // 3 hours

var Session = inherit(EventEmitter, {
    __constructor: function(slot, id, caps, desiredCaps) {
        // call EventEmitter constructor
        this.__base();

        this.slot = slot;
        this.node = slot.node;
        this.id = id;
        this.capabilities = caps;
        this.desiredCapabilities = desiredCaps;

        this.startTime = (new Date()).getTime();
        this.lastUsed = this.startTime;
        this.timedOut = false;

        this.on('terminated', this.stopMonitoring, this);
        this.startMonitoring();
    },

    getId: function() {
        return this.id;
    },

    proxyRequest: function(req) {
        var self = this;
        self.touch();
        return driver.getDriver(self.slot.protocol)
            .proxyRequestToNode(req, self.node)
            .fin(function() {
                self.touch();
            });
    },

    touch: function() {
        this.lastUsed = (new Date()).getTime();
    },

    createMonitor: function() {
        var caps = this.desiredCapabilities,
            nodeCaps = this.node.capabilities;

        var idleTimeout = DEFAULT_IDLE_TIMEOUT;
        if (caps.idleTimeout) {
            idleTimeout = parseInt(caps.idleTimeout, 10) * 1000;
        } else if (nodeCaps.timeout) {
            idleTimeout = parseInt(nodeCaps.timeout, 10) * 1000;
        }

        if (idleTimeout > MAXIMUM_IDLE_TIMEOUT) {
            idleTimeout = MAXIMUM_IDLE_TIMEOUT;
        }

        // the hub should give the node the chance to do a timeout
        idleTimeout += 5000;

        var maxDuration = DEFAULT_MAX_DURATION;
        if (caps.maxDuration) {
            maxDuration = parseInt(caps.maxDuration, 10) * 1000;
        } else if (nodeCaps.maxDuration) {
            maxDuration = parseInt(nodeCaps.maxDuration, 10) * 1000;
        }

        if (maxDuration > MAXIMUM_MAX_DURATION) {
            maxDuration = MAXIMUM_MAX_DURATION;
        }

        var monitor = function() {
            if (this.timedOut) {
                return;
            }

            // TODO: implement check of the session on the node?

            var now = (new Date()).getTime(),
                diff = now - this.lastUsed,
                timeRunning = now - this.startTime;

            if (diff > 5000) {
                log.debug('Checking for timeouts during test on node with ID=%s (session %s)\n%s vs %s',
                    this.node.getId(), this.getId(), diff, idleTimeout);
            }

            var msg;
            if (timeRunning >= maxDuration || diff >= idleTimeout) {
                if (timeRunning >= maxDuration) {
                    msg = util.format('Test has exceeded max duration of %s (session %s)', maxDuration, this.getId());
                } else if (diff >= idleTimeout) {
                    msg = util.format('Timeout of %s occurred (session %s)', diff, this.getId());
                }

                log.warn(msg);
                this.timedOut = true;
                this.emit('timeout', new Error(msg));
            }
        };

        return monitor.bind(this);
    },

    startMonitoring: function() {
        if (!this._monitoringInterval) {
            var nodeCaps = this.node.capabilities,
                pollingInterval = DEFAULT_POLLING_INTERVAL;

            if (nodeCaps.cleanupCycle) {
                pollingInterval = parseInt(nodeCaps.cleanupCycle, 10);
            }

            log.debug('Started monitoring for session with ID=%s; %sms interval', this.getId(), pollingInterval);
            this._monitoringInterval = setInterval(this.createMonitor(), pollingInterval);
            this._monitoringInterval.unref();
        }
    },

    stopMonitoring: function() {
        if (this._monitoringInterval) {
            log.debug('Stopped monitoring for session with ID=%s', this.getId());
            clearInterval(this._monitoringInterval);
        }
    },

    toJSON: function() {
        return {
            id: this.getId(),
            node: this.node.getId(),
            slot: this.slot.getId(),
            capabilities: extend(true, this.capabilities),
            desiredCapabilities: extend(true, this.desiredCapabilities)
        }
    }
});

module.exports = Session;
