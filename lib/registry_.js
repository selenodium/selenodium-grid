var inherit = require('inherit'),
    SortedSet = require('collections/sorted-set'),
    q = require('q'),
    extend = require('extend'),
    log = require('./log');

module.exports = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new LocalNodeSet();
    },

    createNode: function(json) {
        return new Node(this, json);
    },

    add: function(node) {
        var self = this;
        return this.nodes.has(node)
            .then(function(exists) {
                if (exists) {
                    log.info('Node already exists:', node.getId());
                    return true;
                }
                return self.nodes.add(node);
            });
    },

    remove: function(node) {
        return this.nodes.remove(node);
    },

    getById: function(id) {
        return this.nodes.getById(id);
    }
});

function _setEquals(val, storedVal) {
    if (typeof val !== 'string') {
        val = val.getId();
    }
    return val === storedVal.getId();
}

function _setCompare(val, storedVal) {
    if (typeof val !== 'string') {
        val = val.getId();
    }
    if (val > storedVal) {
        return 1;
    }
    if (val > storedVal) {
        return -1;
    }
    return 0;
}

var NodeSet = inherit({
    __constructor: function(config) {
        this.config = config;
        this.nodes = new SortedSet([], _setEquals, _setCompare);
    },

    getById: function(id) {
        return q(this.nodes.find(id));
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

var LocalNodeSet = inherit(NodeSet, {
});

var DistributedNodeSet = inherit(NodeSet, {
});

var Node = inherit({
    __constructor: function(registry, json) {
        if (!json.capabilities) {
            throw new Error('Could not add a node without any available capabilities');
        }

        var config = extend(true, {}, registry.config, json.configuration || {});
        this.registry = registry;
        this.config = config;
        this.caps = extend(true, json.capabilities);
        this.request = json;

        // parse remoteHost value if there are no host or port
        // TODO:
        // "url":"http://ip:port/selenium-server/driver" (< v2.9, RC),
        // "url":"http://ip:port/wd/hub" (< v2.9, wb)
        if ((!config.host || !config.port) && config.remoteHost) {
            // "remoteHost": "http://ip:port" (> v2.9 )
            var hostParts = config.remoteHost.replace('http://', '').split(':');
            this.host = hostParts[0];
            this.port = parseInt(hostParts[1], 10);
        } else {
            this.host = config.host;
            this.port = parseInt(config.port, 10);
        }

        this.id = json.id || this.buildId();
        this.name = json.name || '';
        this.description = json.description || '';

        this.lastSeen = (new Date()).getTime();
    },

    getId: function() {
        return this.id;
    },

    buildId: function() {
        return 'http://' + this.host + ':' + this.port;
    },

    toJSON: function() {
        var node = {id: this.id};
        if (this.name) {
            node.name = this.name;
        }
        if (this.description) {
            node.description = this.description;
        }
        return extend(node, {
            configuration: extend(true, this.config),
            capabilities: extend(true, this.caps)
        });
    }
});
