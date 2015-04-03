'use strict';

// Code in this module was borrowed from
// https://github.com/nickpoorman/object-md5
var crypto = require('crypto'),
    _ = require('lodash');

module.exports = function(obj) {
    // javascript objects are not required to maintain order
    // to solve this problem, get key value pairs and sort them
    var pairs = _.sortBy(_.pairs(obj), function(pair) {
        return pair[0];
    });
    return crypto.createHash('md5').update(JSON.stringify(pairs)).digest('hex');
};
