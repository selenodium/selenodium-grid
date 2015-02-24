var server = require('../server');
var registry = require('../lib/registry');

var http = require('http');
var should = require('should');
var request = require('supertest');
var assert = require('assert');
var models = require('../lib/models');
var testData = require('./testdata');

describe('Parallel Tests', function() {

    describe('parallel tests', function() {
        var app;
        before(function() {
            app = server();
        });

        after(function(done) {
            app.close(done);
        });

        var nodes = [];
        beforeEach(function(done) {
            for (var i = 0; i < 10; i++) {
                (function(i) {
                    var port = 5656 + i,
                        node = http
                            .createServer(function(req, res) {
                                var url = req.url.toString();
                                if (url.indexOf('getNewBrowserSession') > -1) {
                                    res.writeHead(200, {'Content-Type': 'text/plain'});
                                    res.end('OK,' + testData.getSessionID());
                                } else if (url.indexOf('testComplete') > -1) {
                                    res.writeHead(200, {'Content-Type': 'text/plain'});
                                    res.end('OK');
                                }
                            })
                            .listen(port, '127.0.0.1', function() {
                                var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":' + port + ',"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:' + port + '","remoteHost":"http://127.0.0.1:' + port + '","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

                                request(app)
                                    .post('/grid/register')
                                    .send(postData)
                                    .end(function(err, res) {
                                        res.statusCode.should.equal(200);
                                        res.text.should.equal('OK - Welcome');

                                        nodes.push(node);
                                        if (nodes.length == 10) {
                                            done();
                                        }
                                    });
                            });
                })(i);
            }
        });

        afterEach(function(done) {
            this.timeout(5000);

            var processed = 0;
            for (var i = 0; i < nodes.length; i++) {
                (function(i) {
                    var port = 5656 + i;
                    request(app)
                        .get('/grid/unregister?id=http://127.0.0.1:' + port)
                        .end(function(err, res) {
                            res.statusCode.should.equal(200);
                            res.text.should.equal('OK - Bye');

                            nodes[i].close(function() {
                                ++processed;
                                if (processed >= nodes.length) {
                                    done();
                                }
                            });
                        });
                })(i);
            }
        });

        it('should be possible to run tests in parallel across different nodes at once', function(done) {
            this.timeout(5000);

            var processed = 0;
            for (var i = 0; i < nodes.length; i++) {
                request(app)
                    .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + '&client_secret=' + testData.CLIENT_SECRET)
                    .end(function(err, res) {
                        var sessionID = res.text.replace('OK,', '');
                        // stop session in 500ms
                        setTimeout(function() {
                            request(app)
                                .get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
                                .end(function(err, res) {
                                    ++processed;
                                    if (processed >= nodes.length) {
                                        done();
                                    }
                                });
                        }, 500);
                    });
            }
        });
    });

    describe('parallel tests', function() {
        var app;
        before(function() {
            app = server();
        });

        after(function(done) {
            app.close(done);
        });

        var nodes = [];
        beforeEach(function(done) {
            nodes = [];
            for (var i = 0; i < 10; i++) {
                (function(i) {
                    var port = 5756 + i,
                        node = http
                            .createServer(function(req, res) {
                                var url = req.url.toString();
                                if (url.indexOf('getNewBrowserSession') > -1) {
                                    res.writeHead(200, {'Content-Type': 'text/plain'});
                                    res.end('OK,' + Math.round(Math.random() * 100000342342342300000) + Math.round(Math.random() * 1000023423423432000000));
                                } else if (url.indexOf('testComplete') > -1) {
                                    res.writeHead(200, {'Content-Type': 'text/plain'});
                                    res.end('OK');
                                }
                            })
                            .listen(port, '127.0.0.1');

                    var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":' + port + ',"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:' + port + '","remoteHost":"http://127.0.0.1:' + port + '","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

                    request(app)
                        .post('/grid/register')
                        .send(postData)
                        .end(function(err, res) {
                            res.statusCode.should.equal(200);
                            res.text.should.equal('OK - Welcome');

                            nodes.push(node);
                            if (nodes.length == 10) {
                                done();
                            }
                        });
                })(i);
            }
        });

        afterEach(function(done) {
            this.timeout(30000);

            var processed = 0;
            for (var j = 0; j < nodes.length; j++) {
                (function(j) {
                    var port = 5756 + j;
                    request(app)
                        .get('/grid/unregister?id=http://127.0.0.1:' + port)
                        .end(function(err, res) {
                            res.statusCode.should.equal(200);
                            res.text.should.equal('OK - Bye');

                            nodes[j].close(function() {
                                ++processed;
                                if (processed >= nodes.length) {
                                    done();
                                }
                            });
                        });
                })(j);
            }
        });

        it('should be possible to start more tests in parallel than the number of nodes available, all tests should succeed', function(done) {
            this.timeout(30000);

            var processed = 0;
            // we ask 15 but we only have 10 nodes available
            for (var i = 0; i < 15; i++) {
                request(app)
                    .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + '&client_secret=' + testData.CLIENT_SECRET)
                    .end(function(err, res) {
                        var sessionID = res.text.replace('OK,', '');
                        // stop session, the next one should start
                        request(app)
                            .get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
                            .end(function(err, res) {
                                ++processed;
                                if (processed >= 15) {
                                    done();
                                }
                            });
                    });
            }
        });
    });
});
