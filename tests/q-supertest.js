// Could be better implementation
// https://github.com/WhoopInc/supertest-as-promised/blob/master/index.js

var q = require('q'),
    supertest = require('supertest'),
    Test = supertest.Test,
    end = Test.prototype.end;

/**
 * @param [fn] callback
 * @returns {Promise}
 */
Test.prototype.end = function(fn) {
    var defer = q.defer();
    end.call(this, function(err, res) {
        if (err) {
            return defer.reject(err);
        }
        defer.resolve(res);
    });

    return defer.promise.nodeify(fn);
};

/**
 * @param onFulfilled
 * @param [onRejected]
 * @returns {Promise}
 */
Test.prototype.then = function(onFulfilled, onRejected) {
    return this.end().then(onFulfilled, onRejected);
};

module.exports = supertest;
