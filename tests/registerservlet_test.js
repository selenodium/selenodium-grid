var server = require('../server'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers');

describe('RegisterServlet', function() {
    describe('POST /grid/register', function() {
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

        it('must be possible to register node', function() {
            var postData = helpers.createRegisterPost();
            return supertest(app)
                .post('/grid/register')
                .send(postData)
                .expect(200, 'OK - Welcome');
        });

        it('must response with a 400 bad request when sending invalid data', function() {
            return supertest(app)
                .post('/grid/register')
                .send('nothing')
                .expect(400, 'Invalid parameters');
        });

        it('should be possible to register the same node twice', function() {
            var postData = helpers.createRegisterPost();
            return supertest(app)
                .post('/grid/register')
                .send(postData)
                .expect(200, 'OK - Welcome')
                .then(function() {
                    return supertest(app)
                        .post('/grid/register')
                        .send(postData)
                        .expect(200, 'OK - Welcome');
                });
        });
    });
});
