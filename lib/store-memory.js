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

exports.flushdb = function(cb) {
    exports.nodes = {};
    exports.availableNodes = [];
    exports.activeSessions = {};

    return q().nodeify(cb);
};

exports.addSession = function(sessionId, session, cb) {
    exports.activeSessions[sessionId] = session;
    return q().nodeify(cb);
};

exports.getSession = function(sessionId, cb) {
    return exports.getAllSessions()
        .then(function(allSessions) {
            return allSessions[sessionId];
        })
        .nodeify(cb);
};

exports.getAllSessions = function(cb) {
    return q(exports.activeSessions).nodeify(cb);
};

exports.getNodeSessionIds = function(host, port, cb) {
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
        })
        .nodeify(cb);
};

exports.removeSession = function(sessionId, cb) {
    delete exports.activeSessions[sessionId];
    return q().nodeify(cb);
};

exports.removeAllSessions = function(cb) {
    exports.activeSessions = {};
    return q().nodeify(cb);
};

exports.updateSession = function(session, cb) {
    exports.activeSessions[session.sessionId] = session;
    return q().nodeify(cb);
};

exports.removeNode = function(host, port, cb) {
    return exports.removeAvailableNode(host, port)
        .then(function() {
            delete exports.nodes[host + '_' + port];
            return true;
        })
        .nodeify(cb);
};

exports.addNode = function(host, port, node, cb) {
    var key = host + '_' + port;
    exports.nodes[key] = node;
    return q().nodeify(cb);
};

exports.getNode = function(host, port) {
    var key = host + '_' + port;
    return exports.getAllNodes()
        .then(function(nodes) {
            return nodes[key];
        });
};

exports.updateNode = function(node, cb) {
    var key = node.host + '_' + node.port;
    exports.nodes[key] = node;
    return q().nodeify(cb);
};

exports.getAllNodes = function() {
    return q(exports.nodes);
};

exports.getAvailableNodes = function(cb) {
    return q(exports.availableNodes)
        .invoke('map', function(key) {
            return exports.getNode(key.host, key.port);
        })
        .all()
        .invoke('filter', function(node) {
            return node && node.available;
        })
        .nodeify(cb);
};

exports.removeAvailableNode = function(host, port, cb) {
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
        return exports.updateNode(node)
            .nodeify(cb);
    }

    log.warn('Could not remove available node (was it removed before?):', key);
    log.info(exports.nodes);

    return q().nodeify(cb);
};

exports.removeAllAvailableNodes = function(cb) {
    exports.availableNodes = [];
    return q().nodeify(cb);
};

exports.addAvailableNode = function(node, cb) {
    exports.availableNodes.push({host: node.host, port: node.port});

    node.available = true;
    return exports.updateNode(node)
        .nodeify(cb);
};

exports.existsNode = function(host, port, cb) {
    var key = host + '_' + port;
    var exists = (exports.nodes[key] !== undefined);
    return q(exists).nodeify(cb);
};
