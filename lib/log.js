var fs = require('fs'),
    util = require('util'),
    chalk = require('chalk');

function chalkStyle(style) {
    return function(str, o) {
        return util.format(
            '%s %s %s',
            chalk.gray(o.timestamp),
            chalk.gray(o.file + ':' + o.line),
            chalk[style]('[' + o.title + ']: ' + o.message)
        );
    }
}

var logger = require('tracer')
        .colorConsole({
            level: 'info',
            format: '{{timestamp}} {{file}}:{{line}} {{title}}: {{message}}',
            dateformat: 'HH:MM:ss.L',
            filters: {
                info: chalkStyle('white'),
                warn: chalkStyle('yellow'),
                debug: chalkStyle('blue'),
                error: chalkStyle('red')
            }
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

exports.error = function(e) {
    var msg = util.format.apply(null, arguments);
    logger.error(msg);
    fileLogger.error(msg);
};
