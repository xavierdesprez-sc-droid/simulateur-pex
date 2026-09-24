'use strict';
const assert = require('assert').strict;
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const buildPath = path.join(root, 'build.js');
const outputPath = path.join(os.tmpdir(), `sales-rep-build-${process.pid}.html`);
const originalIndex = fs.readFileSync(indexPath, 'utf8');

try {
  execFileSync(process.execPath, [
    buildPath, '--app=sales-rep', `--out=${outputPath}`
  ], { stdio: 'pipe' });
  const output = fs.readFileSync(outputPath, 'utf8');
  assert.notEqual(output, originalIndex, 'Sales Rep target must produce a distinct page');
  assert.match(output, /<title>Sales Rep Variable Compensation Calculator<\/title>/);
  assert.match(output, /id="sales-rep-app"/);
  assert.doesNotMatch(output, /id="view-(standard|advanced|matrix)"/);
  execFileSync(process.execPath, [
    buildPath, '--app=sales-rep', `--out=${outputPath}`, '--check'
  ], { stdio: 'pipe' });
  assert.equal(fs.readFileSync(indexPath, 'utf8'), originalIndex,
    'Sales Rep target must not modify root index.html');
  console.log('build-target.test.js: Sales Rep output remains separate');
} finally {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
}
