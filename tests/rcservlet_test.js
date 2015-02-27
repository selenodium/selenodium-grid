var server = require('../server'),
    registry = require('../lib/registry'),
    models = require('../lib/models'),
    store = require('../lib/store'),
    q = require('q'),
    http = require('http'),
    expect = require('must'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers');

describe('RCServlet', function() {
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

        it('can open a new browser session on a remote RC node', function() {
            // open new session
            return supertest(app)
                .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox')
                .expect(200, /OK,\w+/);
        });

        it('should clean up registry when sending the complete command', function() {
            // open new session
            return supertest(app)
                .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox')
                .expect(200, /OK,\w+/)
                .then(function(res) {
                    var sessionID = helpers.getRCSessionId(res);
                    // delete opened session
                    return supertest(app)
                        .get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
                        .expect(200, 'OK');
                });
        });

        it('should fail when specifying an unknown sessionId', function() {
            // send a command with invalid sessionId
            return supertest(app)
                .get('/selenium-server/driver?cmd=open&sessionId=4354353453')
                .expect(404, 'Unknown sessionId: 4354353453');
        });

        it('should be possible to end a test twice (double teardown bug)', function() {
            // open new session
            return supertest(app)
                .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox')
                .then(function(res) {
                    var sessionID = helpers.getRCSessionId(res);
                    // delete opened session
                    return supertest(app)
                        .get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
                        .then(function() {
                            // try to delete opened session once again
                            return supertest(app)
                                .get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
                                .expect(404, 'Unknown sessionId: ' + sessionID);
                        });
                });
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

        it('should not timeout when a test is behaving', function() {
            this.timeout(5000);

            return supertest(app)
                .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox')
                .then(function(res) {
                    var sessionID = helpers.getRCSessionId(res);
                    // 3 seconds wait for the next command
                    return q.delay(3000)
                        .then(function() {
                            return supertest(app)
                                .get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
                                .expect(200, 'OK');
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

        it("should correctly extract desired capabilities from a GET request", function(done) {
            var nodeServerMock = http
                .createServer(function(req, res) {
                    var url = req.url.toString();
                    if (url.indexOf('getNewBrowserSession') > -1) {
                        // this node should receive the command
                        assert.ok(true);

                        request(app)
                            .get('/grid/unregister?id=http://127.0.0.1:5572')
                            .end(function(err, res) {
                                res.statusCode.should.equal(200);
                                res.text.should.equal('OK - Bye');
                                nodeServerMock.close();
                                done();
                            });
                    }
                })
                .listen(5572, '127.0.0.1');

            var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"LINUX","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5572,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5572","remoteHost":"http://127.0.0.1:5572","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

            request(app)
                .post('/grid/register')
                .send(postData)
                .end(function(err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.equal('OK - Welcome');

                    request(app)
                        .get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&4=' + encodeURIComponent('PLATFORM=LINUX;version=14') + '&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
                        .end(function(err, res) {
                        });
                });
        });

        it("should correctly extract desired capabilities from a POST request", function(done) {
            var nodeServerMock = http
                .createServer(function(req, res) {
                    var url = req.url.toString();
                    if (url.indexOf('getNewBrowserSession') > -1) {
                        // this node should receive the command
                        assert.ok(true);
                        request(app)
                            .get('/grid/unregister?id=http://127.0.0.1:5573')
                            .end(function(err, res) {
                                res.statusCode.should.equal(200);
                                res.text.should.equal('OK - Bye');
                                nodeServerMock.close();
                                done();
                            });
                    }
                })
                .listen(5573, '127.0.0.1');

            var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"LINUX","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5573,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5573","remoteHost":"http://127.0.0.1:5573","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

            request(app)
                .post('/grid/register')
                .send(postData)
                .end(function(err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.equal('OK - Welcome');

                    request(app)
                        .post('/selenium-server/driver?cmd=getNewBrowserSession&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
                        .send('1=firefox&4=' + encodeURIComponent('PLATFORM=LINUX;version=14'))
                        .end(function(err, res) {

                        });
                });
        });

        it('should add a request as pending when the desired capabilities can not currently be satisified', function(done) {
            this.timeout(9000);
            var nodeServerMock = http
                .createServer(function(req, res) {
                })
                .listen(5574, '127.0.0.1');

            var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5574,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5574","remoteHost":"http://127.0.0.1:5574","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

            request(app)
                .post('/grid/register')
                .send(postData)
                .end(function(err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.equal('OK - Welcome');
                    registry.pendingRequests.should.be.empty;

                    setTimeout(function() {
                        registry.pendingRequests.should.not.be.empty;
                        request(app)
                            .get('/grid/unregister?id=http://127.0.0.1:5574')
                            .end(function(err, res) {
                                res.statusCode.should.equal(200);
                                res.text.should.equal('OK - Bye');
                                nodeServerMock.close();
                                done();
                            });
                    }, 4000);

                    request(app)
                        .post('/selenium-server/driver?cmd=getNewBrowserSession&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
                        .send('1=firefox&4=' + encodeURIComponent('PLATFORM=LINUX;version=14'))
                        .end(function(err, res) {
                        });
                });
        });
    });
});
