var Q = require('q'),
    http = require('q-io/http');

// Code is adapted from q-io/http module.
// It will be removed when Selenodium server will be rewritten to q-io/http Server.
module.exports = function(_request, _response, respond) {
    var request = http.ServerRequest(_request);
    var response = http.ServerResponse(_response);

    var closed = Q.defer();
    _request.on("end", function(error, value) {
        if (error) {
            closed.reject(error);
        } else {
            closed.resolve(value);
        }
    });

    return Q.when(request, function(request) {
        return Q.when(respond(request, response), function(response) {
            if (!response)
                return;

            _response.writeHead(response.status, response.headers);

            if (response.onclose || response.onClose)
                Q.when(closed, response.onclose || response.onClose);

            return Q.when(response.body, function(body) {
                var length;
                if (
                    Array.isArray(body) &&
                    (length = body.length) &&
                    body.every(function(chunk) {
                        return typeof chunk === "string"
                    })
                ) {
                    body.forEach(function(chunk, i) {
                        if (i < length - 1) {
                            _response.write(chunk, response.charset);
                        } else {
                            _response.end(chunk, response.charset);
                        }
                    });
                } else if (body) {
                    var end;
                    var done = body.forEach(function(chunk) {
                        end = Q.when(end, function() {
                            return Q.when(chunk, function(chunk) {
                                _response.write(chunk, response.charset);
                            });
                        });
                    });
                    return Q.when(done, function() {
                        return Q.when(end, function() {
                            _response.end();
                        });
                    });
                } else {
                    _response.end();
                }
            });
        });
    });
};
