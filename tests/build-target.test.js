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
const nceIndexPath = path.join(root, 'dist', 'NCE', 'index.html');
const nceOutputPath = path.join(os.tmpdir(), `nce-build-${process.pid}.html`);
const originalIndex = fs.readFileSync(indexPath, 'utf8');

try {
  execFileSync(process.execPath, [
    buildPath, '--profile=NCE', `--out=${nceOutputPath}`
  ], { stdio: 'pipe' });
  assert.equal(
    fs.readFileSync(nceOutputPath, 'utf8'),
    fs.readFileSync(nceIndexPath, 'utf8'),
    'NCE target must be current'
  );

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

  const { buildDashboardString } = require(buildPath);
  const dashboardHtml = buildDashboardString();
  assert.match(dashboardHtml, /<title>SWE 2025 Achievement Dashboard<\/title>/);
  for (const id of [
    'dashboard-app', 'dash-status', 'dash-csv-input', 'dash-filter-country', 'dash-filter-market',
    'dash-filter-category', 'dash-counts', 'dash-scatter', 'dash-rating', 'dash-seniority', 'dash-age',
    'dash-correlations-body'
  ]) {
    assert.match(dashboardHtml, new RegExp(`id="${id}"`), `dashboard markup must contain id ${id}`);
  }
  assert.doesNotMatch(dashboardHtml, /id="view-(standard|advanced|matrix)"/);
  assert.doesNotMatch(dashboardHtml, /getPopulation/, 'dashboard must not call the simulator population endpoint');
  execFileSync(process.execPath, [buildPath, '--app=dashboard', '--check'], { stdio: 'pipe' });
  console.log('build-target.test.js: dashboard target is separate and current');
  console.log('build-target.test.js: Sales Rep output remains separate');
} finally {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  if (fs.existsSync(nceOutputPath)) fs.unlinkSync(nceOutputPath);
}
