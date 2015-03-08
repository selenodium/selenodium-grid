'use strict';

var path = require('path'),
    pkg = require('../package.json'),
    main = require('../index').main;

module.exports = require('coa').Cmd()
    .name(path.basename(process.argv[1]))
    .title(pkg.description)
    .helpful()
    .arg()
        .name('port')
        .title('Port to listen')
        .end()
    .arg()
        .name('host')
        .title('Host to listen')
        .end()
    .opt()
        .name('key')
        .title('TestingBot key')
        .short('k')
        .long('key')
        .end()
    .opt()
        .name('secret')
        .title('TestingBot secret')
        .short('s')
        .long('secret')
        .end()
    .opt()
        .name('version')
        .title('Show version')
        .short('v')
        .long('version')
        .flag()
        .only()
        .act(function() {
            return pkg.name + ' ' + pkg.version;
        })
        .end()
    .completable()
    .act(main);
