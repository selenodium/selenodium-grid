var server = require('../server'),
    path = require('path'),
    fs = require('q-io/fs'),
    supertest = require('./q-supertest');

describe('apiHubServlet', function() {
    var app;
    before(function() {
        return server()
            .then(function(application) {
                app = application;
            });
    });

    after(function(done) {
        app.destroy(done);
    });

	describe('GET /grid/api/hub', function() {
		it('must respond with the hub configuration', function() {
            return fs.read(path.join(__dirname, '..', 'config.json'))
                .then(function(data) {
                    return supertest(app)
                        .get('/grid/api/hub/')
                        .expect(200, JSON.parse(data.toString()))
                        .expect('Content-Type', /json/);
                });
		});
	});
});
