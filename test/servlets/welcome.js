'use strict';

var server = require('../../lib/server'),
    config = require('../../lib/config'),
    Registry = require('../../lib/registry'),
    supertest = require('q-supertest');

describe('servlets/welcome', function() {
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

    describe('GET /', function() {
        it('must respond with welcome message', function() {
            return tester
                .get('/')
                .expect(200, /welcome/i);
        });
    });
});
