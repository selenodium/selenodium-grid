var server = require('../server'),
    should = require('should'),
    path = require('path'),
    fs = require('fs'),
    request = require('supertest');

describe('Server', function() {
	describe('GET /grid/api/hub', function() {
		it('responds with the hub configuration', function(done) {
            fs.readFile(path.join(__dirname, '..', 'config.json'), function (err, data) {
                request(server())
                    .get('/grid/api/hub/')
                    .end(function (err, res) {
                        var config = JSON.parse(data.toString());
                        res.statusCode.should.equal(200);

                        res.body.should.be.an.instanceOf(Object);
                        res.body.port.should.equal(config.port);
                        res.body.host.should.equal(config.host);

                        done();
                    });
            });
		});
	});
});
