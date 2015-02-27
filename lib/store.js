/*
Copyright 2013 TestingBot

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var GRID_STORE = process.env.GRID_STORE || 'memory'; // could be 'etcd' also
module.exports = require('./store-' + GRID_STORE);

module.exports.config = {};

module.exports.quit = function() {

};

module.exports.getConfig = function() {
	return module.exports.config;
};

module.exports.setConfig = function(config) {
    module.exports.config = config;
};
