var q = require('q');

var detectSeries = q.promised(function(arr, iterator, _notFound) {
    if (arr.length === 0) {
        return q(_notFound);
    }
    return iterator(arr[0])
        .then(function(ok) {
            if (ok) {
                return arr[0];
            }
            return detectSeries(arr.slice(1), iterator);
        });
});

exports.detectSeries = detectSeries;
