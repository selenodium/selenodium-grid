var inherit = require('inherit'),
    Node = require('./Node'),
    NodeSet = require('./NodeSet'),
    SessionSet = require('./SessionSet'),
    SessionQueue = require('./SessionQueue');

module.exports = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new NodeSet();
        this.sessions = new SessionSet();
        this.requests = new SessionQueue(this.config, this.nodes);
    },

    getNewSession: function(req) {
        var self = this;
        return self.requests.addRequest(req)
            .then(function(session) {
                if (session) {
                    self.sessions.add(session);
                    session.on('timeout', function() {
                        self.terminateSession(session);
                    });
                }
                return session;
            });
    },

    terminateSession: function(session) {
        var self = this;
        return session.slot.terminateSession()
            .fin(function() {
                return self.sessions.remove(session);
            });
    },

    getSessionById: function(sessionId) {
        return this.sessions.getById(sessionId);
    },

    createNode: function(json) {
        return new Node(this.config, json);
    },

    registerNode: function(node) {
        var self = this;
        return self.unregisterNode(node)
            .then(function() {
                return self.nodes.add(node);
            })
            .tap(function() {
                node.on('broken', function() {
                    self.unregisterNode(node);
                });
                node.emit('register', self);
            });
    },

    unregisterNode: function(node) {
        var self = this;
        return self.nodes.has(node)
            .then(function(exists) {
                if (!exists) {
                    return false;
                }
                return self.nodes.getById(node.getId())
                    .then(function(node) {
                        return self.nodes.remove(node)
                            .tap(function() {
                                node.removeAllListeners('broken');
                                node.emit('unregister', self);
                            });
                    });
            });
    },

    getNodeById: function(node) {
        return this.nodes.getById(node);
    }
});
