function defaultMatcher(caps, nodeCaps) {
    for (var key in caps) {
        if (!isBasicCapability(key)) {
            continue;
        }

        var val = normalizeValue(caps[key]);
        if (!val) {
            continue;
        }

        var compVal = normalizeValue(nodeCaps[key]);
        if (!compVal || compVal !== val) {
            return false;
        }
    }

    return true;
}

function normalizeValue(val) {
    if (typeof val === 'string') {
        val = val.toLowerCase();
    }
    if (val === 'any' || val === '*') {
        val = '';
    }
    return val;
}

function normalizeCapabilities(caps) {
    var newCaps = {};

    Object.keys(caps)
        .forEach(function(key) {
            var normKey = normalizeKey(key);

            if (isBasicCapability(normKey)) {
                // version and platformVersion should always be a string
                newCaps[normKey] = (versionKeys.indexOf(normKey) > -1) ? caps[key].toString() : caps[key];
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
    basicKeys = ['browserName', 'version', 'platform', 'platformName', 'platformVersion'],
    versionKeys = ['version', 'platformVersion'];

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

exports.defaultMatcher = defaultMatcher;
exports.normalizeCapabilities = normalizeCapabilities;
exports.isBasicCapability = isBasicCapability;
exports.normalizeKey = normalizeKey;
exports.normalizeValue = normalizeValue;
