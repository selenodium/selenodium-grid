var q = require('q'),
    http = require('q-io/http'),
    log = require('./log');

function proxy(req, node, retryCounter) {
    retryCounter = retryCounter || 0;

    // TODO: make default number of retries configurable
    var retries = req.retries || 3,
        retryDelay = typeof(req.retryDelay) !== 'undefined' ? req.retryDelay : 2000;

    // TODO: should we use separate pool (agent) or increase limit of connections in default one?
    return http
        .request({
            timeout: req.timeout,
            host: node.host,
            port: node.port,
            method: req.method,
            path: req.path,
            headers: req.headers,
            body: req.data ? [JSON.stringify(req.data)] : req.body
        })
        .catch(function(err) {
            var key = node.host + '_' + node.port;

            log.warn('Proxy to node %s failure: %s', key, err.message);

            if (retryCounter < retries) {
                log.warn('Retrying request to node %s', key);

                return q.delay(retryDelay)
                    .then(function() {
                        return proxy(req, node, retryCounter + 1);
                    });
            }

            log.warn('Giving up retrying to node %s, error: %s', key, err.message);
            return q.reject(err);
        });
}

module.exports = proxy;
