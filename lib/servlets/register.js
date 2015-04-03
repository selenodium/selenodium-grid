'use strict';

var q = require('q'),
    log = require('../log'),
    apps = require('../http-apps');

module.exports = function(req, res, registry) {
    var func = register;
    if (req.pathname === '/grid/unregister') {
        func = unregister;
    }
    return func(req, res, registry);
};

function register(req, res, registry) {
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
                    log.debug(err.stack || err);
                    return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
                })
                .then(function(node) {
                    return registry.registerNode(node)
                        .then(function(success) {
                            if (success) {
                                log.info('Registered node with ID=%s', node.getId());
                                return apps.content('ok');
                            }
                            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
                        });
                });
        });
}

function unregister(req, res, registry) {
    var id = req.query.id || req.data.id;
    if (!id) {
        return apps.content('Invalid parameters', 'text/plain', 400);
    }

    return registry.getNodeById(id)
        .then(function(node) {
            if (!node) {
                log.warn('Node with ID=%s does not exist in the registry.', id);
                return apps.content('ok');
            }
            return registry.unregisterNode(node);
        })
        .catch(function(err) {
            log.error('Error:', err.stack || err);
            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
        })
        .then(function(success) {
            if (success) {
                log.info('Unregistered node with ID=%s', id);
                return apps.content('ok');
            }
            return apps.content('Invalid parameters', 'text/plain', 400);
        });
}
