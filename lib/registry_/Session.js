var inherit = require('inherit'),
    extend = require('extend');

var Session = inherit({
    __constructor: function(slot, id, caps, desiredCaps) {
        this.slot = slot;
        this.node = slot.node;
        this.id = id;
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
            slot: this.slot.getId(),
            capabilities: extend(true, this.capabilities),
            desiredCapabilities: extend(true, this.desiredCapabilities)
        }
    }
});

module.exports = Session;
