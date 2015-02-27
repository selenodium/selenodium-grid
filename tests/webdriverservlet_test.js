var server = require('../server'),
    registry = require('../lib/registry'),
    models = require('../lib/models'),
    store = require('../lib/store'),
    q = require('q'),
    http = require('http'),
    expect = require('must'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers');

describe('WebDriverServlet', function() {
	describe('Correctly forward to a node', function() {
        var app, nodeMock;
        beforeEach(function() {
            return helpers.createAndRegisterNodeMock(q.nfcall(server), {port: 5590})
                .spread(function(mock, application) {
                    nodeMock = mock;
                    app = application;
                });
        });

        afterEach(function() {
            return helpers.unregisterNodeMock(app, nodeMock)
                .then(function() {
                    return q(app).nmcall('destroy');
                });
        });

        it('can open a new browser session on a remote WebDriver node', function() {
            // open new session
            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .expect(302)
                .expect('Location', new RegExp('^/wd/hub/session/\\w+$'));
        });

        it('should correctly redirect if the desired version is not a string but an int', function() {
            // open new session
            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox', version: 9}})
                .expect(302);
        });

        it('should clean up registry when sending the delete command', function() {
            // open new session
            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .then(function(res) {
                    var sessionID = helpers.getWDSessionId(res);
                    // delete opened session
                    return supertest(app)
                        .delete('/wd/hub/session/' + sessionID)
                        .send({desiredCapabilities: {browserName: 'firefox'}})
                        .expect(200, '');
                });

                // TODO: should move out to a separate registry test
                //// session should be in the registry
                //registry.getSessionById(sessionID, function(session) {
                //    session.should.be.an.instanceof(models.Session);
                //
                //    request(app)
                //        .delete('/wd/hub/session/' + sessionID)
                //        .send({desiredCapabilities: {browserName: 'firefox'}})
                //        .expect(200, '')
                //        .end(function(err, res) {
                //            if (err) {
                //                done(err);
                //                return;
                //            }
                //
                //            // session should be no longer in registry
                //            registry.getSessionById(sessionID, function(session) {
                //                assert.equal(session, undefined);
                //                done();
                //            });
                //        });
                //});
        });

        it('should fail when specifying an unknown sessionId', function() {
            // send a command with invalid sessionId
            return supertest(app)
                .post('/wd/hub/session/4354353453/url')
                .send({url: 'http://testingbot.com'})
                .expect(500, 'Unknown sessionId: 4354353453');

            // TODO: should move out to a separate registry test
            //registry.getSessionById('4354353453', function(session) {
            //	assert.equal(session, undefined);
            //	done();
            //});
        });

        it('should correctly unlock a findNode', function() {
            // open new session
            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .then(function(res) {
                    var sessionID = helpers.getWDSessionId(res);
                    // delete opened session
                    return supertest(app)
                        .delete('/wd/hub/session/' + sessionID);
                })
                .then(function(res) {
                    // open another new session
                    return supertest(app)
                        .post('/wd/hub/session')
                        .send({desiredCapabilities: {browserName: 'firefox'}})
                        .expect(302);
                })
        });

        it('should be possible to end a test twice (double teardown bug)', function() {
            // open new session
            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .then(function(res) {
                    var sessionID = helpers.getWDSessionId(res);
                    // delete opened session
                    return supertest(app)
                        .delete('/wd/hub/session/' + sessionID)
                        .expect(200, '')
                        .then(function(res) {
                            // try to delete opened session once again
                            supertest(app)
                                .delete('/wd/hub/session/' + sessionID)
                                .expect(500, 'Unknown sessionId: ' + sessionID);
                        });
                });

            // TODO: should move out to a separate registry test
            //// should be in the registry
            //registry.getSessionById(sessionID, function(session) {
            //    session.should.be.an.instanceof(models.Session);
            //
            //    // delete opened session
            //    request(app)
            //        .delete('/wd/hub/session/' + sessionID)
            //        .end(function(err, res) {
            //            // delete opened session once againe
            //            request(app)
            //                .delete('/wd/hub/session/' + sessionID)
            //                .expect(200, '')
            //                .end(function(err, res) {
            //                    registry.getSessionById(sessionID, function(session) {
            //                        assert.equal(session, undefined);
            //                        done();
            //                    });
            //                });
            //        });
            //});
        });
	});

    describe('handle timeouts during test', function() {
        var app, nodeMock;
        beforeEach(function() {
            registry.TEST_TIMEOUT = 6000;
            registry.NODE_TIMEOUT = 40000;

            return helpers.createAndRegisterNodeMock(q.nfcall(server), {port: 5590})
                .spread(function(mock, application) {
                    nodeMock = mock;
                    app = application;
                });
        });

        afterEach(function() {
            registry.TEST_TIMEOUT = 90000;

            return helpers.unregisterNodeMock(app, nodeMock)
                .then(function() {
                    return q(app).nmcall('destroy');
                });
        });

        it('should correctly handle timeouts during tests. If it takes xx seconds before a new command is received, the test should time out and resources should be cleaned', function() {
            this.timeout(40000);

            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .expect(302)
                .then(function(res) {
                    var sessionID = helpers.getWDSessionId(res);
                    // 30 seconds wait for the next command
                    return q.delay(30000)
                        .then(function() {
                            return supertest(app)
                                .post('/wd/hub/session/' + sessionID + '/url')
                                .send({url: 'http://testingbot.com'})
                                .expect(500, 'Unknown sessionId: ' + sessionID);
                        });
                });

            //// should be in the registry
            //registry.getSessionById(sessionID, function(session) {
            //    session.should.be.an.instanceof(models.Session);
            //
            //    // now wait for the next command
            //    setTimeout(function() {
            //        request(app)
            //            .post('/wd/hub/session/' + sessionID + '/url')
            //            .send({url: 'http://testingbot.com'})
            //            .expect(500, 'Unknown sessionId: ' + sessionID)
            //            .end(function(err, res) {
            //                registry.getSessionById(sessionID, function(session) {
            //                    assert.equal(session, undefined);
            //                    done();
            //                });
            //            });
            //    }, 30000);
            //});
        });

        it('should not timeout when a test is behaving', function() {
            this.timeout(5000);

            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .then(function(res) {
                    var sessionID = helpers.getWDSessionId(res);
                    // 3 seconds wait for the next command
                    return q.delay(3000)
                        .then(function() {
                            return supertest(app)
                                .delete('/wd/hub/session/' + sessionID)
                                .expect(200);
                        });
                });
        });
    });

	xdescribe('extracting parameters', function() {
        var app;
        before(function() {
            app = server();
        });

        after(function(done) {
            app.destroy(done);
        });

		it('should correctly extract desired capabilities from a request', function(done) {
            var nodeServerMock = http
                .createServer(function(req, res) {
                    var url = req.url.toString();
                    if (url.indexOf('/session') > -1 && req.method.toUpperCase() !== 'DELETE') {
                        // this node should receive the command
                        supertest(app)
                            .get('/grid/unregister?id=http://127.0.0.1:5592')
                            .expect(200, 'OK - Bye')
                            .end(function(err, res) {
                                nodeServerMock.close(done);
                            });
                    }
                })
                .listen(5592, '127.0.0.1', function() {
                    var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"LINUX","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5592,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5592","remoteHost":"http://127.0.0.1:5592","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

                    supertest(app)
                        .post('/grid/register')
                        .send(postData)
                        .expect(200, 'OK - Welcome')
                        .end(function(err, res) {
                            supertest(app)
                                .post('/wd/hub/session')
                                .send({
                                    desiredCapabilities: {
                                        browserName: 'firefox',
                                        platform: 'LiNux',
                                        version: 14
                                    }
                                })
                                .end(function(err, res) {});
                        });
                });
		});

		it('should add a request as pending when the desired capabilities can not currently be satisified', function(done) {
			this.timeout(9000);

			var nodeServerMock = http.createServer(function(req, res) {})
                .listen(5593, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"3","alias":"FF14"}],"configuration":{"port":5560,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5593","remoteHost":"http://127.0.0.1:5593","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			supertest(app)
				.post('/grid/register')
				.send(postData)
                .expect(200, 'OK - Welcome')
				.end(function(err, res) {
					expect(registry.pendingRequests, 'pendingRequests').to.be.empty();

					setTimeout(function() {
                        expect(registry.pendingRequests).to.not.be.empty();
						supertest(app)
							.get('/grid/unregister?id=http://127.0.0.1:5593')
                            .expect(200, 'OK - Bye')
                            .end(function(err, res) {
								nodeServerMock.close();
					  			done();
							});
					}, 4000);

					supertest(app)
						.post('/wd/hub/session')
                        .send({
                            desiredCapabilities: {
                                browserName: 'firefox',
                                platform: 'LINUX',
                                version: 3
                            }
                        })
						.end(function(err, res) {});
				});
		});
	});
});
