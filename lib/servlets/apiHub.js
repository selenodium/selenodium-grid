'use strict';

module.exports = function(req, res, registry) {
    return {
        status: 200,
        headers: {},
        data: registry.config
    }
};
