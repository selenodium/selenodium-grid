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

var http = require('http');
http.globalAgent.maxSockets = Infinity;
var models = require('./models');
var log = require('./log');
var registry = require('./registry');

exports.forwardRequest = function(req, node, cb, retries) {
    if (!retries) {
        retries = 0;
    }

    req.headers['content-type'] = 'application/x-www-form-urlencoded; charset=utf-8';

    var responseBody = '',
        options = {
            method: req.method,
            path: req.url,
            headers: req.headers,
            host: node.host,
            port: node.port
        };

    log.info('Forward to node ' + node.host + ' : ' + options.path + ' (' + options.method + ')');

    if (req.text && req.text.length > 0) {
        log.info(req.text);
    }

    var proxyRequest = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            responseBody += chunk;
        });
        res.on('error', function(e) {
            log.warn(e);
        });
        res.on('end', function() {
            var response = new models.Response();
            response.statusCode = res.statusCode;
            response.headers = res.headers;
            response.body = responseBody;
            log.info('Node ' + node.host + ':' + node.port + ' responded');
            log.info(responseBody);
            cb(response);
        });
    });

    proxyRequest.on('error', function(error) {
        log.warn('Proxy to node (' + node.host + ':' + node.port + ') failure: ' + error.message);

        // TODO: replace magic numbers with configurable options
        setTimeout(function() {
            if (retries < 5) {
                log.warn('retrying request to ' + node.host + ':' + node.port);
                exports.forwardRequest(req, node, cb, retries + 1);
            } else {
                var response = new models.Response();
                response.statusCode = 500;
                response.body = 'FORWARDING_ERROR: ' + error.message;
                response.error = true;

                proxyRequest.end();

                log.warn('Giving up retrying, error is: ' + response.body);

                registry.removeNode(node.host, node.port, function() {
                    cb(response);
                });
            }
        }, 2000);
    });

    proxyRequest.write(req.text, 'binary');
    proxyRequest.end();
};
