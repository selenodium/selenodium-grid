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

var url = require('url'),
    util = require('util'),
    log = require('./../log'),
    models = require('./../models'),
    store = require('./../store');

exports.handleRequest = function(req, cb) {
    var srvUrl = url.parse(req.url.toString(), true);

    if (!srvUrl.query.id) {
        var msg = 'Missing id';
        log.warn('Returning error message: ' + msg);
        cb(new models.JsonResponse(400, {msg: msg, success: false}));
        return;
    }

    var parts = srvUrl.query['id'].replace('http://', '').split(':'),
        port = parts[1],
        host = parts[0];

    var node = store.getNode(host, port);
    if (!node) {
        cb(new models.JsonResponse(404, {
            msg: util.format('Cannot find proxy with ID=http://%s:%s in the registry.', host, port),
            success: false
        }));
        return;
    }

    // update last seen time of requested node so it will be not removed from registry
    node.lastSeen = (new Date()).getTime();
    store.updateNode(node, function() {
        // TODO: should we add id and request properties to the response?
        // https://github.com/nicegraham/selenium-grid2-api#gridapiproxy
        cb(new models.JsonResponse(200, {msg: 'Proxy found!', success: true}));
    });
};
