var util = require('util'),
    log = require('../log'),
    store = require('../store');

module.exports = function(req, res) {
    if (!req.query.id) {
        var msg = 'Missing id';
        log.warn('Returning error message: ' + msg);

        return {
            // selenium-server expects 200 status with success=false
            status: 200,
            headers: {},
            data: {msg: msg, success: false}
        }
    }

    var parts = req.query.id.replace('http://', '').split(':'),
        host = parts[0],
        port = +parts[1];

    return store.getNode(host, port)
        .then(function(node) {
            if (!node) {
                return {
                    // selenium-server expects 200 status with success=false
                    status: 200,
                    headers: {},
                    data: {
                        msg: util.format('Cannot find proxy with ID=http://%s:%s in the registry.', host, port),
                        success: false
                    }
                }
            }

            // update last seen time of requested node so it will not be removed from registry
            node.lastSeen = (new Date()).getTime();
            return store.updateNode(node)
                .then(function() {
                    // TODO: should we add id and request properties to the response?
                    // https://github.com/nicegraham/selenium-grid2-api#gridapiproxy
                    return {
                        status: 200,
                        headers: {},
                        data: {msg: 'Proxy found!', success: true}
                    }
                });
        });
};
