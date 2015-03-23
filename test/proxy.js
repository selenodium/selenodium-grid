var nock = require('nock'),
    q = require('q'),
    http = require('q-io/http'),
    expect = require('must'),
    proxy = require('../lib/proxy');

describe('proxy', function() {
    before(function() {
        nock.activate();
        this.scope = nock('http://localhost:9000');
    });

    after(function() {
        delete this.scope;
        nock.restore();
    });

    beforeEach(resetStub);
    afterEach(resetStub);

    it('should retry 2 times and get result', function() {
        var self = this;
        this.scope
            .post('/')
                .times(2)
                .socketDelay(300)
                .reply(200, 'OK')
            .post('/')
                .reply(200, 'OK');

        var req = {
                method: 'post',
                path: '/',
                headers: {},
                data: {},
                timeout: 100,
                retries: 2,
                retryDelay: 100
            },
            node = {host: 'localhost', port: 9000};

        return responseBody(proxy(req, node))
            .spread(function(res, body) {
                expect(body).to.equal('OK');
                self.scope.done();
            });
    });

    it('should fail after 3 retries', function() {
        var self = this;
        this.scope
            .post('/')
                .times(4)
                .socketDelay(300)
                .reply(200, 'OK');

        var req = {
                method: 'post',
                path: '/',
                headers: {},
                data: {},
                timeout: 100,
                // retries: 3, // default
                retryDelay: 100
            },
            node = {host: 'localhost', port: 9000};

        return responseBody(proxy(req, node))
            .catch(function() {
                return true;
            })
            .then(function(catched) {
                expect(catched).to.be.true();
                self.scope.done();
            });
    });
});

function resetStub() {
    nock.cleanAll();
}

function responseBody(res) {
    return q(res)
        .then(function(res) {
            return res.body.read()
                .then(function(body) {
                    return [res, body.toString(res.charset)];
                });
        });
}
