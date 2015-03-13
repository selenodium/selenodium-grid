var config = require('configs-overload'),
    path = require('path');

/**
 * @param {Object} opts
 * @param {String} opts.defaultEnv
 * @param {String} opts.env
 * @returns {Config}
 */
module.exports = function(opts) {
    return config(path.join(__dirname, '../config'), opts);
};
