const GRID_STORE = process.env.GRID_STORE || 'memory'; // could be 'etcd' also

var store = require('./store-' + GRID_STORE),
    _config = {};

store.quit = function() {

};

store.getConfig = function() {
    return _config;
};

store.setConfig = function(config) {
    _config = config;
};

module.exports = store;
