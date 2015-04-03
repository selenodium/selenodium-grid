'use strict';

var capabilityUtils = require('../lib/capability-utils'),
    expect = require('must');

var defaultMatcher = capabilityUtils.defaultMatcher,
    normalizeCapabilities = capabilityUtils.normalizeCapabilities;

describe('capability-utils', function() {
    describe('defaultMatcher', function() {
        var nodeCaps = {
            version: '8.0',
            browserName: 'firefox',
            platform: 'LINUX',
            platformName: 'iOS',
            platformVersion: '8.1',
            'selenium-version': 123
        };

        it('must match by browserName', function() {
            var caps = {browserName: 'firefox'};
            expect(defaultMatcher(caps, nodeCaps)).to.be.true();
        });

        it('must match by browserName and version', function() {
            var caps = {browserName: 'firefox', version: '8.0'};
            expect(defaultMatcher(caps, nodeCaps)).to.be.true();
        });

        it('must match by browserName, version and platform', function() {
            var caps = {browserName: 'firefox', version: '8.0', platform: 'LINUX'};
            expect(defaultMatcher(caps, nodeCaps)).to.be.true();
        });

        it('must ignore values case during match', function() {
            var caps = {browser: 'FIREFOX', platformVersion: '8.1', platformName: 'ios'};
            expect(defaultMatcher(caps, nodeCaps)).to.be.true();
        });

        it('must ignore non-basic capabilities', function() {
            var caps = {browserName: 'firefox', version: '8.0', platform: 'LINUX', 'selenium-version': 345};
            expect(defaultMatcher(caps, nodeCaps)).to.be.true();
        });

        it('must not match in case of different capabilities', function() {
            var caps = {browserName: 'ie'};
            expect(defaultMatcher(caps, nodeCaps)).to.be.false();
        });

        it('must match in case of wildcard capabilities', function() {
            var caps = {browserName: '*', version: 'any', platform: ''};
            expect(defaultMatcher(caps, nodeCaps)).to.be.true();
        });
    });

    describe('normalizeCapabilities', function() {
        it('must normalize basic capabilities', function() {
            var caps = {
                    Version: 1,
                    Browsername: 'firefox',
                    PLATFORM: 'LINUX',
                    platformname: 'iOS',
                    platformVersion: '8.1'
                },
                res = {
                    version: '1',
                    browserName: 'firefox',
                    platform: 'LINUX',
                    platformName: 'iOS',
                    platformVersion: '8.1'
                };
            expect(normalizeCapabilities(caps)).to.eql(res);
        });

        it('must left untouched non-basic capabilities', function() {
            var caps = {
                'selenium-version': 123,
                'IEDriver': 'path/to/binary'
            };
            expect(normalizeCapabilities(caps)).to.eql(caps);
        });
    });
});
