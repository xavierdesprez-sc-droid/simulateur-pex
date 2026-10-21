'use strict';
/** SWE backend: 2025 source, legacy source, source allowlist, NCE behaviour, shared blocks. Run: node tests/backend-swe-2025.test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const readLf = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const code = readLf(path.join(root, 'Code.gs'));
const fixtureCsv = fs.readFileSync(path.join(root, 'population_test_swe2025.csv'), 'utf8');
const ACCESS_ID = '1uLTW_Kk4Z5YEfsZWkLHAKWhAcBaenDsGn6t6wogzqTA';
const SWE_LEGACY_ID = '1yszfpDvR3iVB1GX1mRTiymFIKXki2WXsAYsj7b2cP-Y';
const SWE_2025_ID = '1c2D9H4r6ZkWRchhNysoGjwnY0kn_m0tbpHQSlQVofRM';
const NCE_ID = '1X14uFi-ykPG9hBwhGMfmZjbHKNS3CR-s8aRZPUJTYss';

let passed = 0;
let failed = 0;
function test(name, run) {
  try {
    run();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}
const plain = value => JSON.parse(JSON.stringify(value));

function gridFrom(csv) {
  return csv.split(/\r?\n/).filter(line => line.trim() !== '').map(line => line.split(','));
}

// Mimics Sheets: getValues returns numbers for numeric text, getDisplayValues returns the raw text.
function sheetFrom(grid) {
  const typed = grid.map(row => row.map(cell => (/^-?\d+(\.\d+)?$/.test(cell) ? Number(cell) : cell)));
  const slice = (rows, row, column, numRows, numColumns) =>
    rows.slice(row - 1, row - 1 + numRows).map(r => r.slice(column - 1, column - 1 + numColumns));
  return {
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getRange: (row, column, numRows, numColumns) => ({
      getValues: () => slice(typed, row, column, numRows, numColumns),
      getDisplayValues: () => slice(grid, row, column, numRows, numColumns)
    })
  };
}

const filler = ['t', 't', 't', 't', 't', 't', 't', 't'];
const legacyGrid = [
  filler, filler, filler,
  ['Orga', 'Position', 'Country', 'ID', '', '', 'Base Salary', 'Amount'],
  ['FR', 'AE', 'France', 'R1', '', '', '50000', '5000'],
  ['MG', 'AE', 'France', 'R2', '', '', '50000', '5000']
];
const nceGrid = [
  ['t', 't', 't', 't', 't'], ['t', 't', 't', 't', 't'], ['t', 't', 't', 't', 't'],
  ['Job Profile', 'Country', 'ID', 'Annual Base Pay', 'Nominal'],
  ['Account Executive', 'France', 'NCE-1', '52000', '6500']
];

function createBackend({
  email = 'alice@example.com',
  fullAccessEmails = [],
  restrictedEmails = [],
  profile = 'SWE',
  missingHeader = null,
  file = 'Code.gs'
} = {}) {
  const opened = [];
  const fixtureText = missingHeader ? fixtureCsv.replace(missingHeader, 'Achievement') : fixtureCsv;
  const sheets = {
    [SWE_2025_ID]: { 'Copie de Liste Sales': sheetFrom(gridFrom(fixtureText)) },
    [SWE_LEGACY_ID]: { 'Data dynamic distributions': sheetFrom(legacyGrid) },
    [NCE_ID]: { 'Data dynamic distributions': sheetFrom(nceGrid) }
  };
  const accessSheet = {
    getLastRow: () => Math.max(2, fullAccessEmails.length + 1, restrictedEmails.length + 1),
    getRange(row) {
      if (row === 'D2') return { getDisplayValue: () => 'owner@example.com' };
      return {
        getDisplayValues: () => Array.from(
          { length: Math.max(fullAccessEmails.length, restrictedEmails.length) },
          (_, index) => [fullAccessEmails[index] || '', restrictedEmails[index] || '']
        )
      };
    }
  };
  const context = {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    SpreadsheetApp: {
      openById(id) {
        opened.push(id);
        if (id === ACCESS_ID) return { getSheetByName: name => (name === 'Access' ? accessSheet : null) };
        if (sheets[id]) return { getSheetByName: name => sheets[id][name] || null };
        throw new Error('Unexpected spreadsheet ID: ' + id);
      },
      getActiveSpreadsheet() {
        throw new Error('getActiveSpreadsheet must not be used');
      }
    },
    HtmlService: {
      createHtmlOutputFromFile: name => ({ html: name, setTitle() { return this; }, addMetaTag() { return this; } }),
      createHtmlOutput: html => ({ html, setTitle() { return this; } })
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8')
    .replace("const DEPLOYED_PROFILE = 'SWE';", `const DEPLOYED_PROFILE = '${profile}';`), context);
  return { backend: context, opened };
}

const FULL = { fullAccessEmails: ['alice@example.com'] };

console.log('backend-swe-2025.test.js');
test('default call reads the 2025 tab: 9 reps, 3 ignored, full visibility', () => {
  const { backend, opened } = createBackend(FULL);
  const result = backend.getPopulation();
  assert.equal(result.reps.length, 9);
  assert.equal(result.ignored, 3);
  assert.equal(result.canViewIndividualTables, true);
  assert.ok(opened.includes(SWE_2025_ID));
});

test('reps carry only the canonical fields; first rep is the first In row', () => {
  const { backend } = createBackend(FULL);
  const [first] = backend.getPopulation().reps;
  assert.deepEqual(plain(first), { jobProfile: 'Account Executive', country: 'France', fixed: 52000, nominal: 6760 });
});

test('explicit legacy key reads only the legacy tab: 1 rep, MG ignored', () => {
  const { backend, opened } = createBackend(FULL);
  const result = backend.getPopulation('legacy');
  assert.equal(result.reps.length, 1);
  assert.equal(result.ignored, 1);
  assert.ok(opened.includes(SWE_LEGACY_ID));
  assert.ok(!opened.includes(SWE_2025_ID));
});

test('unknown source key is refused', () => {
  const { backend } = createBackend(FULL);
  assert.throws(() => backend.getPopulation('other'), /Unknown population source: other/);
});

test('restricted user reads the 2025 aggregates without table visibility', () => {
  const { backend } = createBackend({ restrictedEmails: ['alice@example.com'] });
  const result = backend.getPopulation();
  assert.equal(result.reps.length, 9);
  assert.equal(result.canViewIndividualTables, false);
});

test('missing Achievement 2025 header fails with the column name, nothing loaded', () => {
  const { backend } = createBackend({ ...FULL, missingHeader: 'Achievement 2025' });
  assert.throws(() => backend.getPopulation(), /Achievement 2025/);
});

test('NCE deployment refuses swe2025 and keeps its legacy default', () => {
  const { backend, opened } = createBackend({ ...FULL, profile: 'NCE' });
  assert.throws(() => backend.getPopulation('swe2025'), /swe2025/);
  assert.equal(backend.getPopulation().reps.length, 1);
  assert.ok(!opened.includes(SWE_2025_ID));
});

test('Code.gs marks the access and swe2025-source blocks for the dashboard copy', () => {
  assert.match(code, /\/\/ BEGIN SHARED: access\n/);
  assert.match(code, /\/\/ END SHARED: access\n/);
  assert.match(code, /\/\/ BEGIN SHARED: swe2025-source\n/);
  assert.match(code, /\/\/ END SHARED: swe2025-source\n/);
});

// ----- dashboard/Code.gs (separate Apps Script project, full access only) -----
const block = (text, name) => {
  const match = text.match(new RegExp(`// BEGIN SHARED: ${name}\\n[\\s\\S]*?// END SHARED: ${name}\\n`));
  if (!match) throw new Error(`missing shared block: ${name}`);
  return match[0];
};

test('dashboard shared blocks are byte-identical to Code.gs', () => {
  const dashboardCode = readLf(path.join(root, 'dashboard', 'Code.gs'));
  assert.equal(block(dashboardCode, 'access'), block(code, 'access'));
  assert.equal(block(dashboardCode, 'swe2025-source'), block(code, 'swe2025-source'));
});

test('dashboard: full-access user gets the dashboard page and rows', () => {
  const { backend } = createBackend({ ...FULL, file: 'dashboard/Code.gs' });
  assert.equal(backend.doGet().html, 'index');
  const data = backend.getDashboardData();
  assert.equal(data.rows.length, 9);
  assert.deepEqual(plain(data.counts), { total: 12, notIn: 2, invalid: 1, achievementMissing: 2 });
});

test('dashboard: restricted-only user is denied the page and the data', () => {
  const { backend } = createBackend({ restrictedEmails: ['alice@example.com'], file: 'dashboard/Code.gs' });
  const page = backend.doGet();
  assert.notEqual(page.html, 'index');
  assert.match(page.html, /owner@example\.com/);
  assert.throws(() => backend.getDashboardData(), /access/i);
});

test('dashboard: user in both lists is denied (restricted precedence)', () => {
  const { backend } = createBackend({
    fullAccessEmails: ['alice@example.com'],
    restrictedEmails: ['alice@example.com'],
    file: 'dashboard/Code.gs'
  });
  assert.notEqual(backend.doGet().html, 'index');
  assert.throws(() => backend.getDashboardData(), /access/i);
});

if (failed) {
  console.error(`backend-swe-2025.test.js: ${passed} passed, ${failed} failed`);
  process.exitCode = 1;
} else {
  console.log(`backend-swe-2025.test.js: ${passed} passed`);
}
