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
        // sort nodes in ascending order of getTotalUsed() to distribute sessions more equally
        return async.doFirstSeries(this.getSortedNodes(), function(node) {
            return node.getNewSession(req);
        });
    },

    getSortedNodes: function() {
        // Sort using sorting map
        // See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#Example:_Sorting_maps
        var nodes = this.nodes.toArray(),
            map = nodes.map(function(node, i) {
                return {index: i, value: node.getTotalUsed()};
            });

        map.sort(function(a, b) {
            return a.value - b.value;
        });

        return map.map(function(e) {
            return nodes[e.index];
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
