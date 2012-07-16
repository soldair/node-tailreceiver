#!/usr/bin/env node
var config = require('confuse')({dir:process.cwd(),files:['tailreceiver.json']});
var tailreceiver = require('../server.js');

server = tailreceiver(config);

