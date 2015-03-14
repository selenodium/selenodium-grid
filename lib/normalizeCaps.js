var models = require('./models');

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

module.exports = normalizeCapabilities;
