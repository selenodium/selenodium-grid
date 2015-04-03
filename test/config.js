'use strict';

var config = require('../lib/config'),
    expect = require('must');

describe('config', function() {
    it('must init with default config from config/default.conf', function() {
        expect(config()).to.eql(require('../config/default.json'));
    });
});
