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
                .catch(function(err) {
                    log.error('Error:', err || err.stack);
                    return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
                })
                .then(function(node) {
                    return node.register()
                        .then(function(success) {
                            if (success) {
                                log.info('Registered node with ID=%s', node.getId());
                                return apps.content('ok');
                            }
                            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
                        });
                });
        });
};
