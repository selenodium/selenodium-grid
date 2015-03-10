var Stub = require('real-nock'),
    q = require('q'),
    http = require('q-io/http'),
    expect = require('must'),
    proxy = require('../lib/proxy');

describe('proxy', function() {
    before(function() {
        this.backend = new Stub({port: 9000, debug: true});
        return q(this.backend).ninvoke('start');
    });

    after(function() {
        return q(this.backend).ninvoke('stop');
    });

    beforeEach(resetStub);
    afterEach(resetStub);

    it('should retry 2 times and get result', function() {
        var self = this;
        this.backend.stub
            .post('/')
                .times(2)
                .delayConnection(300)
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
                self.backend.stub.done();
            });
    });

    it('should fail after 3 retries', function() {
        var self = this;
        this.backend.stub
            .post('/')
                .times(4)
                .delayConnection(300)
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
                self.backend.stub.done();
            });
    });
});

function resetStub() {
    this.backend.reset();
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
