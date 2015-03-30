var server = require('../../lib/server'),
    config = require('../../lib/config'),
    Registry = require('../../lib/registry'),
    supertest = require('../q-supertest'),
    helpers = require('../helpers');

describe('RegisterServlet', function() {
    describe('POST /grid/register', function() {
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

        it('must be possible to register node', function() {
            var nodeOpts = {port: 5560},
                postData = helpers.createRegisterPost(nodeOpts);

            return tester
                .post('/grid/register')
                .send(postData)
                .expect(200, 'ok')
                .then(function() {
                    return tester
                        .get('/grid/unregister?id=' + helpers.createNodeUrl(nodeOpts))
                        .expect(200, 'ok');
                });
        });

        it('must response with a 400 bad request when sending invalid data', function() {
            return tester
                .post('/grid/register')
                .send('nothing')
                .expect(400, 'Invalid parameters');
        });

        it('should be possible to register the same node twice', function() {
            var nodeOpts = {port: 5560},
                postData = helpers.createRegisterPost(nodeOpts);

            return tester
                .post('/grid/register')
                .send(postData)
                .expect(200, 'ok')
                .then(function() {
                    return tester
                        .post('/grid/register')
                        .send(postData)
                        .expect(200, 'ok');
                })
                .then(function() {
                    return tester
                        .get('/grid/unregister?id=' + helpers.createNodeUrl(nodeOpts))
                        .expect(200, 'ok');
                });
        });
    });
});
