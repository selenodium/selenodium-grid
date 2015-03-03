module.exports = {
    app: './lib/bin',
    workers: 1,
    server: {
        port: process.env.PORT || 4444
    },
    //debug: {
    //    port: 5010
    //},
    extensions: {
        'luster-guard': {
            patterns: ['server.js', 'lib/**/*.js', 'node_modules/**']
        }
    }
};
