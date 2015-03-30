var server = require('../../lib/server'),
    config = require('../../lib/config'),
    Registry = require('../../lib/registry'),
    q = require('q'),
    supertest = require('q-supertest'),
    helpers = require('../helpers');

describe('apiProxyServlet', function() {
    var app, tester;
    before(function() {
        return server(new Registry(config())).listen(0)
            .then(function(server) {
                app = server;
                tester = supertest(server);
            });
    });

    after(function() {
        return app.destroy();
    });

    describe('GET /grid/api/proxy', function() {
        describe('simple', function() {
            var nodeOpts = {port: 5560},
                nodeUrl = helpers.createNodeUrl(nodeOpts);

            it('must respond with error if the node was not registered first', function() {
                // query for the node id
                return tester
                    .get('/grid/api/proxy?id=' + nodeUrl)
                    .expect(200, {
                        msg: 'Cannot find proxy with ID=' + nodeUrl + ' in the registry.',
                        success: false
                    });
            });

            it('must respond with ok if the node was registered before', function() {
                // register node on the grid
                var regReq = helpers.createRegisterPost(nodeOpts);
                return tester
                    .post('/grid/register')
                    .send(regReq)
                    .expect(200, 'ok')
                    .then(function() {
                        // query for the node id
                        return tester
                            .get('/grid/api/proxy?id=' + nodeUrl)
                            .expect(200, {
                                id: nodeUrl,
                                request: regReq,
                                msg: 'Proxy found!',
                                success: true
                            });
                    })
                    .then(function() {
                        // unregister node from the grid
                        return tester
                            .post('/grid/unregister?id=' + nodeUrl)
                            .expect(200, 'ok');
                    });
            });
        });

        describe('timeout', function() {
            var nodeOpts = {
                    port: 5560,
                    nodePolling: 200,
                    downPollingLimit: 1,
                    unregisterIfStillDownAfter: 500,
                    nodeStatusCheckTimeout: 50
                },
                nodeUrl = helpers.createNodeUrl(nodeOpts);

            beforeEach(function() {
                // register node on the grid
                return tester
                    .post('/grid/register')
                    .send(helpers.createRegisterPost(nodeOpts))
                    .expect(200, 'ok');
            });

            afterEach(function() {
                // unregister node from the grid
                return tester
                    .post('/grid/unregister?id=' + nodeUrl)
                    .expect(200, 'ok');
            });

            it('must return a not found response if the node was unregistered after timeout', function() {
                this.timeout(3000);

                return q.delay(2000)
                    .then(function() {
                        return tester
                            // query for the node id
                            .get('/grid/api/proxy?id=' + nodeUrl)
                            .expect(200, {
                                msg: 'Cannot find proxy with ID=' + nodeUrl + ' in the registry.',
                                success: false
                            });
                    });
            });

            // TODO: move this test out to registerservlet_test or registry_test
            it('must be possible to register the node again after it has been removed from registry after timeout', function() {
                this.timeout(3000);

                return q.delay(2000)
                    .then(function() {
                        // query for the node id
                        return tester
                            .get('/grid/api/proxy?id=' + nodeUrl)
                            .expect(200, {
                                msg: 'Cannot find proxy with ID=' + nodeUrl + ' in the registry.',
                                success: false
                            });
                    })
                    .then(function() {
                        // register node on the grid
                        return tester
                            .post('/grid/register')
                            .send(helpers.createRegisterPost(nodeOpts))
                            .expect(200, 'ok');
                    });
            });
        });
    });
});
