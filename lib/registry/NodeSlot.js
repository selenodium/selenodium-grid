'use strict';

var inherit = require('inherit'),
    extend = require('extend'),
    q = require('q'),
    log = require('../log'),
    driver = require('../driver'),
    matchesCaps = require('../capability-utils').defaultMatcher,
    Session = require('./Session'),
    objectMd5 = require('../object-md5');

var NodeSlot = inherit({
    __constructor: function(node, caps) {
        this.locked = false;
        this.node = node;
        this.caps = caps;
        // TODO: use constants from driver
        this.protocol = (caps.seleniumProtocol === 'Selenium') ? 'RC' : 'WebDriver';
        this.session = null;
        this.id = this.buildId();
    },

    getId: function() {
        return this.id;
    },

    buildId: function() {
        return objectMd5(this.caps);
    },

    hasCapability: function(caps) {
        return matchesCaps(caps, this.caps);
    },

    getNewSession: function(req) {
        var self = this;
        if (self.isLocked()) {
            log.debug('Slot on node with ID=%s is locked, skip', self.node.getId());
            return q(null);
        }

        // match capabilities
        var caps = req.capabilities;
        if (!self.hasCapability(caps)) {
            log.debug('Capabilities for slot on node with ID=%s do not match', self.node.getId());
            log.debug('* desired capabilities: %j', caps);
            log.debug('* slot capabilities: %j', self.caps);
            return q(null);
        }

        log.debug('Trying to open session for node slot with ID=%s', this.getId());

        this.lock();

        req = extend({retries: 2}, req);
        return self.getDriver().getNewSessionFromNode(req, self.node)
            .catch(function(err) {
                // unlock node on session opening error
                self.unlock();
                return q.reject(err);
            })
            .then(function(res) {
                // save session on success
                self.session = new Session(self, res.sessionId, res.capabilities, res.desiredCapabilities);
                return self.session;
            });
    },

    terminateSession: function() {
        var self = this;
        // send termination request
        return self.getDriver().endSessionOnNode(self.session, self.node)
            .fin(function() {
                return self.release();
            });
    },

    release: function() {
        // clear session
        this.session.emit('terminated');
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

module.exports = NodeSlot;
