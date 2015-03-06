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

var q = require('q'),
    log = require('./log'),
    models = require('./models');

exports.nodes = {};
exports.availableNodes = [];
exports.activeSessions = {};

exports.flushdb = function() {
    exports.nodes = {};
    exports.availableNodes = [];
    exports.activeSessions = {};

    return q();
};

exports.addSession = function(sessionId, session) {
    exports.activeSessions[sessionId] = session;
    return q();
};

exports.getSession = function(sessionId) {
    return exports.getAllSessions()
        .then(function(allSessions) {
            return allSessions[sessionId];
        });
};

exports.getAllSessions = function() {
    return q(exports.activeSessions);
};

exports.getNodeSessionIds = function(host, port) {
    return exports.getAllSessions()
        .then(function(allSessions) {
            var sessions = [];

            Object.keys(allSessions)
                .forEach(function(sessionId) {
                    var session = allSessions[sessionId];
                    if (session.nodeHost === host && String(session.nodePort) === String(port)) {
                        sessions.push(sessionId);
                    }
                });

            return sessions;
        });
};

exports.removeSession = function(sessionId) {
    delete exports.activeSessions[sessionId];
    return q();
};

exports.removeAllSessions = function() {
    exports.activeSessions = {};
    return q();
};

exports.updateSession = function(session) {
    exports.activeSessions[session.sessionId] = session;
    return q();
};

exports.removeNode = function(host, port) {
    return exports.removeAvailableNode(host, port)
        .then(function() {
            delete exports.nodes[host + '_' + port];
            return true;
        });
};

exports.addNode = function(host, port, node) {
    var key = host + '_' + port;
    exports.nodes[key] = node;
    return q();
};

exports.getNode = function(host, port) {
    var key = host + '_' + port;
    return exports.getAllNodes()
        .then(function(nodes) {
            return nodes[key];
        });
};

exports.updateNode = function(node) {
    var key = node.host + '_' + node.port;
    exports.nodes[key] = node;
    return q();
};

exports.getAllNodes = function() {
    return q(exports.nodes);
};

exports.getAvailableNodes = function() {
    return q(exports.availableNodes)
        .invoke('map', function(key) {
            return exports.getNode(key.host, key.port);
        })
        .all()
        .invoke('filter', function(node) {
            return node && node.available;
        });
};

exports.removeAvailableNode = function(host, port) {
    var key = host + '_' + port,
        nodes = exports.availableNodes,
        i = 0;

    while (i < nodes.length) {
        if (nodes[i].host === host && +nodes[i].port === +port) { // port should be Number
            log.info('Removing node from available nodes list: ' + key);
            nodes.splice(i, 1);
            continue;
        }
        ++i;
    }

    var node = exports.nodes[key];

    if (node) {
        node.available = false;
        return exports.updateNode(node);
    }

    log.warn('Could not remove available node (was it removed before?):', key);
    log.info(exports.nodes);

    return q();
};

exports.removeAllAvailableNodes = function() {
    exports.availableNodes = [];
    return q();
};

exports.addAvailableNode = function(node) {
    exports.availableNodes.push({host: node.host, port: node.port});

    node.available = true;
    return exports.updateNode(node);
};

exports.existsNode = function(host, port) {
    var key = host + '_' + port;
    var exists = (exports.nodes[key] !== undefined);
    return q(exists);
};
