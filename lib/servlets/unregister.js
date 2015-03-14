var q = require('q'),
    log = require('../log'),
    apps = require('../http-apps');

module.exports = function(req, res, registry) {
    var id = req.query.id || req.data.id;
    if (!id) {
        return apps.content('Invalid parameters', 'text/plain', 400);
    }

    log.info('Unregister servlet %s', id);

    return registry.remove(id)
        .catch(function() {
            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
        })
        .then(function(success) {
            if (success) {
                return apps.content('ok');
            }
            return apps.content('Invalid parameters', 'text/plain', 400);
        });
};
