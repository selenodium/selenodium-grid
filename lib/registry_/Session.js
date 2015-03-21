var inherit = require('inherit'),
    extend = require('extend');

var Session = inherit({
    __constructor: function(id, node, caps, desiredCaps) {
        this.id = id;
        this.node = node;
        this.capabilities = caps;
        this.desiredCapabilities = desiredCaps;
    },

    getId: function() {
        return this.id;
    },

    toJSON: function() {
        return {
            id: this.getId(),
            node: this.node.getId(),
            capabilities: extend(true, this.capabilities),
            desiredCapabilities: extend(true, this.desiredCapabilities)
        }
    }
});

module.exports = Session;
