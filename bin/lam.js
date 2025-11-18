#!/usr/bin/env node

const command = process.argv[2];

if (command === 'start') {
    // Start the server
    require('../server.js');
} else {
    console.log('LAM CLI');
    console.log('Update: npm i -g lam-cli@latest');
    console.log('Running server: sudo lam-cli start');
}
