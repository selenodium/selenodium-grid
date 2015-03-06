var server = require('../server');
var requestHandler = require('../lib/requesthandler');
var registry = require('../lib/registry');
var models = require('../lib/models');
var store = require('../lib/store');
var should = require('should');
var q = require('q');
var util = require('util');
var http = require('http');
var assert = require('assert');
var expect = require('must');
var supertest = require('./q-supertest');
var helpers = require('./helpers');

var nodes = [];
var badNode, goodNode;
var testData = require('./testdata');

describe('RequestHandler', function() {
    before(function(done) {
        store.flushdb(done);
    });

    after(function(done) {
        store.flushdb(done);
    });

    describe('correctly distinguishes between the two protocols', function() {
        it('must determine an RC request', function() {
            var proto = requestHandler.determineProtocol('/selenium-server/driver/?cmd=getNewBrowserSession');
            expect(proto).to.equal('RC');
        });

        it('must determine an WebDriver request', function() {
            var proto = requestHandler.determineProtocol('/wd/hub/session');
            expect(proto).to.equal('WebDriver');
        });
    });

    describe('encoding test', function() {
        var app, nodeMock, tester;
        beforeEach(function() {
            return helpers.createAndRegisterNodeMock(server().listen(0), {port: 5590})
                .spread(function(mock, server) {
                    nodeMock = mock;
                    app = server;
                    tester = supertest(server);
                });
        });

        afterEach(function() {
            return helpers.unregisterNodeMock(app, nodeMock)
                .then(function() {
                    return app.destroy();
                });
        });

        it('should be possible to send and receive weird characters', function() {
            return tester
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .then(function(res) {
                    return helpers.getWDSessionId(res);
                })
                .then(function(sessionID) {
                    var title = 'éñy!';
                    return tester
                        .get(util.format('/wd/hub/session/%s/title?title=%s', sessionID, encodeURIComponent(title)))
                        .expect(200, {status: 0, value: title});
                });
        });
    });

	xdescribe('cleanup when a test has started but does not receive any additional steps', function() {

        var app, tester;
        before(function() {
            return server()
                .listen(0)
                .then(function(server) {
                    app = server;
                    tester = supertest(server);
                });
        });

        after(function() {
            return app.destroy();
        });

        var nodeServerMock;
        beforeEach(function(done) {
			store.flushdb();
			registry.TEST_TIMEOUT = 6000;
			registry.NODE_TIMEOUT = 40000;
			done();
		});

		afterEach(function(done) {
			registry.TEST_TIMEOUT = 90000;
			this.timeout(30000);
			supertest(app)
				.get('/grid/unregister?id=http://127.0.0.1:5580')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					done();
				});
		});

        it('should cleanup the node when a test has started but no other steps have been received', function(done) {
            this.timeout(30000);

            nodeServerMock = http.createServer(function(req, res) {
                var url = req.url.toString();
                var sessionID = testData.getSessionID();
                if (url.indexOf('getNewBrowserSession') > -1) {
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end("OK," + sessionID);
                } else if (url.indexOf('testComplete') > -1) {
                    registry.getSessionById(sessionID, function(err, session) {
                        assert.equal(session, null);
                        // testComplete should be received for this test to succeed
                        done();
                    });
                }
            }).listen(5580, '127.0.0.1');

            var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5580,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5580","remoteHost":"http://127.0.0.1:5580","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

            supertest(app)
                .post('/grid/register')
                .send(postData)
                .end(function(err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.equal("OK - Welcome");

                    // start a new session, but don't do anything after that
                    supertest(app)
                        .get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
                        .end(function(err, res) {
                            res.statusCode.should.equal(200);
                            var sessionID = res.text.replace("OK,", "");
                            // should be in the registry
                            registry.getSessionById(sessionID, function(err, session) {
                                session.should.be.an.instanceof(models.Session);
                            });
                        });
                });
        });
	});

	xdescribe("Retry a test when the start of the test fails", function() {
        var app, tester;
        before(function() {
            return server()
                .listen(0)
                .then(function(server) {
                    app = server;
                    tester = supertest(server);
                });
        });

        after(function() {
            return app.destroy();
        });

        beforeEach(function(d) {
            // mimick an RC node
            store.flushdb();
            badNode = http.createServer(function(req, res) {
                var url = req.url.toString();
                if (url.indexOf('getNewBrowserSession') > -1) {
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end("Error: I am a bad node");
                } else if (url.indexOf('testComplete') > -1) {
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end("OK");
                }
            }).listen(5583, '127.0.0.1');

            var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5583,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5583","remoteHost":"http://127.0.0.1:5583","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

            supertest(app)
                .post('/grid/register')
                .send(postData)
                .end(function(err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.equal("OK - Welcome");

                    goodNode = http.createServer(function(req, res) {
                        var url = req.url.toString();
                        var sessionID = testData.getSessionID();
                        if (url.indexOf('getNewBrowserSession') > -1) {
                            res.writeHead(200, {'Content-Type': 'text/plain'});
                            res.end("OK," + sessionID);
                        } else if (url.indexOf('testComplete') > -1) {
                            res.writeHead(200, {'Content-Type': 'text/plain'});
                            res.end("OK");
                        }
                    }).listen(5584, '127.0.0.1');

                    var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5584,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5584","remoteHost":"http://127.0.0.1:5584","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

                    supertest(app)
                        .post('/grid/register')
                        .send(postData)
                        .end(function(err, res) {
                            res.statusCode.should.equal(200);
                            res.text.should.equal("OK - Welcome");

                            // force the registry to use the badNode first
                            // the goodNode has been used recently
                            var node = store.getNode('127.0.0.1', 5584);
                            store.updateNode(node, d);
                        });
                });

        });

		afterEach(function(d) {
			this.timeout(30000);
			supertest(app)
				.get('/grid/unregister?id=http://127.0.0.1:5583')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					badNode.close();
					supertest(app)
						.get('/grid/unregister?id=http://127.0.0.1:5584')
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("OK - Bye");
							goodNode.close();
							d();
						});
				});
		});

		it('should retry a test when the test fails starting a browser', function(done) {
			this.timeout(30000);
			supertest(app)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					done();
				});
		});
	});
});
