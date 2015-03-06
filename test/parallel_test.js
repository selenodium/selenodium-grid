var server = require('../server'),
    store = require('../lib/store'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers'),
    q = require('q'),
    _ = require('lodash');

describe('Parallel Tests', function() {
    before(function() {
        return store.flushdb();
    });

    after(function() {
        return store.flushdb();
    });

    describe('parallel tests', function() {
        var nodesCount = 5,
            app,
            tester,
            nodeMocks;

        beforeEach(function() {
            return server().listen(0)
                .then(function(server) {
                    app = server;
                    tester = supertest(server);
                    nodeMocks = q.all(
                        _.times(nodesCount, function(i) {
                            return helpers.createAndRegisterNodeMock(server, {port: 5590 + i}).get(0);
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
                    return app.destroy();
                })
                .delay(1000);
        });

        it('must be possible to run tests in parallel across different nodes at once', function() {
            this.timeout(10000);

            return runTests(tester, nodesCount);
        });

        it('must be possible to start more tests in parallel than the number of nodes available, all tests must succeed', function() {
            this.timeout(10000);

            // we ask 15 but we only have 5 nodes available
            return runTests(tester, nodesCount * 3);
        });

    });
});

function runTests(tester, count, delay) {
    delay = delay || 500;

    return q.all(
        _.times(count, function() {
            return tester
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
                    return tester
                        .delete('/wd/hub/session/' + sessionId)
                        .expect(200, {status: 0});
                });
        })
    );
}
