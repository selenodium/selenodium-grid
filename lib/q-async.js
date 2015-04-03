var q = require('q');

var detectSeries = q.promised(function(arr, iterator, _notFound) {
    if (arr.length === 0) {
        return q(_notFound);
    }
    return q(iterator(arr[0]))
        .then(function(ok) {
            if (ok) {
                return arr[0];
            }
            return detectSeries(arr.slice(1), iterator, _notFound);
        });
});

var doFirstSeries = q.promised(function(arr, iterator, _notFound) {
    if (arr.length === 0) {
        return q(_notFound);
    }
    return q(iterator(arr[0]))
        .then(function(res) {
            if (res) {
                return res;
            }
            return doFirstSeries(arr.slice(1), iterator, _notFound);
        });
});

exports.detectSeries = detectSeries;
exports.doFirstSeries = doFirstSeries;
