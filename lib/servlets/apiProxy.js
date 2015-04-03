'use strict';

var util = require('util'),
    log = require('../log');

module.exports = function(req, res, registry) {
    var id = req.query.id || req.data.id;
    if (!id) {
        var msg = 'Missing id';
        log.warn('Returning error message: ' + msg);

        return {
            // selenium-server expects 200 status with success=false
            status: 200,
            headers: {},
            data: {msg: msg, success: false}
        }
    }

    return registry.getNodeById(id)
        .then(function(node) {
            if (!node) {
                return {
                    // selenium-server expects 200 status with success=false
                    status: 200,
                    headers: {},
                    data: {
                        msg: util.format('Cannot find proxy with ID=%s in the registry.', id),
                        success: false
                    }
                }
            }

            // TODO: should update lastSeen property of the node? or node polling will be enough?

            // https://github.com/nicegraham/selenium-grid2-api#gridapiproxy
            return {
                status: 200,
                headers: {},
                data: {
                    id: node.id,
                    request: node.request,
                    msg: 'Proxy found!',
                    success: true
                }
            }
        });
};
