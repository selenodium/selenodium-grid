var inherit = require('inherit'),
    q = require('q'),
    log = require('../log'),
    driver = require('../driver'),
    matchesCaps = require('../matcher'),
    Session = require('./Session');

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

module.exports = NodeSlot;
