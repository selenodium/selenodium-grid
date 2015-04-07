'use strict';

var wd = require('wd'),
    expect = require('must'),
    _ = require('lodash'),
    q = require('q');

describe('integration tests', function() {
    describe('test multiple browsers', function() {
        var count = 10,
            browsers;

        before(function() {
            browsers = _.times(count, function(i) {
                var browser = wd.promiseChainRemote('http://localhost:4444/wd/hub');

                browser.on('command', function(method, path, data) {
                    console.log(' [%s]> %s', i, method, path, data || '');
                });

                return browser;
            });
        });

        it('should open browser and retrieve the page title', function() {
            this.timeout(120000);

            return forBrowsers(browsers, function(browser) {
                    return browser.init({browserName: 'firefox'})
                        .then(function() {
                            return browser
                                .get('http://localhost:8000/guinea-pig.html')
                                .title()
                                .then(function(title) {
                                    expect(title).to.equal('WD Tests');
                                });
                        });
                })
                .fin(function() {
                    return forBrowsers(browsers, function(browser) {
                        return browser.quit();
                    });
                });
        });
    });
});

function forBrowsers(browsers, cb) {
    return q.all(browsers)
        .then(function(browsers) {
            return browsers.map(function(browser) {
                return cb(browser);
            });
        })
        .all();
}
