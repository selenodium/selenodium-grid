'use strict';

var SessionQueue = require('../../lib/registry/SessionQueue'),
    httpIncomingMessage = require('http').IncomingMessage,
    inherit = require('inherit'),
    q = require('q'),
    extend = require('extend'),
    expect = require('must'),
    _ = require('lodash');

describe('registry/SessionQueue', function() {
    it('addRequest() must resolve with new session instance', function() {
        var NodeSetStub = inherit({
            getNewSession: function(req) {
                return q(new SessionStub(req.sessionId));
            }
        });

        var queue = new SessionQueue({}, new NodeSetStub());
        return queue.addRequest(createRequest({sessionId: 'my-new-session'}))
            .then(function(res) {
                expect(res).to.be.instanceOf(SessionStub);
                expect(res.getId()).to.equal('my-new-session');
            });
    });

    it('addRequest() must reject when throwOnCapabilityNotPresent enabled and there are no satisfying nodes', function() {
        var NodeSetStub = inherit({
            getNewSession: function(req) {
                return q(null);
            },
            hasCapability: function(caps) {
                return false;
            }
        });

        var queue = new SessionQueue({throwOnCapabilityNotPresent: true}, new NodeSetStub()),
            callback = function() {
                throw new Error('Must not resolve');
            },
            errback = function(err) {
                expect(err).to.be.instanceOf(Error);
                expect(queue.getRequestCount()).to.equal(0);
            };

        return queue.addRequest(createRequest({capabilities: {browserName: 'firefox'}}))
            .then(callback, errback);
    });

    it('addRequest() must reject on newSessionWaitTimeout', function() {
        var NodeSetStub = inherit({
            getNewSession: function(req) {
                return q(null);
            }
        });

        var queue = new SessionQueue({newSessionWaitTimeout: 50}, new NodeSetStub()),
            callback = function() {
                throw new Error('Must not resolve');
            },
            errback = function(err) {
                expect(err).to.be.instanceOf(Error);
                expect(queue.getRequestCount()).to.equal(0);
            };

        return queue.addRequest(createRequest())
            .then(callback, errback);
    });

    it('addRequest() must resolve for a bunch of requests', function() {
        var NodeSetStub = inherit({
            getNewSession: function(req) {
                if (!this.counter) {
                    this.counter = 0;
                }
                ++this.counter;
                switch (this.counter % 3) {
                    case 0:
                        return q(new SessionStub(req.sessionId));
                    case 1:
                        return q(null);
                    case 2:
                        return q.reject('Fake getNewSession() error');
                }
            }
        });

        var queue = new SessionQueue({}, new NodeSetStub()),
            sessions = _.times(5, function() {
                var id = _.uniqueId('session');
                return queue.addRequest(createRequest({sessionId: id}))
                    .then(function(res) {
                        expect(res).to.be.instanceOf(SessionStub);
                        expect(res.getId()).to.equal(id);
                    });
            });

        return q(sessions).all();
    });

    it('addRequest() must eventually resolve when satisfying node arrives', function() {
        var NodeSetStub = inherit({
            getNewSession: function(req) {
                var self = this;
                if (!self.timeout) {
                    self.timeout = setTimeout(function() {
                        self.session = new SessionStub(req.sessionId);
                    }, 50);
                }
                return q(self.session);
            }
        });

        var queue = new SessionQueue({}, new NodeSetStub());
        return queue.addRequest(createRequest({sessionId: 'my-new-session'}))
            .then(function(res) {
                expect(res).to.be.instanceOf(SessionStub);
                expect(res.getId()).to.equal('my-new-session');
            });
    });

    it('request should be removed from queue on client disconnect', function() {
        var NodeSetStub = inherit({
            getNewSession: function(req) {
                return q(new SessionStub(req.sessionId)).delay(50);
            }
        });

        var queue = new SessionQueue({}, new NodeSetStub()),
            callback = function() {
                throw new Error('Must not resolve');
            },
            errback = function(err) {
                expect(err).to.be.instanceOf(Error);
                expect(queue.getRequestCount()).to.equal(0);
            },
            req = createRequest({sessionId: 'my-new-session'}),
            res = queue.addRequest(req)
                .then(callback, errback);

            req.node.emit('close');

        return res;
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

function createRequest(data) {
    return extend({node: new httpIncomingMessage()}, data || {});
}
