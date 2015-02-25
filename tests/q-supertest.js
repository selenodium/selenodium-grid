var q = require('q'),
    supertest = require('supertest'),
    Test = supertest.Test,
    end = Test.prototype.end;

/**
 * @param [fn] callback
 * @returns {Promise}
 */
Test.prototype.end = function(fn) {
    return q.denodeify(end.bind(this))()
        .nodeify(fn);
};

module.exports = supertest;
