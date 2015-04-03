'use strict';

var Node = require('../../lib/registry/Node'),
    NodeSlot = require('../../lib/registry/NodeSlot'),
    inherit = require('inherit'),
    nock = require('nock'),
    sinon = require('sinon'),
    expect = require('must'),
    q = require('q');

describe('registry/Node', function() {
    describe('new Node()', function() {
        describe('state just after creation', function() {
            before(function() {
                this.node = new Node({}, {
                    name: 'test node',
                    description: 'test node description',
                    capabilities: [{
                        seleniumProtocol: 'WebDriver',
                        platform: 'LINUX',
                        browserName: 'firefox',
                        version: '30',
                        maxInstances: 1
                    }],
                    configuration: {
                        host: '127.0.0.1',
                        port: 5590
                    }
                });
            });

            it('getId()', function() {
                expect(this.node.getId()).to.equal('http://127.0.0.1:5590');
            });

            it('getRemoteHost()', function() {
                expect(this.node.getRemoteHost()).to.equal('http://127.0.0.1:5590');
            });

            it('getTotal()', function() {
                expect(this.node.getTotal()).to.equal(1);
            });

            it('getTotalUsed()', function() {
                expect(this.node.getTotalUsed()).to.equal(0);
            });

            it('isBusy()', function() {
                expect(this.node.isBusy()).to.be.false();
            });

            it('isDown()', function() {
                expect(this.node.isDown()).to.be.false();
            });

            it('hasCapability()', function() {
                var caps = {platform: 'LINUX', browserName: 'firefox', version: '30'};
                expect(this.node.hasCapability(caps)).to.be.true();
            });

            it('toJSON()', function() {
                expect(this.node.toJSON()).to.eql({
                    id: 'http://127.0.0.1:5590',
                    name: 'test node',
                    description: 'test node description',
                    capabilities: [{
                        seleniumProtocol: 'WebDriver',
                        platform: 'LINUX',
                        browserName: 'firefox',
                        version: '30',
                        maxInstances: 1
                    }],
                    configuration: {
                        host: '127.0.0.1',
                        port: 5590
                    }
                });
            });
        });

        describe('json validation', function() {
            it('must fail on absent capabilities', function() {
                function create() {
                    return new Node({}, {});
                }
                expect(create).to.throw(Error);
            });

            it('must fail when capabilities property is not an array', function() {
                function create() {
                    return new Node({}, {capabilities: {}});
                }
                expect(create).to.throw(Error);
            });

            it('must fail when capabilities property is an empty array', function() {
                function create() {
                    return new Node({}, {capabilities: []});
                }
                expect(create).to.throw(Error);
            });

            it('must fail when there are no host & port, url or remoteHost properties', function() {
                function create() {
                    return new Node({}, {capabilities: [{}]});
                }
                expect(create).to.throw(Error);
            });
        });

        describe('custom node id', function() {
            before(function() {
                this.node = new Node({}, {
                    id: 'my-node',
                    capabilities: [{
                        seleniumProtocol: 'WebDriver',
                        platform: 'LINUX',
                        browserName: 'firefox',
                        version: '30',
                        maxInstances: 1
                    }],
                    configuration: {
                        remoteHost: 'http://127.0.0.1:5590'
                    }
                });
            });

            it('getId()', function() {
                expect(this.node.getId()).to.equal('my-node');
            });
        });

        describe('remote host for Selenium RC node version < 2.9', function() {
            before(function() {
                this.node = new Node({}, {
                    capabilities: [{
                        seleniumProtocol: 'Selenium',
                        platform: 'LINUX',
                        browserName: 'firefox',
                        version: '30',
                        maxInstances: 1
                    }],
                    configuration: {
                        url: 'http://127.0.0.1:5590/selenium-server/driver'
                    }
                });
            });

            it('getRemoteHost()', function() {
                expect(this.node.getRemoteHost()).to.equal('http://127.0.0.1:5590');
            });
        });

        describe('remote host for WebDriver node version < 2.9', function() {
            before(function() {
                this.node = new Node({}, {
                    capabilities: [{
                        seleniumProtocol: 'WebDriver',
                        platform: 'LINUX',
                        browserName: 'firefox',
                        version: '30',
                        maxInstances: 1
                    }],
                    configuration: {
                        url: 'http://127.0.0.1:5590/wd/hub'
                    }
                });
            });

            it('getRemoteHost()', function() {
                expect(this.node.getRemoteHost()).to.equal('http://127.0.0.1:5590');
            });
        });

        describe('remote host for WebDriver node version >= 2.9', function() {
            before(function() {
                this.node = new Node({}, {
                    capabilities: [{
                        seleniumProtocol: 'WebDriver',
                        platform: 'LINUX',
                        browserName: 'firefox',
                        version: '30',
                        maxInstances: 1
                    }],
                    configuration: {
                        remoteHost: 'http://127.0.0.1:5590'
                    }
                });
            });

            it('getRemoteHost()', function() {
                expect(this.node.getRemoteHost()).to.equal('http://127.0.0.1:5590');
            });
        });
    });

    describe('monitoring', function() {
        before(function() {
            nock.activate();
            this.scope = nock('http://127.0.0.1:5590');
        });

        after(function() {
            delete this.scope;
            nock.restore();
        });

        beforeEach(function() {
            nock.cleanAll();

            this.node = new Node({}, {
                capabilities: [{
                    seleniumProtocol: 'WebDriver',
                    platform: 'LINUX',
                    browserName: 'firefox',
                    version: '30',
                    maxInstances: 1
                }],
                configuration: {
                    host: '127.0.0.1',
                    port: 5590,
                    nodePolling: 100,
                    downPollingLimit: 1,
                    nodeStatusCheckTimeout: 100,
                    unregisterIfStillDownAfter: 0
                }
            });
        });

        describe('isAlive()', function() {
            it('must resolve to true for alive node', function() {
                this.scope
                    .get('/wd/hub/status')
                    .reply(200, {status: 0});

                return this.node.isAlive()
                    .then(function(res) {
                        expect(res).to.be.true();
                    });
            });

            it('must resolve to false for dead node', function() {
                this.scope
                    .get('/wd/hub/status')
                    .socketDelay(110)
                    .reply(200, {status: 0});

                return this.node.isAlive()
                    .then(function(res) {
                        expect(res).to.be.false();
                    });
            });
        });

        describe('monitor()', function() {
            it('must emit down and broken events for dead node', function() {
                this.scope
                    .get('/wd/hub/status')
                    .socketDelay(110)
                    .reply(200, {status: 0});

                var onDown = sinon.spy(),
                    onBroken = sinon.spy();

                this.node.on('down', onDown);
                this.node.on('broken', onBroken);

                return this.node.monitor()
                    .then(function() {
                        expect(onDown.calledOnce).to.be.true();
                        expect(onBroken.calledOnce).to.be.true();
                    });
            });
        });

        describe('integral monitoring tests', function() {
            var registry = {};
            beforeEach('register node', function() {
                this.node.emit('register', registry);
            });

            afterEach('unregister node', function() {
                this.node.emit('unregister', registry);
            });

            it('must check node status during nodePolling interval', function() {
                this.scope
                    .get('/wd/hub/status')
                    .times(5)
                    .reply(200, {status: 0});

                var self = this;
                // magic number 550 = nodePolling*5 + nodePolling/2
                return q.delay(550)
                    .then(function() {
                        return self.scope.done();
                    });
            });

            it('must check node status during nodePolling interval and fail when node stop responding', function() {
                this.scope
                    .get('/wd/hub/status')
                    .times(4)
                    .reply(200, {status: 0})
                    .get('/wd/hub/status')
                    .socketDelay(110)
                    .reply(200, {status: 0});

                var self = this,
                    onDown = sinon.spy(),
                    onBroken = sinon.stub();

                self.node.on('down', onDown);
                self.node.on('broken', function(err) {
                    self.node.emit('unregister', registry);
                    onBroken(err);
                });

                // magic number 550 = nodePolling*5 + nodePolling/2
                return q.delay(550)
                    .then(function() {
                        expect(onDown.calledOnce).to.be.true();
                        expect(onBroken.calledOnce).to.be.true();
                        return self.scope.done();
                    });
            });
        });
    });

    describe('createNewSession()', function() {
        var NodeSlotStub = inherit(NodeSlot, {
                getNewSession: function(req) {
                    if (this.isLocked()) {
                        return null;
                    }
                    this.lock();
                    return new SessionStub(req.sessionId);
                }
            }),
            NodeForTest = inherit(Node, {
                createSlot: function(caps) {
                    return new NodeSlotStub(this, caps);
                }
            });

        beforeEach(function() {
            this.node = new NodeForTest({}, {
                capabilities: [{
                    seleniumProtocol: 'Selenium',
                    platform: 'LINUX',
                    browserName: 'firefox',
                    version: '30',
                    maxInstances: 1
                }],
                configuration: {
                    remoteHost: 'http://127.0.0.1:5590'
                }
            });
        });

        it('must return session', function() {
            return this.node.getNewSession({sessionId: 'my-session'})
                .then(function(session) {
                    expect(session).to.be.not.null();
                    expect(session.getId()).to.equal('my-session');
                });
        });

        it('must return null if there are no free slots', function() {
            var node = this.node;
            return node.getNewSession({sessionId: 'my-session1'})
                .then(function(session) {
                    expect(session).to.be.not.null();
                    expect(session.getId()).to.equal('my-session1');

                    return node.getNewSession({sessionId: 'my-session2'})
                        .then(function(session) {
                            expect(session).to.be.null();
                        });
                });
        });
    });
});

var SessionStub = inherit({
    __constructor: function(id) {
        this.id = id;
    },

    getId: function() {
        return this.id;
    }
});
