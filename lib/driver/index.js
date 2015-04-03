'use strict';

var CommonImpl = require('./CommonImpl'),
    WebDriverImpl = require('./WebDriverImpl'),
    RCImpl = require('./RCImpl'),
    constants = require('./constants'),
    extend = require('extend');

var drivers = {};
drivers[constants.WebDriver] = new WebDriverImpl();
drivers[constants.RC] = new RCImpl();

function getDriver(proto) {
    return drivers[proto];
}

function getDriverForRequest(req) {
    return getDriver(getSeleniumProtocol(req));
}

function getSeleniumProtocol(req) {
    return (req.path.indexOf('/selenium-server/driver') > -1) ? constants.RC : constants.WebDriver;
}

exports.getDriver = getDriver;
exports.getDriverForRequest = getDriverForRequest;
exports.getSeleniumProtocol = getSeleniumProtocol;

exports.CommonImpl = CommonImpl;
exports.WebDriverImpl = WebDriverImpl;
exports.RCImpl = RCImpl;

module.exports = extend(exports, constants);
