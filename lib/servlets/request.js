'use strict';

var apps = require('../http-apps'),
    driver = require('../driver'),
    q = require('q');

module.exports = function(req, res, registry) {
    var drv = driver.getDriverForRequest(req);
    return drv.getRequestType(req)
        .catch(function(err) {
            // Not found error
            return apps.statusResponse(req, 404, err.message);
        })
        .then(function(type) {
            switch (type) {
                case driver.SESSION_NEW:
                    return newSession(req, registry, drv);
                case driver.SESSION_GET:
                    return getSessionInfo(req, registry, drv);
                case driver.SESSION_END:
                    return endSession(req, registry, drv);
                case driver.SESSION_CMD:
                    return runCommand(req, registry, drv);
            }
        })
        .catch(function(err) {
            console.log(err.stack || err);
            return q.reject(err);
        });
};

function newSession(req, registry, driver) {
    req.capabilities = driver.getRequestCapabilities(req);
    // TODO: handle create session errors and return selenium error response
    return registry.getNewSession(req)
        .then(function(session) {
            if (!session) {
                return q.reject(driver.seleniumResponse(33));
            }
            // return capabilities received from the node
            return driver.getNewSessionResponse(session);
        });
}

function getSessionInfo(req, registry, driver) {
    return getRequestSession(req, registry, driver)
        .then(function(session) {
            return driver.seleniumResponse(0, session.capabilities, session.getId());
        });
}

function endSession(req, registry, driver) {
    return getRequestSession(req, registry, driver)
        .then(function(session) {
            return registry.terminateSession(session);
        });
}

function runCommand(req, registry, driver) {
    return getRequestSession(req, registry, driver)
        .then(function(session) {
            return session.proxyRequest(req);
        });
}

function getRequestSession(req, registry, driver) {
    var sessionId = driver.getRequestSessionId(req);
    return registry.getSessionById(sessionId)
        .then(function(session) {
            if (!session) {
                // wrong session, or session has ended already?
                return apps.statusResponse(req, 404, 'Unknown sessionId: ' + sessionId);
            }
            return session;
        });
}

// 9 UnknownCommand - The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource
// 13 UnknownError - An unknown server-side error occurred while processing the command.
// 33 SessionNotCreatedException - A new session could not be created.
