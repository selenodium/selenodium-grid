var q = require('q'),
    http = require('q-io/http'),
    log = require('./log');

function proxy(req, node, retryCounter) {
    retryCounter = retryCounter || 0;

    var retries = req.retries || 0,
        retryDelay = typeof(req.retryDelay) !== 'undefined' ? req.retryDelay : 2000,
        opts = {
            timeout: req.timeout,
            host: node.host,
            port: node.port,
            method: req.method,
            path: req.path,
            headers: req.headers,
            body: req.data ? [JSON.stringify(req.data)] : req.body
        };

    // use separate pool (agent) for each node
    if (typeof node.getAgent === 'function') {
        var agent = node.getAgent();
        if (agent) {
            opts.agent = agent;
        }
    }

    return http.request(opts)
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
