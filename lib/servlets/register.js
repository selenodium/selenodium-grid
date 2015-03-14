var q = require('q'),
    log = require('../log'),
    apps = require('../http-apps');

module.exports = function(req, res, registry) {
    return q(req.data)
        .then(function(data) {
            if (!data && req.headers['content-type'].indexOf('text/plain') > -1) {
                return req.body.read()
                    .then(function(body) {
                        return JSON.parse(body);
                    });
            }
            return data;
        })
        .catch(function() {
            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
        })
        .then(function(data) {
            return q(registry)
                .invoke('createNode', data)
                .then(function(node) {
                    return registry.add(node);
                })
                .catch(function(err) {
                    log.warn(err.stack || err);
                    return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
                })
                .then(function(success) {
                    if (success) {
                        log.info('Register new node: %s', JSON.stringify(data));
                        return apps.content('ok');
                    }
                    return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
                });
        });
};
