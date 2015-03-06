var q = require('q'),
    fs = require('q-io/fs');

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
    return fs.read('config.json')
        .then(function(data) {
            hubConfig = JSON.parse(data.toString());
            return hubConfig;
        });
}
