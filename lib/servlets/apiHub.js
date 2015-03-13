var q = require('q'),
    fs = require('q-io/fs'),
    path = require('path');

module.exports = function(req, res) {
    return getHubConfiguration()
        .then(function(config) {
            return {
                status: 200,
                headers: {},
                data: config
            }
        });
};

var hubConfig = null;

function getHubConfiguration() {
    if (hubConfig !== null) {
        return q(hubConfig);
    }
    // TODO: should get config from registry
    return fs.read(path.join(__dirname, '..', '..', 'config', 'default.json'))
        .then(function(data) {
            hubConfig = JSON.parse(data.toString());
            return hubConfig;
        });
}
