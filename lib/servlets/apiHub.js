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

var models = require('./../models'),
    log = require('./../log'),
    fs = require('fs');

exports.handleRequest = function(req, res, cb) {
    var body = '';
    req.addListener('data', function(chunk) {
        body += chunk;
    });
    req.addListener('error', function(e) {
        log.warn(e);
    });
    req.addListener('end', function() {
        getHubConfiguration(function(hubConfig) {
            cb(new models.JsonResponse(200, hubConfig));
        });
    });
};

var _hubConfiguration = null;

function getHubConfiguration(cb) {
    if (_hubConfiguration !== null) {
        return cb(_hubConfiguration);
    }

    fs.readFile('config.json', function(err, data) {
        if (err) {
            log.warn('Unable to read config.json');
            throw err;
        }
        _hubConfiguration = JSON.parse(data.toString());
        cb(_hubConfiguration);
    });
}
