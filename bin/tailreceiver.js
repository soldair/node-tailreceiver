#!/usr/bin/env node
var config = require('confuse')();
var tailreceiver = require('../server.js');

server = tailreceiver(config);

