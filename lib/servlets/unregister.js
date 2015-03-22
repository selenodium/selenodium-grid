var q = require('q'),
    log = require('../log'),
    apps = require('../http-apps');

module.exports = function(req, res, registry) {
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
};
