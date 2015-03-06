var server = require('../server'),
    q = require('q'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers'),
    registry = require('../lib/registry');

describe('apiProxyServlet', function() {
    var app, tester;
    before(function() {
        return server().listen(0)
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
                    .expect(404, {
                        msg: 'Cannot find proxy with ID=' + nodeUrl + ' in the registry.',
                        success: false
                    });
            });

            it('must respond with ok if the node was registered before', function() {
                // register node on the grid
                return tester
                    .post('/grid/register')
                    .send(helpers.createRegisterPost(nodeOpts))
                    .expect(200, 'OK - Welcome')
                    .then(function() {
                        // query for the node id
                        return tester
                            .get('/grid/api/proxy?id=' + nodeUrl)
                            .expect(200, {
                                msg: 'Proxy found!',
                                success: true
                            });
                    })
                    .then(function() {
                        // unregister node from the grid
                        return tester
                            .post('/grid/unregister?id=' + nodeUrl)
                            .expect(200, 'OK - Bye');
                    });
            });
        });

        describe('timeout', function() {
            var nodeTimeoutOld;
            before(function() {
                nodeTimeoutOld = registry.NODE_TIMEOUT;
                registry.NODE_TIMEOUT = 1000;
            });

            after(function() {
                registry.NODE_TIMEOUT = nodeTimeoutOld;
            });

            var nodeOpts = {port: 5560},
                nodeUrl = helpers.createNodeUrl(nodeOpts);

            beforeEach(function() {
                // register node on the grid
                return tester
                    .post('/grid/register')
                    .send(helpers.createRegisterPost(nodeOpts))
                    .expect(200, 'OK - Welcome');
            });

            afterEach(function() {
                // unregister node from the grid
                return tester
                    .post('/grid/unregister?id=' + nodeUrl)
                    .expect(200, 'OK - Bye');
            });

            it('must return a not found response if the node has not shown up again in NODE_TIMEOUT time', function() {
                this.timeout(5000);

                return q.delay(3000)
                    .then(function() {
                        return tester
                            // query for the node id
                            .get('/grid/api/proxy?id=' + nodeUrl)
                            .expect(404, {
                                msg: 'Cannot find proxy with ID=' + nodeUrl + ' in the registry.',
                                success: false
                            });
                    });
            });

            // TODO: move this test out to registerservlet_test or registry_test
            it('must be possible to register the node again after it has been removed from registry after NODE_TIMEOUT time', function() {
                this.timeout(5000);

                return q.delay(3000)
                    .then(function() {
                        // query for the node id
                        return tester
                            .get('/grid/api/proxy?id=' + nodeUrl)
                            .expect(404, {
                                msg: 'Cannot find proxy with ID=' + nodeUrl + ' in the registry.',
                                success: false
                            });
                    })
                    .then(function() {
                        // register node on the grid
                        return tester
                            .post('/grid/register')
                            .send(helpers.createRegisterPost(nodeOpts))
                            .expect(200, 'OK - Welcome');
                    });
            });
        });
    });
});
