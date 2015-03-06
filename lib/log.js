var fs = require('fs'),
    util = require('util'),
    chalk = require('chalk');

var logger = require('tracer')
        .colorConsole({
            level: 'info',
            format: '{{timestamp}} {{file}}:{{line}} {{title}}: {{message}}',
            dateformat: 'HH:MM:ss.L',
            filters: [
                //the last item can be custom filter. here is "warn" and "error" filter
                {
                    warn: chalk.yellow,
                    debug: chalk.blue,
                    error: chalk.red
                }
            ]
        }),

    logFile = fs.createWriteStream('./file_' + process.pid + '.log', {flags: 'a'}),
    fileLogger = require('tracer')
        .console({
            transport: function(data) {
                try {
                    logFile.write(data.output + '\n');
                } catch (err) {
                    console.log('Error logging');
                    console.log(err.message);
                    console.trace('error logging');
                }
            }
        });

exports.info = function(e) {
    var msg = util.format.apply(null, arguments);
    logger.info(msg);
    fileLogger.info(msg);
};

exports.debug = function(e) {
    var msg = util.format.apply(null, arguments);
    logger.debug(msg);
    fileLogger.debug(msg);
};

exports.warn = function(e) {
    var msg = util.format.apply(null, arguments);
    logger.warn(msg);
    fileLogger.warn(msg);
};
