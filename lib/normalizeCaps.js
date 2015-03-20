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

    return newCaps;
}

var keyMap = {
        browsername: 'browserName',
        platformname: 'platformName',
        platformversion: 'platformVersion'
    },
    allKeys = Object.keys(keyMap),
    basicKeys = ['browserName', 'version', 'platform', 'platformName', 'platformVersion'];

function normalizeKey(key) {
    var normKey = key.toLowerCase();

    if (allKeys.indexOf(normKey) > -1) {
        return keyMap[normKey];
    }

    return normKey;
}

function isBasicCapability(key) {
    return basicKeys.indexOf(key) > -1;
}

module.exports = normalizeCapabilities;
