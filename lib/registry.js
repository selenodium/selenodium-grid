/*
 Copyright 2013 TestingBot

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

var q = require('q'),
    Queue = require('q/queue'),
    http = require('q-io/http'),
    httpNode = require('http'),
    proxy = require('./proxy'),
    models = require('./models'),
    log = require('./log'),
    capabilityMatcher = require('./capabilityMatcher'),
    store = require('./store');

httpNode.globalAgent.maxSockets = Infinity;

exports.NODE_TIMEOUT = 10000;
exports.TEST_TIMEOUT = 120000;
exports.MAX_DURATION = 1800000;
exports.timeouts = {};

// TODO: implement configurable node polling (nodePolling node config value)
setInterval(function() {
    store.getAllNodes()
        .then(function(nodes) {
            return q(Object.keys(nodes))
                .invoke('map', function(key) {
                    var node = nodes[key];
                    if (!node) {
                        return;
                    }

                    // TODO: get rid of testingbot or make it configurable
                    if (node.host.indexOf('testingbot') > -1) {
                        return;
                    }

                    if ((new Date()).getTime() - node.lastSeen < exports.NODE_TIMEOUT) {
                        return;
                    }

                    // node no longer available?
                    log.info('Removing node from pool on timeout:', key);
                    return exports.removeNode(node.host, node.port)
                        .tap(function() {
                            log.info('Node removed from pool on timeout:', key);
                        });
                })
                .all();
        })
        .done();
}, 2000).unref(); // do not keep program running if no server registered

exports.addNode = function(json) {
    // TODO: add some sanity checks for json
    var hostParts = json.configuration.remoteHost.replace('http://', '').split(':'),
        host = hostParts[0],
        port = hostParts[1],
        key = host + '_' + port;

    return store.existsNode(host, port)
        .then(function(exists) {
            if (exists) {
                log.info('Node already exists:', key);
                return true;
            }

            var capabilities = [];

            // make sure this proxy is not blocked
            if (json.capabilities) {
                for (var i = 0, len = json.capabilities.length; i < len; i++) {
                    capabilities.push(new models.Capability(json.capabilities[i]));
                }

                var node = new models.Node(host, port, capabilities, json);

                return store.addNode(host, port, node)
                    .then(function() {
                        return store.addAvailableNode(node);
                    })
                    .then(function() {
                        exports.processPendingRequest().done();
                        return true;
                    });
            }

            log.warn('Could not add a node without any available capabilities, skipped:', key);
            return false;
        });
};

exports.removeNode = function(host, port) {
    var key = host + '_' + port;

    // when removing a node, make sure no active sessions are left with this node
    log.info('Removing sessions for node: ' + key);
    return exports.removeSessionsForNode(host, port)
        .then(function() {
            log.info('Removing node: ' + key);
            return store.removeNode(host, port);
        })
        .tap(function() {
            log.info('Node removed: ' + key);
        });
};

exports.removeSessionsForNode = function(host, port) {
    var key = host + '_' + port;
    return store.getNodeSessionIds(host, port)
        .invoke('map', function(sessionId) {
            log.info('Removing session %s for node %s', sessionId, key);
            return exports.removeSession(sessionId);
        })
        .all()
        .thenResolve();
};

function createSessionWatcher(sessionId) {
    exports.timeouts[sessionId] = setInterval(watchSession(sessionId), 5000);
    return q();
}

function clearSessionWatcher(sessionId) {
    if (exports.timeouts[sessionId] !== null) {
        clearInterval(exports.timeouts[sessionId]);
        delete exports.timeouts[sessionId];
    }
    return q();
}

function watchSession(sessionId) {
    return function() {
        return store.getSession(sessionId)
            .then(function(session) {
                if (!session) {
                    log.info('Can not find session ' + sessionId);
                    return clearSessionWatcher(sessionId);
                }

                var now = (new Date()).getTime(),
                    diff = now - session.lastUsed,
                    timeRunning = now - session.startTime;

                var idleTimeout = exports.TEST_TIMEOUT,
                    maxDuration = exports.MAX_DURATION;

                var caps = session.desiredCapabilities;
                if (caps.idletimeout) {
                    idleTimeout = parseInt(caps.idletimeout, 10) * 1000;
                }

                // the hub should give the node the chance to do a timeout
                idleTimeout += 15000;

                if (caps.maxduration) {
                    maxDuration = parseInt(caps.maxduration, 10) * 1000;
                }

                var key = session.nodeHost + '_' + session.nodePort;

                if (diff > 5000) {
                    log.info('Checking for timeouts during test on node %s (%s)\n%s vs %s', key, sessionId, diff, idleTimeout);
                }

                if (timeRunning > maxDuration || diff > maxDuration || diff > idleTimeout) {
                    if (timeRunning > maxDuration || diff > maxDuration) {
                        log.info('Test has exceeded max duration of %s (%s)', maxDuration, sessionId);
                    } else if (diff > idleTimeout) {
                        log.info('Timeout of %s occurred (%s)', diff, sessionId);
                    }

                    // close the session and the node and remove the session from the registry
                    return exports.closeSession(session)
                        .tap(function() {
                            log.debug('Session removed (%s)', sessionId);
                        });
                }
            })
            .done();
    }
}

exports.addSession = function(sessionId, session) {
    return store.addSession(sessionId, session)
        .then(function() {
            return createSessionWatcher(sessionId);
        })
        .thenResolve(session);
};

exports.removeSession = function(sessionId) {
    log.info('Removing session: ' + sessionId);

    // clear session watcher
    if (exports.timeouts[sessionId] !== null) {
        clearInterval(exports.timeouts[sessionId]);
        delete exports.timeouts[sessionId];
    }

    return store.getSession(sessionId)
        .then(function(session) {
            if (!session) {
                log.warn('Could not remove session that is not active: ' + sessionId);
                return;
            }

            // node is available again
            return store.removeSession(sessionId)
                .then(function() {
                    return store.getNode(session.nodeHost, session.nodePort);
                })
                .then(function(node) {
                    return store.addAvailableNode(node);
                });
        })
        .then(function() {
            log.info('Session has been removed: ' + sessionId);

            // TODO: think of a way do not block on pending request when removing a session
            // when stopping a test, should check for pending requests
            exports.processPendingRequest().done();
        });
};

exports.getSessionById = function(sessionId) {
    return store.getSession(sessionId);
};

exports.closeSession = function(session) {
    log.info('Closing session %s', session.sessionId);

    // TODO: make it configurable?
    var req = {retries: 3};

    if (session.type === 'RC') {
        req.path = '/selenium-server/driver?cmd=testComplete&sessionId=' + session.sessionId;
        req.method = 'POST';
    } else {
        req.path = '/wd/hub/session/' + session.sessionId;
        req.method = 'DELETE';
    }

    return store.getNode(session.nodeHost, session.nodePort)
        .then(function(node) {
            return proxy(req, node);
        })
        .tap(function(res) {
            log.info('Delete request done, node response: ' + res.status);
        })
        .catch(function(err) {
            log.warn('Failed to send delete requests');
            return q.reject(err);
        })
        .fin(function() {
            return exports.removeSession(session.sessionId);
        });
};

var pendingQueue = new Queue();

exports.addPendingRequest = function(caps) {
    var uniqueId = Math.round(Math.random() * 100000000),
        defer = q.defer();

    log.info('Adding pending request with capabilities\n%s', JSON.stringify(caps, null, 2));

    pendingQueue.put({
        desiredCapabilities: caps,
        defer: defer,
        uniqueId: uniqueId,
        since: (new Date()).getTime()
    });

    return defer.promise;
};

exports.processPendingRequest = function() {
    log.info('Processing pending requests...');
    return processPendingQueue(freezeQueue())
        .catch(function(err) {
            if (err.message !== 'CLOSED') {
                return q.reject(err);
            }
            log.info('Done processing pending requests');
        });
};

function freezeQueue() {
    var currentQueue = pendingQueue;
    currentQueue.close(new Error('CLOSED'));
    pendingQueue = new Queue();
    return currentQueue;
}

function processPendingQueue(queue) {
    var now = (new Date()).getTime();
    return queue.get()
        .then(function(req) {
            // reject outdated request
            // TODO: should replace magic number with configurable option
            if (now - req.since > 600000) {
                req.defer.reject(new Error('Pending request timed out'));
                return;
            }

            // try to find node
            return capabilityMatcher(req.desiredCapabilities)
                .then(function(node) {
                    if (node) {
                        log.info('Found match for pending request %s', req.uniqueId);
                        req.defer.resolve(node);
                    } else {
                        pendingQueue.put(req);
                    }
                    return processPendingQueue(queue);
                });
        });
}
