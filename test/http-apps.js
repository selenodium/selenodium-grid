'use strict';

var apps = require('../lib/http-apps'),
    expect = require('must'),
    AssertionError = require('assertion-error'),
    q = require('q');

describe('http-apps', function() {
    describe('HubRouter', function() {
        var registry = function(val) {
                return String(val).toUpperCase();
            },
            simpleApp = function(req, res, registry) {
                return registry('simple');
            },
            defaultApp = function(req, res, registry) {
                return registry('default');
            },
            select = function(req) {
                switch (req) {
                    case 'simple':
                        return simpleApp;
                    default:
                        return defaultApp;
                }
            },
            router = apps.HubRouter(select, registry);

        it('must route and pass registry argument', function() {
            return router('simple')
                .then(function(res) {
                    expect(res).to.equal('SIMPLE');
                });
        });
    });

    describe('HandleRejections', function() {
        it('must reject on rejected promise with onhandled error', function() {
            var app = function() {
                    return q.reject(new Error('test error'));
                },
                callback = function() {
                    throw AssertionError('must not resolve');
                },
                errback = function(err) {
                    expect(err).to.be.instanceOf(Error);
                    expect(err.message).to.equal('test error');
                };

            return apps.HandleRejections(app)()
                .then(callback, errback);
        });

        it('must convert rejection with ordinal response to resolution', function() {
            var app = function() {
                return q.reject('data');
            };

            return apps.HandleRejections(app)()
                .catch(function() {
                    throw AssertionError('must not reject');
                })
                .then(function(res) {
                    expect(res).to.equal('data');
                });
        });
    });

    describe('HandleJsonRequests', function() {
        it('must process correct json request', function() {
            var req = {
                    headers: {'content-type': 'application/json'},
                    body: {
                        read: function() {
                            return q('{"a": 1, "b": 2}');
                        }
                    }
                },
                app = function(req) {
                    return req;
                };

            return apps.HandleJsonRequests(app)(req)
                .then(function(req) {
                    expect(req.data).to.eql({a: 1, b: 2});
                });
        });

        it('must reject with 400 Bad Request for inappropriate request', function() {
            var req = {
                    headers: {'content-type': 'application/json'},
                    body: {
                        read: function() {
                            return q('wrong content');
                        }
                    }
                },
                callback = function() {
                    throw AssertionError('must not resolve');
                },
                errback = function(res) {
                    expect(res.status).to.equal(400);
                },
                app = function() {};

            return apps.HandleJsonRequests(app)(req)
                .then(callback, errback);
        });
    });

    describe('HandleUrlEncodedRequests', function() {
        it('must process urlencoded request', function() {
            var req = {
                    headers: {'content-type': 'x-www-form-urlencoded'},
                    body: {
                        read: function() {
                            return q('a=1&b=2&c');
                        }
                    }
                },
                app = function(req) {
                    return req;
                };

            return apps.HandleUrlEncodedRequests(app)(req)
                .then(function(req) {
                    expect(req.data).to.eql({a: '1', b: '2', c: ''});
                });
        });
    });

    describe('ParseRequest', function() {
        it('must parse and set query and pathname properties', function() {
            var url = 'https://example.com/my-data/save?a=1&b=2&c',
                req = {url: url},
                app = function(req) {
                    return req;
                },
                res = apps.ParseRequest(app)(req);

            expect(res.pathname).to.equal('/my-data/save');
            expect(res.query).to.eql({a: '1', b: '2', c: ''});
        });
    });

    describe('processJsonBody', function() {
        it('must process json body and place result to the data property of request', function() {
            var req = {
                headers: {'content-type': 'application/json'},
                body: {
                    read: function() {
                        return q('{"a": 1, "b": 2}');
                    }
                }
            };

            return apps.processJsonBody(req)
                .then(function(req) {
                    expect(req.data).to.eql({a: 1, b: 2});
                });
        });

        it('must not process json in case of inappropriate content-type header', function() {
            var req = {
                headers: {'content-type': 'text/plain'},
                body: {
                    read: function() {
                        return q('{"a": 1, "b": 2}');
                    }
                }
            };

            return apps.processJsonBody(req)
                .then(function(req) {
                    expect(req.data).to.be.undefined();
                });
        });

        it('must fail on parsing of inappropriate body content', function() {
            var req = {
                    headers: {'content-type': 'application/json'},
                    body: {
                        read: function() {
                            return q('wrong content');
                        }
                    }
                },
                callback = function() {
                    throw AssertionError('must not resolve');
                },
                errback = function(err) {
                    expect(err).to.be.instanceOf(Error);
                    expect(err.message).to.match(/unexpected token/i);
                };

            return apps.processJsonBody(req)
                .then(callback, errback);
        });
    });

    describe('processUrlEncodedBody', function() {
        it('must process unrencoded body and place result to the data property of request', function() {
            var req = {
                headers: {'content-type': 'x-www-form-urlencoded'},
                body: {
                    read: function() {
                        return q('a=1&b=2&c');
                    }
                }
            };

            return apps.processUrlEncodedBody(req)
                .then(function(req) {
                    expect(req.data).to.eql({a: '1', b: '2', c: ''});
                });
        });

        it('must not process urlencoded body in case of inappropriate content-type header', function() {
            var req = {
                headers: {'content-type': 'text/plain'},
                body: {
                    read: function() {
                        return q('a=1&b=2&c');
                    }
                }
            };

            return apps.processUrlEncodedBody(req)
                .then(function(req) {
                    expect(req.data).to.be.undefined();
                });
        });

        it('must not reject on parsing of inappropriate body content', function() {
            var req = {
                    headers: {'content-type': 'x-www-form-urlencoded'},
                    body: {
                        read: function() {
                            return q('wrong content');
                        }
                    }
                };

            return apps.processUrlEncodedBody(req)
                .then(function(req) {
                    expect(req.data).to.eql({'wrong content': ''});
                });
        });
    });

    describe('statusResponse', function() {
        it('must reject with response object, populated with appropriate body content', function() {
            var req = {method: 'POST', path: '/data/save', headers: {}},
                callback = function() {
                    throw AssertionError('must not resolve');
                },
                errback = function(res) {
                    var body = res.body.join('');

                    expect(res.status).to.equal(400);
                    expect(res.statusMessage).to.equal('Bad Request');
                    expect(body).to.include('POST');
                    expect(body).to.include('/data/save');
                    expect(body).to.include('my message');
                };

            return apps.statusResponse(req, 400, 'my message')
                .then(callback, errback);
        });
    });
});
