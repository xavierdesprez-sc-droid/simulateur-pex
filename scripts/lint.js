'use strict';

const { ESLint } = require('eslint');
const fs = require('node:fs');
const path = require('node:path');
const { concatJs, concatSalesRepJs } = require('../build');

async function main() {
  const eslint = new ESLint();
  const testsDirectory = path.join(__dirname, '..', 'tests');
  const suiteFiles = fs.readdirSync(testsDirectory)
    .filter(file => /^\d.*\.test\.js$/.test(file) && file !== 'build-target.test.js');
  const readSuites = files => files
    .map(file => fs.readFileSync(path.join(testsDirectory, file), 'utf8'))
    .join('\n');
  const defaultSuiteFiles = suiteFiles.filter(file => file !== '07-sales-rep.test.js');
  const salesRepSuiteFiles = suiteFiles.filter(file => file === '07-sales-rep.test.js');
  const files = [
    'build.js',
    'eslint.config.js',
    'src/top-strip.js',
    'Code.gs',
    'scripts/**/*.js',
    'tests/**/*.js'
  ];
  const results = await eslint.lintFiles(files);
  results.push(
    ...(await eslint.lintText(
      `${concatJs()}\n${readSuites(defaultSuiteFiles)}`,
      { filePath: 'src/js/__default_bundle_with_tests.js' }
    )),
    ...(await eslint.lintText(
      `${concatSalesRepJs()}\n${readSuites(salesRepSuiteFiles)}`,
      { filePath: 'src/js/__sales_rep_bundle_with_tests.js' }
    ))
  );

  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) process.stdout.write(output);

  const errors = results.reduce((total, result) => total + result.errorCount, 0);
  const warnings = results.reduce((total, result) => total + result.warningCount, 0);
  if (errors || warnings) {
    process.exitCode = 1;
    return;
  }
  console.log(`ESLint: ${results.length} files checked with no warnings.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
