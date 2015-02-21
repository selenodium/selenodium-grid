#!/usr/bin/env node

'use strict';

var server  = require('../server'),
    parser  = require('./parser'),
    args = parser.parseArgs();

server(args);
