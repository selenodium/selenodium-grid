var inherit = require('inherit'),
    Node = require('./Node'),
    NodeSet = require('./NodeSet');
    SessionSet = require('./SessionSet');

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
                    self.sessions.add(session);
                }
                return session;
            });
    },

    terminateSession: function(session) {
        var self = this;
        return session.slot.terminateSession()
            .fin(function() {
                return self.removeSession(session);
            });
    },

    getSessionById: function(sessionId) {
        return this.sessions.getById(sessionId);
    },

    removeSession: function(session) {
        return this.sessions.remove(session);
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
