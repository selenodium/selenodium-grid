var async = require('../lib/q-async'),
    expect = require('must');

describe('q-async', function() {
    describe('detectSeries', function() {
        it('must return first element for which iterator returned truthy value', function() {
            var arr = ['a', 'b', 'c'];
            return async.detectSeries(arr, function(val) {
                    return val === 'b';
                })
                .then(function(res) {
                    expect(res).to.equal('b');
                });
        });

        it('must return default value if iterator returned falsy result for all elements', function() {
            var arr = ['a', 'b', 'c'];
            return async.detectSeries(arr, function() {
                    return false;
                }, 'not found')
                .then(function(res) {
                    expect(res).to.equal('not found');
                });
        });
    });

    describe('doFirstSeries', function() {
        it('must return first work result for which iterator returned truthy value', function() {
            var arr = ['a', 'b', 'c'];
            return async.doFirstSeries(arr, function(val) {
                    return val === 'b' ? val.toUpperCase() : false;
                })
                .then(function(res) {
                    expect(res).to.equal('B');
                });
        });

        it('must return default value if iterator returned falsy result for all elements', function() {
            var arr = ['a', 'b', 'c'];
            return async.doFirstSeries(arr, function() {
                    return false;
                }, 'not found')
                .then(function(res) {
                    expect(res).to.equal('not found');
                });
        });
    });
});
