var models = require('./../models');

exports.handleRequest = function(request, cb) {
    cb(new models.Response(501, 'Not implemented'));
};
