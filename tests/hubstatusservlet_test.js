var server = require('../server'),
    expect = require('must'),
    path = require('path'),
    fs = require('q-io/fs'),
    supertest = require('./q-supertest');

describe('HubStatusServlet', function() {
    var app;
    before(function(done) {
        app = server(done);
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
                        .expect('Content-Type', /json/)
                        .end();
                });
		});
	});
});
