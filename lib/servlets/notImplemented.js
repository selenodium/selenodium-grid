var apps = require('../http-apps');

module.exports = function(req, res) {
    return apps.statusResponse(req, 501);
};
