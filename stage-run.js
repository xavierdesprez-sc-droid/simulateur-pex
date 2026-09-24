'use strict';
/** Runner: `node tests/run.js` — exit code 1 if at least one test fails. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runSuite, results } = require('./harness');

// Fraîcheur: si src/ existe, index.html doit être à jour
if (fs.existsSync(path.join(__dirname, '..', 'src', 'js'))) {
  try {
    execFileSync('node', [path.join(__dirname, '..', 'build.js'), '--check'], { stdio: 'inherit' });
  } catch {
    console.error('tests/run.js: index.html périmé — relance node build.js');
    process.exit(1);
  }
}

// Backend Apps Script syntax check
new Function(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'));
console.log('Code.gs: syntax OK');

const suites = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && !['build-target.test.js', '07-sales-rep.test.js'].includes(f)).sort();
for (const f of suites) {
  console.log(f);
  runSuite(path.join(__dirname, f));
}
console.log('07-sales-rep.test.js');
runSuite(path.join(__dirname, '07-sales-rep.test.js'), 'sales-rep');

console.log('build-target.test.js');
execFileSync(process.execPath, [path.join(__dirname, 'build-target.test.js')], { stdio: 'inherit' });

console.log('-------------------------------------------');
console.log(`TOTAL: ${results.pass} pass / ${results.fail} fail`);
process.exit(results.fail ? 1 : 0);
