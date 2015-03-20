module.exports = function(caps, nodeCaps) {
    for (var key in caps) {
        if (!caps[key]) {
            continue;
        }

        var value = caps[key].toString().toLowerCase();
        if (value === 'any' || value === '' || value === '*') {
            continue;
        }

        if (key !== 'browserName' && key !== 'version' && key !== 'platform') {
            continue;
        }

        if (!nodeCaps[key] || nodeCaps[key].toString().toLowerCase() !== value) {
            return false;
        }
    }

    return true;
};
