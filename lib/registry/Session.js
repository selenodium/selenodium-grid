'use strict';

var inherit = require('inherit'),
    extend = require('extend'),
    util = require('util'),
    EventEmitter = require('eventemitter3').EventEmitter,
    log = require('../log'),
    driver = require('../driver');

var DEFAULT_POLLING_INTERVAL = 2000, // 2 sec
    DEFAULT_IDLE_TIMEOUT = 120000, // 2 min
    DEFAULT_IDLE_TIMEOUT_ADD = 5000, // 5 sec
    DEFAULT_MAX_DURATION = 1800000, // 30 min
    MAXIMUM_IDLE_TIMEOUT = 900000, // 15 min
    MAXIMUM_MAX_DURATION = 10800000; // 3 hours

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

        this.on('terminated', this.stopMonitoring, this);
        this.startMonitoring();
    },

    getId: function() {
        return this.id;
    },

    getDriver: function() {
        return driver.getDriver(this.slot.protocol);
    },

    proxyRequest: function(req) {
        var self = this;
        self.touch();
        // TODO: implement commandTimeout session capability
        return self.getDriver()
            .proxyRequestToNode(req, self.node)
            .fin(function() {
                self.touch();
            });
    },

    touch: function() {
        this.lastUsed = (new Date()).getTime();
    },

    createMonitor: function() {
        var self = this,
            caps = this.desiredCapabilities,
            conf = this.node.config;

        var idleTimeoutAdd = DEFAULT_IDLE_TIMEOUT_ADD;
        if (conf.timeoutAdd) {
            idleTimeoutAdd = parseFloat(conf.timeoutAdd, 10) * 1000;
        }

        var idleTimeout = DEFAULT_IDLE_TIMEOUT;
        if (caps.idleTimeout) {
            idleTimeout = parseFloat(caps.idleTimeout, 10) * 1000;
        } else if (conf.timeout) {
            idleTimeout = parseFloat(conf.timeout, 10) * 1000;
        }

        if (idleTimeout > MAXIMUM_IDLE_TIMEOUT) {
            idleTimeout = MAXIMUM_IDLE_TIMEOUT;
        }

        // the hub should give the node the chance to do a timeout
        idleTimeout += idleTimeoutAdd;

        var maxDuration = DEFAULT_MAX_DURATION;
        if (caps.maxDuration) {
            maxDuration = parseFloat(caps.maxDuration, 10) * 1000;
        } else if (conf.maxDuration) {
            maxDuration = parseFloat(conf.maxDuration, 10) * 1000;
        }

        if (maxDuration > MAXIMUM_MAX_DURATION) {
            maxDuration = MAXIMUM_MAX_DURATION;
        }

        function monitor() {
            // TODO: implement check of the session on the node?

            var now = (new Date()).getTime(),
                diff = now - self.lastUsed,
                timeRunning = now - self.startTime;

            log.debug('Checking for timeouts during test on node with ID=%s (session %s)\n%s vs %s',
                self.node.getId(), self.getId(), diff, idleTimeout);

            var msg;
            if (timeRunning >= maxDuration || diff >= idleTimeout) {
                if (timeRunning >= maxDuration) {
                    msg = util.format('Test has exceeded max duration of %s (session %s)', maxDuration, self.getId());
                } else if (diff >= idleTimeout) {
                    msg = util.format('Timeout of %s occurred (session %s)', diff, self.getId());
                }

                log.warn(msg);
                self.stopMonitoring();
                self.emit('timeout', new Error(msg));
            }
        }

        return monitor;
    },

    startMonitoring: function() {
        if (!this._monitoringInterval) {
            var conf = this.node.config,
                pollingInterval = DEFAULT_POLLING_INTERVAL;

            if (conf.cleanupCycle) {
                pollingInterval = parseFloat(conf.cleanupCycle, 10);
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
            delete this._monitoringInterval;
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
