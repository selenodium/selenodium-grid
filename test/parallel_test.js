var server = require('../server'),
    store = require('../lib/store'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers'),
    q = require('q'),
    _ = require('lodash');

describe('Parallel Tests', function() {
    before(function(done) {
        store.flushdb(done);
    });

    after(function(done) {
        store.flushdb(done);
    });

    describe('parallel tests', function() {
        var nodesCount = 5,
            app,
            nodeMocks;

        beforeEach(function() {
            return q.nfcall(server)
                .then(function(application) {
                    app = application;
                    nodeMocks = q.all(
                        _.times(nodesCount, function(i) {
                            return helpers.createAndRegisterNodeMock(application, {port: 5590 + i}).get(0);
                        })
                    );
                    return nodeMocks;
                });
        });

        afterEach(function() {
            this.timeout(10000);

            return nodeMocks
                .invoke('map', function(mock) {
                    return helpers.unregisterNodeMock(app, mock);
                })
                .all()
                .delay(1000)
                .then(function() {
                    return q(app).nmcall('destroy');
                })
                .delay(1000);
        });

        it('must be possible to run tests in parallel across different nodes at once', function() {
            this.timeout(10000);

            return runTests(app, nodesCount);
        });

        it('must be possible to start more tests in parallel than the number of nodes available, all tests must succeed', function() {
            this.timeout(10000);

            // we ask 15 but we only have 5 nodes available
            return runTests(app, nodesCount * 3);
        });

    });
});

function runTests(app, count, delay) {
    delay = delay || 500;

    return q.all(
        _.times(count, function() {
            return supertest(app)
                .post('/wd/hub/session')
                .send({desiredCapabilities: {browserName: 'firefox'}})
                .expect(200)
                .then(function(res) {
                    return helpers.getWDSessionId(res);
                })
                // return sessionId in 500 ms
                .delay(delay)
                .then(function(sessionId) {
                    // stop session
                    return supertest(app)
                        .delete('/wd/hub/session/' + sessionId)
                        .expect(200, {status: 0});
                });
        })
    );
}
