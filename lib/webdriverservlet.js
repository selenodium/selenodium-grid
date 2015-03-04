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
var _ = require('lodash');

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

var newSession = function(desiredCapabilities, req, cb) {
    capabilityMatcher.findNode(desiredCapabilities, function(node, nodeCapabilities) {
        if (!node) {
            return cb('ERROR', 'Something went wrong processing your request', function() {});
        }

        // remove the node from the availableNodes pool
        store.removeAvailableNode(node.host, node.port, function() {
            var newCaps = merge(desiredCapabilities, nodeCapabilities);
            if (newCaps.browsername) {
                delete newCaps.browsername;
            }

            var json = JSON.parse(req.text);
            json.desiredCapabilities = newCaps;

            req.text = JSON.stringify(json);
            req.headers['content-length'] = req.text.length;

            cb('NEW_SESSION', node, function(res, resCb) {
                var sessionId;
                try {
                    var json = JSON.parse(res.body);
                    sessionId = json.sessionId;
                } catch (ex) {
                    sessionId = exports.extractSessionId(res.headers.location);
                }
                if (!sessionId) {
                    log.warn('Could not extract sessionID!');
                    log.warn(res.headers.location);
                    log.info(res);

                    store.addAvailableNode(node, function() {});

                    // corrupt location header?
                    return resCb(res, null);
                }

                var session = new models.Session('WebDriver', node.host, node.port, sessionId);
                session.platform = nodeCapabilities.platform;
                session.desiredCapabilities = desiredCapabilities;

                registry.addSession(sessionId, session, function() {
                    resCb(res, session, desiredCapabilities);
                });
            }, req);
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

exports.getType = function(req) {
    if (req.url === '/wd/hub/session') {
        return 'NEW_SESSION';
    } else if (req.method.toUpperCase() === 'DELETE') {
        return 'STOP_SESSION';
    } else {
        return 'REGULAR';
    }
};

exports.handleRequest = function(req, cb) {
    if (req.url === '/wd/hub/session') {
        handleNewSessionRequest(req, cb);
    } else {
        req.headers['content-length'] = req.text.length;
        var sessionId = exports.extractSessionId(req.url);

        if (!sessionId) {
            return cb('ERROR', 'Missing sessionId', function() {});
        }

        registry.getSessionById(sessionId, function(err, session) {
            if (!session) {
                // wrong session, or session has ended already?
                return cb('ERROR', 'Unknown sessionId: ' + sessionId, function() {});
            }

            var node = store.getNode(session.nodeHost, session.nodePort),
                isDeleteRequest = (req.method.toUpperCase() === 'DELETE' && _.endsWith(req.url, '/session/' + session.sessionId)),
                _cb = function(res, cb) {
                    cb(res, session);
                };

            cb(isDeleteRequest ? 'STOP_SESSION' : 'REGULAR', node, _cb, req);
        });
    }
};

function handleNewSessionRequest(req, cb) {
    var json = JSON.parse(req.text);

    if (json.desiredCapabilities) {
        json.desiredCapabilities = normalizeCapabilities(json.desiredCapabilities);

        req.text = JSON.stringify(json);
        req.headers['content-length'] = req.text.length;

        newSession(json.desiredCapabilities, req, cb);
    }
}

function normalizeCapabilities(caps) {
    var newCaps = {};

    Object.keys(caps)
        .forEach(function(key) {
            var normKey = normalizeKey(key);

            if (isBasicCapability(normKey)) {
                // version should always be a string
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
