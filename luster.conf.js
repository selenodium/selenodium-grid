'use strict';

module.exports = {
    app: './bin/selenodium-grid',
    workers: 1,
    server: {
        port: process.env.PORT || 4444
    },
    /*
    debug: {
        port: 5010
    },
    */
    extensions: {
        'luster-guard': {
            patterns: ['bin/selenodium-grid', 'lib/**/*.js', 'node_modules/**']
        }
    }
};
