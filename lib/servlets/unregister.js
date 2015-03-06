var q = require('q'),
    registry = require('../registry'),
    log = require('../log'),
    apps = require('../http-apps');

module.exports = function(req, res) {
    var host, port;

    if (!req.query.id) {
        return apps.content('Invalid parameters', 'text/plain', 400);
    }

    var parts = req.query.id.replace('http://', '').split(':');
    host = parts[0];
    port = +parts[1];

    log.info('Unregister servlet %s:%s', host, port);

    return registry.removeNode(host, port)
        .catch(function() {
            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
        })
        .then(function(success) {
            if (success) {
                return apps.content('OK - Bye');
            }
            return apps.content('Invalid parameters', 'text/plain', 400);
        });
};
