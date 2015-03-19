var log = require('../log'),
    apps = require('../http-apps'),
    driver = require('../driver');

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
                    return drv.newSession(req, registry);
                case driver.SESSION_GET:
                    return drv.getSessionInfo(req, registry);
                case driver.SESSION_END:
                    return drv.endSession(req, registry);
                case driver.SESSION_CMD:
                    return drv.runCommand(req, registry);
            }
        });
};

// 9 UnknownCommand - The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource
// 13 UnknownError - An unknown server-side error occurred while processing the command.
// 33 SessionNotCreatedException - A new session could not be created.
