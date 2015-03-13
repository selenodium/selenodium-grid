/**
 * Capability matcher.
 * @module capabilityMatcher
 */

var store = require('./store'),
    models = require('./models'),
    log = require('./log');

function matchesCaps(caps, nodeCaps) {
    for (var key in caps) {
        if (!caps[key]) {
            continue;
        }

        var value = caps[key].toString().toLowerCase();
        if (value === 'any' || value === '' || value === '*') {
            continue;
        }

        var lowerKey = key.toLowerCase();
        if (lowerKey !== 'browsername' && lowerKey !== 'version' && lowerKey !== 'platform') {
            continue;
        }

        if (!nodeCaps[lowerKey] || nodeCaps[lowerKey].toString().toLowerCase() !== value) {
            return false;
        }
    }

    return true;
}

function matchesCapsArray(caps, nodeCapsArray) {
    return nodeCapsArray.some(function(nodeCaps) {
        return matchesCaps(caps, nodeCaps);
    });
}

/**
 * Finds a node in the registry using desired capabilities.
 * @param {Object} caps Desired capabilities
 * @returns {Promise<module:models.Node>}
 */
module.exports = function(caps) {
    if (!caps) {
        log.warn('No desired capabilities');
    }

    return store.getAvailableNodes()
        .then(function(nodes) {
            var node,
                foundNode,
                index = 0,
                len = nodes.length;

            // exit if there are no available nodes
            if (!len) {
                return;
            }

            do {
                node = nodes[index];
                if (matchesCapsArray(caps, node.capabilities)) {
                    foundNode = node;
                }
                ++index;
            } while (!foundNode && index < len);

            return foundNode;
        });
        //.then(function(node) {
        //    if (node) {
        //        return node;
        //    }
        //
        //    // TODO: get rid of testingbot or make it configurable
        //    var config = store.getConfig();
        //    if (config && config['key'] && config['key'] !== null) {
        //        log.info('No local nodes currently available for these desired capabilities, forwarding to testingbot');
        //
        //        caps.client_key = config['key'];
        //        caps.client_secret = config['secret'];
        //
        //        var testingbot = new models.Node('hub.testingbot.com', 80, [caps], '');
        //        return store.addNode(testingbot.host, testingbot.port, testingbot)
        //            .thenResolve(testingbot);
        //    }
        //});
};
