var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    chalk = require('chalk'),
    tracer = require('tracer');

function chalkStyle(style) {
    return function(data) {
        return util.format(
            '%s %s %s',
            chalk.gray(data.timestamp),
            chalk.gray(data.file + ':' + data.line),
            chalk[style]('[' + data.title + ']: ' + data.message)
        );
    }
}

var filters = {
        info: chalkStyle('white'),
        warn: chalkStyle('yellow'),
        debug: chalkStyle('blue'),
        error: chalkStyle('red')
    },
    logger = tracer.console({
        level: process.env.LOG_LEVEL || 'info',
        dateformat: 'HH:MM:ss.L',
        transport: function(data) {
            var filter = filters[data.title] || filters.info;
            console.log(filter(data));
        }
    }),

    logFile = path.join(process.cwd(), process.env.LOG_FILE || 'selenodium-grid.log'),
    logStream = fs.createWriteStream(logFile, {flags: 'a'}),
    fileLogger = tracer.console({
        level: 'debug',
        format: '{{timestamp}} <{{title}}> {{file}}:{{line}} {{message}}',
        transport: function(data) {
            try {
                logStream.write(data.output + '\n');
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
