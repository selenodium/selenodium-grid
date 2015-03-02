var server = require('../server'),
    supertest = require('./q-supertest'),
    helpers = require('./helpers'),
    q = require('q'),
    _ = require('lodash');

describe('Parallel Tests', function() {
    describe('parallel tests', function() {
        var nodesCount = 10,
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
            return nodeMocks
                .invoke('map', function(mock) {
                    return helpers.unregisterNodeMock(app, mock);
                })
                .then(function() {
                    return q(app).nmcall('destroy');
                });
        });

        it('must be possible to run tests in parallel across different nodes at once', function() {
            this.timeout(5000);

            return runTests(app, 10);
        });

        it('must be possible to start more tests in parallel than the number of nodes available, all tests must succeed', function() {
            this.timeout(5000);

            // we ask 20 but we only have 10 nodes available
            return runTests(app, 20);
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
                    // return sessionID in 500 ms
                    return q.delay(helpers.getWDSessionId(res), delay);
                })
                .then(function(sessionID) {
                    // stop session
                    return supertest(app)
                        .delete('/wd/hub/session/' + sessionID)
                        .expect(200, {status: 0});
                });
        })
    );
}
