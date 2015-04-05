'use strict';

var Session = require('../../lib/registry/Session'),
    sinon = require('sinon'),
    expect = require('must'),
    q = require('q'),
    _ = require('lodash');

describe('registry/Session', function() {
    describe('new Session()', function() {
        before(function() {
            // node and slot stubs
            var node = {
                    config: {},
                    getId: function() {
                        return 'my-node';
                    }
                },
                slot = {
                    node: node,
                    getId: function() {
                        return 'my-slot';
                    }
                };

            this.session = new Session(slot, 'my-session', {}, {});
            this.session.stopMonitoring();
        });

        it('getId()', function() {
            expect(this.session.getId()).to.equal('my-session');
        });

        it('toJSON()', function() {
            expect(this.session.toJSON()).to.eql({
                id: 'my-session',
                node: 'my-node',
                slot: 'my-slot',
                capabilities: {},
                desiredCapabilities: {}
            });
        });
    });

    describe('monitoring', function() {
        beforeEach(function() {
            // node and slot stubs
            var config = {
                    cleanupCycle: 50, // interval, ms
                    timeout: 0.100, // idle time, sec
                    timeoutAdd: 0.001, // idle time addition, sec
                    maxDuration: 0.200 // max time, sec
                },
                node = {
                    config: config,
                    getId: function() {
                        return 'my-node';
                    }
                },
                slot = {
                    node: node,
                    getId: function() {
                        return 'my-slot';
                    }
                };

            this.driver = {
                proxyRequestToNode: function() {
                    return q();
                }
            };

            this.session = new Session(slot, 'my-session', {}, {});
        });

        afterEach(function() {
            this.session.stopMonitoring();
        });

        it('must timeout after idleTimeout', function() {
            var onTimeout = sinon.spy();
            this.session.on('timeout', onTimeout);
            // timeout * 1.5
            return q.delay(150)
                .then(function() {
                    expect(onTimeout.calledOnce).to.be.true();

                    var err = onTimeout.args[0][0];
                    expect(err).to.be.instanceOf(Error);
                    expect(err.message).to.match('Timeout');
                });
        });

        it('must timeout after maxDuration', function() {
            var self = this,
                onTimeout = sinon.spy(),
                getDriver = sinon.stub(self.session, 'getDriver').returns(self.driver);

            self.session.on('timeout', onTimeout);

            var touches = _.times(5, function(i) {
                // cleanupCycle * i
                return q.delay(50 * i)
                    .then(function() {
                        return self.session.proxyRequest({});
                    });
            });

            // maxDuration * 1.5
            return q.all([q.delay(300), q(touches).all()])
                .then(function() {
                    expect(getDriver.called).to.be.true();
                    expect(onTimeout.calledOnce).to.be.true();

                    var err = onTimeout.args[0][0];
                    expect(err).to.be.instanceOf(Error);
                    expect(err.message).to.match('max duration');
                });
        });
    });
});
