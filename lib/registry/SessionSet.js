'use strict';

var inherit = require('inherit'),
    q = require('q'),
    Set = require('collections/set'); // eslint-disable-line

var SessionSet = inherit({
    __constructor: function() {
        this.sessions = new Set(null, _setEquals, _setCompare);
    },

    getById: function(id) {
        return q(this.sessions.get(id));
    },

    add: function(session) {
        return q(this.sessions.add(session));
    },

    remove: function(session) {
        return q(this.sessions.remove(session));
    },

    has: function(session) {
        return q(this.sessions.has(session));
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

module.exports = SessionSet;
