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

var rcServlet = require('./rcservlet');
var webdriverServlet = require('./webdriverservlet');
var forwarder = require('./forwarderservlet');
var log = require('./log');
var registry = require('./registry');
var models = require('./models');
var store = require('./store');
var url = require('url');

var handleRequest = function(req, res, cb, retries) {
    retries = retries || 0;

    var protocol = exports.determineProtocol(req.url);
   	if (protocol === 'RC') {
   		// RC protocol
   		rcServlet.handleRequest(req, function(type, node, protocolCallback, req) {
   			if (type === 'ERROR') {
   				log.warn('Returning error message: ' + node);
   				// in this case, node is an error message, dirty
   				return cb(new models.Response(404, node));
   			}
   			process(req, node, type, protocolCallback, cb, retries, protocol, res);
   		});
   	} else {
   		// WebDriver protocol
   		webdriverServlet.handleRequest(req, function(type, node, protocolCallback, req) {
   			if (type === 'ERROR') {
   				log.warn('Returning error message: ' + node);
   				// in this case, node is an error message, dirty
   				return cb(new models.Response(500, node));
   			}
   			process(req, node, type, protocolCallback, cb, retries, protocol, res);
   		});
   	}
};

var process = function(req, node, type, protocolCallback, cb, retries, protocol, res) {
	var parameters = {};
	// post data
	// TODO: replace with querystring module
    if (req.text.length > 0) {
		var args = req.text.split('&');
		for (var i = 0, len = args.length; i < len; i++) {
			var d = args[i].split('=');
			parameters[d[0]] = d[1];
		}
	}

	var urlData = url.parse(req.url.toString(), true);
	for (var key in urlData.query) {
		parameters[key] = urlData.query[key];
	}

	if (type === 'NEW_SESSION') {
		forwardRequest(req, node, type, protocolCallback, function(response, session, desiredCapabilities) {
			session.startTime = session.lastSentTime = (new Date()).getTime();
			session.lastSentBody = req.url + ', ' + JSON.stringify(parameters);
			store.updateSession(session, function() {
				cb(response, session);
			});
		}, retries, cb);
        return;
	}

    if (protocol === 'RC') {
        registry.getSessionById(parameters['sessionId'], function(session) {
            session.lastSentTime = (new Date()).getTime();
            session.lastSentBody = req.url + ', ' + JSON.stringify(parameters);
            session.response = res;
            store.updateSession(session, function() {
                forwardRequest(req, node, type, protocolCallback, cb, retries, cb);
            });
        });
    } else {
        registry.getSessionById(webdriverServlet.extractSessionId(req.url), function(session) {
            session.lastSentTime = (new Date()).getTime();
            session.lastSentBody = req.method + ': ' + req.url + ', ' + JSON.stringify(parameters);
            session.response = res;

            store.updateSession(session, function() {
                forwardRequest(req, node, type, protocolCallback, cb, retries, cb);
            });
        });
    }
};

var forwardRequest = function(req, node, type, protocolCallback, callback, retries, cb) {
	forwarder.forwardRequest(req, node, function(responseForwarded) {

		protocolCallback(responseForwarded, function(res, session, desiredCapabilities) {
			if (session === null) {
				if (retries < 5) {
					// something went wrong
					log.warn('Failed to start session, try again');
					++retries;
					return setTimeout(function() {
                        handleRequest(req, res, cb, retries);
					}, (2000 + (retries * 500)));
				} else {
					log.warn('Giving up retrying');
					return registry.removeNode(node.host, node.port, function() {
						cb(new models.Response(500, res.body));
					});
				}
			}

			// handle error when the proxy forwarding returns a bad response code
	    	if (responseForwarded.statusCode === 404) {
	    		log.warn('Received bad status code from node (' + node.host + ':' + node.port + '): for ' + session.sessionID + ' ' + responseForwarded.statusCode);
	    		responseForwarded.body = 'Session is gone, most likely a timeout occurred! ' + responseForwarded.body;

	    		registry.removeSession(session.sessionID, function() {
		    		return registry.removeNode(node.host, node.port, function() {
		    			callback(responseForwarded);
		    		});
		    	});
	    	}
			
			// if the forwarder encountered an error, immediately execute callback
			// this happens when communication with the node failed
			if (res.error === true) {
				return callback(res, session, desiredCapabilities);
			}

			var cmdParams = [];
			var urlData;

			if (exports.determineProtocol(req.url) === 'RC') {
				urlData = url.parse(req.url.toString(), true).query;

				// TODO: replace with querystring module
                if (req.text.length > 0) {
					var args = req.text.split('&');
					for (var i = 0, len = args.length; i < len; i++) {
						var d = args[i].split('=');
						urlData[d[0]] = d[1];
					}
				}

				for (var i = 0; i < 5; i++) {
					if (urlData[i]) {
						cmdParams.push('"' + urlData[i].toString() + '"');
					}
				}
			}

			session.lastResponseBody = res.statusCode + ' - ' + res.body;
			session.lastUsed = (new Date()).getTime();
			session.lastResponseTime = (new Date()).getTime();

			store.updateSession(session, function() {
				if (type === 'STOP_SESSION') {
					registry.removeSession(session.sessionID, function() {
						callback(res, session, desiredCapabilities);
					});
				} else {
					callback(res, session, desiredCapabilities);
				}
			});

		});
	});
};

exports.determineProtocol = function(url) {
	return (url.indexOf('/selenium-server/driver') > -1) ? 'RC' : 'WebDriver';
};

exports.handleRequest = function(req, res, cb) {
    var body = '';
    req
        .addListener('data', function(chunk) {
            body += chunk;
        })
        .addListener('error', function(e) {
            log.warn(e);
        })
        .addListener('end', function() {
            req.text = body;
            handleRequest(req, res, cb);
        });
};
