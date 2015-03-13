var server = require('../lib/server'),
    config = require('../lib/config'),
    Registry = require('../lib/registry_'),
    path = require('path'),
    fs = require('q-io/fs'),
    supertest = require('./q-supertest');

describe('apiHubServlet', function() {
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

	describe('GET /grid/api/hub', function() {
		it('must respond with the hub configuration', function() {
            return fs.read(path.join(__dirname, '..', 'config', 'default.json'))
                .then(function(data) {
                    return tester
                        .get('/grid/api/hub/')
                        .expect(200, JSON.parse(data.toString()))
                        .expect('Content-Type', /json/);
                });
		});
	});
});
