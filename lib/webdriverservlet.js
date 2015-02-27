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

var capabilityMatcher = require('./capabilitymatcher');
var registry = require('./registry.js');
var log = require('./log');
var models = require('./models');
var store = require('./store');

exports.extractSessionId = function(url) {
    if (!url) {
        return null;
    }

    var matches = url.match(/\/wd\/hub\/session\/([^\/]+)/i);
    if (matches && matches[1]) {
        return matches[1];
    }

    return null;
};

var newSession = function(desiredCapabilities, body, request, cb) {
    capabilityMatcher.findNode(desiredCapabilities, function(node, nodeCapabilities) {
        if (!node) {
            return cb('ERROR', 'Something went wrong processing your request', function() {});
        }

        // remove the node from the availableNodes pool
        store.removeAvailableNode(node.host, node.port, function() {
            node.available = false;

            var newCaps = merge(desiredCapabilities, nodeCapabilities);
            if (newCaps.browsername) {
                delete newCaps.browsername;
            }

            var json = JSON.parse(body);
            json.desiredCapabilities = newCaps;

            body = JSON.stringify(json);
            request.headers['content-length'] = body.length;

            cb('NEW_SESSION', node, function(response, resCb) {
                var sessionId;
                try {
                    var json = JSON.parse(response.body);
                    sessionId = json.sessionId;
                } catch (ex) {
                    sessionId = exports.extractSessionId(response.headers.location);
                }
                if (!sessionId) {
                    log.warn('Could not extract sessionID!');
                    log.warn(response.headers.location);
                    log.info(response);

                    store.addAvailableNode(node, function() {});

                    // corrupt location header?
                    return resCb(response, null);
                }

                var session = new models.Session('WebDriver', node.host, node.port, sessionId);
                session.platform = nodeCapabilities.platform;
                session.desiredCapabilities = desiredCapabilities;

                registry.addSession(sessionId, session, desiredCapabilities, function() {
                    resCb(response, session, desiredCapabilities);
                });
            }, body, request);
        });
    });
};

var merge = function(desiredCapabilities, nodeCapabilities) {
    var newCaps = desiredCapabilities;
    for (var k in nodeCapabilities) {
        var lowerK = k.toLowerCase();
        if ((lowerK === 'platform') || (lowerK === 'version') || (lowerK === 'browsername')) {
            newCaps[lowerK] = nodeCapabilities[k];
        }
    }

    return newCaps;
};

exports.getType = function(request) {
    if (request.url === '/wd/hub/session') {
        return 'NEW_SESSION';
    } else if (request.method.toUpperCase() === 'DELETE') {
        return 'STOP_SESSION';
    } else {
        return 'REGULAR';
    }
};

exports.handleRequest = function(request, body, cb) {
    if (request.url === '/wd/hub/session') {
        handleNewSessionRequest(request, body, cb);
    } else {
        request.headers['content-length'] = body.length;
        var sessionId = exports.extractSessionId(request.url);

        if (!sessionId) {
            return cb('ERROR', 'Missing sessionId', function() {});
        }

        registry.getSessionById(sessionId, function(session) {
            if (!session) {
                // wrong session, or session has ended already?
                return cb('ERROR', 'Unknown sessionId: ' + sessionId, function() {});
            }

            var node = store.getNode(session.nodeHost, session.nodePort),
                isDeleteRequest = (request.method.toUpperCase() === 'DELETE' && request.url.endsWith('/session/' + session.sessionID)),
                _cb = function(response, cb) {
                    cb(response, session);
                };

            cb(isDeleteRequest ? 'STOP_SESSION' : 'REGULAR', node, _cb, body, request);
        });
    }
};

function handleNewSessionRequest(request, body, cb) {
    var json = JSON.parse(body);

    if (json.desiredCapabilities) {
        json.desiredCapabilities = normalizeCapabilities(json.desiredCapabilities);

        body = JSON.stringify(json);
        request.headers['content-length'] = body.length;

        newSession(json.desiredCapabilities, body, request, cb);
    }
}

function normalizeCapabilities(caps) {
    var newCaps = {};

    Object.keys(caps)
        .forEach(function(key) {
            var normKey = normalizeKey(key);

            if (isBasicCapability(normKey)) {
                // version always needs to be string
                newCaps[normKey] = (normKey === 'version') ? caps[key].toString() : caps[key];
                return;
            }

            // copy custom capabilities as is
            newCaps[key] = caps[key];
        });

    return new models.Capability(newCaps);
}

function normalizeKey(key) {
    var normKey = key.toLowerCase();

    // fix browserName key
    if (normKey === 'browsername') {
        normKey = 'browserName';
    }

    return normKey;
}

function isBasicCapability(key) {
    return key === 'browserName' || key === 'version' || key === 'platform';
}
