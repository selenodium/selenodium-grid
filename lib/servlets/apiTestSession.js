var models = require('./../models');

exports.handleRequest = function(req, res, cb) {
    cb(new models.Response(501, 'Not implemented'));
};
