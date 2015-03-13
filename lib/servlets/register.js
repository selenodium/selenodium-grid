var q = require('q'),
    registry = require('../registry'),
    log = require('../log'),
    apps = require('../http-apps');

module.exports = function(req, res) {
    if (!req.data) {
        return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
    }

    return q.invoke(registry, 'addNode', req.data)
        .catch(function() {
            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
        })
        .then(function(success) {
            if (success) {
                log.info('Register new node: %s', JSON.stringify(req.data));
                return apps.content('ok');
            }
            return q.reject(apps.content('Invalid parameters', 'text/plain', 400));
        });
};
