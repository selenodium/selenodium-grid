#!/usr/bin/env node

'use strict';

var server = require('../server'),
    parser = require('./parser');

server(parser.parseArgs()).done();
