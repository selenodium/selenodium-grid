'use strict';

var server = require('../../lib/server'),
    config = require('../../lib/config'),
    Registry = require('../../lib/registry'),
    supertest = require('q-supertest');

describe('servlets/notImplemented', function() {
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

    describe('GET /grid/driver', function() {
        it('must respond with not implemented', function() {
            return tester
                .get('/grid/driver')
                .expect(501, /not implemented/i);
        });
    });
});
