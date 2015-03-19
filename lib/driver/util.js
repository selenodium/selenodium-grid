function seleniumResponse(status, value, sessionId) {
    status = status || 0;
    var data = {status: status};
    if (value) {
        data.value = value;
    }
    if (sessionId) {
        data.sessionId = String(sessionId);
    }
    return {
        // TODO: more precise HTTP status based on selenium status code
        status: status === 0 ? 200 : 500,
        headers: {},
        data: data
    };
}

exports.seleniumResponse = seleniumResponse;
