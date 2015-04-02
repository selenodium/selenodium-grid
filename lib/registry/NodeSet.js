var inherit = require('inherit'),
    q = require('q'),
    async = require('../q-async'),
    Set = require('collections/set');

var NodeSet = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new Set(null, _setEquals, _setCompare);
    },

    hasCapability: function(caps) {
        var nodes = this.nodes.toArray(),
            res = false;

        for (var i = 0; i < nodes.length; i++) {
            res = nodes[i].hasCapability(caps);
            if (res) {
                break;
            }
        }

        return res;
    },

    getNewSession: function(req) {
        return async.doFirstSeries(this.nodes.toArray(), function(node) {
            return node.getNewSession(req);
        });
    },

    getById: function(id) {
        return q(this.nodes.get(id));
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

function _setEquals(a, b) {
    if (typeof a !== 'string') {
        a = a.getId();
    }
    if (typeof b !== 'string') {
        b = b.getId();
    }
    return a === b;
}

function _setCompare(val) {
    if (typeof val !== 'string') {
        val = val.getId();
    }
    return val;
}

module.exports = NodeSet;
