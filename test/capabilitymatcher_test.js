var expect = require('must'),
    matcher = require('../lib/capabilitymatcher'),
    models = require('../lib/models'),
    store = require('../lib/store');

describe('CapabilityMatcher', function() {
    before(function() {
        return store.flushdb();
    });

    after(function() {
        return store.flushdb();
    });

    describe('Correctly find a match', function() {
        beforeEach(function() {
            return store.removeAllAvailableNodes();
        });

        afterEach(function() {
            return store.removeAllAvailableNodes();
        });

        it('must correctly find a full match', function() {
            // Store capabilities keys should be all in lower case
            var caps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [caps]))
                .then(function() {
                    return matcher.findNode(caps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must find a version even if it\'s a string', function() {
            var storeCaps = {browsername: 'firefox', version: '14', platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: 'WINDOWS'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must be case-insensitive', function() {
            var storeCaps = {browsername: 'firefox', version: '14', platform: 'WINDOWS'},
                findCaps = {browserName: 'FIREFOX', Version: '14', platform: 'windows'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must not crash when the user asks for a permission which is not registered on the node', function() {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: 'WINDOWS', cherries: 'ontop'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must be able to handle empty desired capabilities', function() {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode({});
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must be able to handle incorrect capabilities', function() {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode({nothing: 'else'});
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must correctly find a node when the user asks for ANY platform', function() {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: 'ANY'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must correctly find a node when the user asks for * platform', function() {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: '*'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must correctly find a node with just one desired capability', function() {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps]))
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.1');
                });
        });

        it('must pick the correct node that corresponds to our desiredCapabilities', function() {
            var storeCaps1 = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                storeCaps2 = {browsername: 'firefox', version: 13, platform: 'LINUX'},
                findCaps = {browserName: 'firefox', platform: 'LINUX'};

            return store.addAvailableNode(new models.Node('127.0.0.1', 5556, [storeCaps1]))
                .then(function() {
                    return store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps2]))
                })
                .then(function() {
                    return matcher.findNode(findCaps);
                })
                .then(function(node) {
                    expect(node.host).to.equal('127.0.0.2');
                });
        });
    });
});
