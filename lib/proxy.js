var q = require('q'),
    http = require('q-io/http');

function proxy(req, node) {
    return http
        .request({
            host: node.host,
            port: node.port,
            method: req.method,
            path: req.path,
            headers: req.headers,
            body: req.data ? [JSON.stringify(req.data)] : req.body
        })
        .fail(function(err) {
            // TODO: implement retries
            return q.reject(err);
        });
}

module.exports = proxy;
