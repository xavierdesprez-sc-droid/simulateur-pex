'use strict';
/** Runner: `node tests/run.js` — exit code 1 if at least one test fails. */
const fs = require('fs');
const path = require('path');
const { runSuite, results } = require('./harness');

// Backend Apps Script syntax check
new Function(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'));
console.log('Code.gs: syntax OK');

const suites = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
for (const f of suites) {
  console.log(f);
  runSuite(path.join(__dirname, f));
}

console.log('-------------------------------------------');
console.log(`TOTAL: ${results.pass} pass / ${results.fail} fail`);
process.exit(results.fail ? 1 : 0);
