'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const ACCESS_SPREADSHEET_ID = '1uLTW_Kk4Z5YEfsZWkLHAKWhAcBaenDsGn6t6wogzqTA';
const PERSONAE_SPREADSHEET_ID = '1oR8M0Mp2ve6B7TT4fHHDRQPhNfCyB2_zUoVQ8d29bXQ';
const POPULATION_SPREADSHEET_IDS = {
  SWE: '1yszfpDvR3iVB1GX1mRTiymFIKXki2WXsAYsj7b2cP-Y',
  NCE: '1X14uFi-ykPG9hBwhGMfmZjbHKNS3CR-s8aRZPUJTYss'
};
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

function createBackend({
  email,
  fullAccessEmails = [],
  restrictedEmails = [],
  contactEmail = 'owner@example.com',
  profile = 'SWE'
} = {}) {
  let dataReads = 0;
  let personaeReads = 0;
  const openedSpreadsheetIds = [];
  const accessSheet = {
    getLastRow() {
      return Math.max(2, fullAccessEmails.length + 1, restrictedEmails.length + 1);
    },
    getRange(row, column) {
      if (row === 'D2') {
        return { getDisplayValue: () => contactEmail };
      }
      if (row === 2 && column === 1) {
        return {
          getDisplayValues: () => Array.from(
            { length: Math.max(fullAccessEmails.length, restrictedEmails.length) },
            (_, index) => [fullAccessEmails[index] || '', restrictedEmails[index] || '']
          )
        };
      }
      throw new Error(`Unexpected access range: ${row},${column}`);
    }
  };
  const createDataSheet = values => ({
    getLastRow: () => 5,
    getRange() {
      dataReads++;
      return { getValues: () => [values] };
    }
  });
  const dataSpreadsheets = {
    [POPULATION_SPREADSHEET_IDS.SWE]: {
      getSheetByName(name) {
        return name === 'Data dynamic distributions'
          ? createDataSheet(['FR', 'AE', 'France', '', '', '', 50000, 10000])
          : null;
      }
    },
    [POPULATION_SPREADSHEET_IDS.NCE]: {
      getSheetByName(name) {
        return name === 'Data dynamic distributions'
          ? createDataSheet(['AE', 'France', '', 50000, 10000])
          : null;
      }
    },
    [PERSONAE_SPREADSHEET_ID]: {
      getSheetByName(name) {
        if (name !== 'Courbe %/€') return null;
        return {
          getLastRow: () => 4,
          getRange(row, column, numRows, numColumns) {
            if (row === 2 && column === 3 && numRows === 1 && numColumns === 6) {
              return {
                getDisplayValues: () => [[
                  'Effectif', 'Âge Moyen', 'Salaire Fixe Moyen (€)',
                  'Bonus Cible Moyen (€)', 'Bonus Cible Moyen (%)', 'Segment ("Persona")'
                ]]
              };
            }
            if (row === 3 && column === 1 && numRows === 2 && numColumns === 8) {
              personaeReads++;
              return {
                getValues: () => [
                  ['FR', 'Junior', 10, 32, 50000, 8000, 0.16, '1 FR - Junior Inside Sales'],
                  ['ES', 'Senior', 5, '', 40000, 5000, '', '2 ES - Senior Outside Sales']
                ],
                getDisplayValues: () => [
                  ['FR', 'Junior', '10', '32', '50 000 €', '8 000 €', '16%', '1 FR - Junior Inside Sales'],
                  ['ES', 'Senior', '5', '', '40 000 €', '5 000 €', '', '2 ES - Senior Outside Sales']
                ]
              };
            }
            throw new Error(`Unexpected personae range: ${row},${column},${numRows},${numColumns}`);
          }
        };
      }
    }
  };
  const accessSpreadsheet = {
    getSheetByName(name) {
      return name === 'Access' ? accessSheet : null;
    }
  };
  const profileCode = code.replace(
    "const DEPLOYED_PROFILE = 'SWE';",
    `const DEPLOYED_PROFILE = '${profile}';`
  );
  const context = {
    Session: {
      getActiveUser: () => ({ getEmail: () => email || '' })
    },
    SpreadsheetApp: {
      openById: id => {
        openedSpreadsheetIds.push(id);
        if (id === ACCESS_SPREADSHEET_ID) return accessSpreadsheet;
        if (dataSpreadsheets[id]) return dataSpreadsheets[id];
        throw new Error(`Unexpected spreadsheet ID: ${id}`);
      },
      getActiveSpreadsheet: () => {
        throw new Error('Population spreadsheet should be selected by the fixed profile');
      }
    },
    HtmlService: {
      createHtmlOutputFromFile(name) {
        return { html: name, setTitle() { return this; }, addMetaTag() { return this; } };
      },
      createHtmlOutput(html) {
        return { html, setTitle() { return this; } };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(profileCode, context);
  return {
    backend: context,
    getDataReads: () => dataReads,
    getPersonaeReads: () => personaeReads,
    openedSpreadsheetIds
  };
}

test('allowlisted user can load the app and population', () => {
  const { backend, getDataReads, openedSpreadsheetIds } = createBackend({
    email: 'ALICE@EXAMPLE.COM',
    fullAccessEmails: ['alice@example.com']
  });

  assert.equal(backend.getSpreadsheet, undefined);
  assert.equal(backend.getDataSheet, undefined);
  assert.equal(backend.doGet().html, 'index');
  const result = backend.getPopulation();
  assert.equal(result.reps.length, 1);
  assert.equal(result.reps[0].jobProfile, 'AE');
  assert.equal(getDataReads(), 1);
  assert.deepEqual(openedSpreadsheetIds, [
    ACCESS_SPREADSHEET_ID,
    ACCESS_SPREADSHEET_ID,
    POPULATION_SPREADSHEET_IDS.SWE
  ]);
});

test('unlisted user sees the request-access message and cannot read population', () => {
  const { backend, getDataReads } = createBackend({
    email: 'alice@example.com',
    contactEmail: 'pex-owner@example.com'
  });

  const page = backend.doGet();
  assert.match(page.html, /contact/i);
  assert.match(page.html, /pex-owner@example\.com/);
  assert.throws(() => backend.getPopulation(), /access/i);
  assert.equal(getDataReads(), 0);
});

test('unavailable user email fails closed and shows the contact email', () => {
  const { backend, getDataReads } = createBackend({
    email: '',
    fullAccessEmails: ['alice@example.com'],
    contactEmail: 'pex-owner@example.com'
  });

  const page = backend.doGet();
  assert.match(page.html, /pex-owner@example\.com/);
  assert.throws(() => backend.getPopulation(), /access/i);
  assert.equal(getDataReads(), 0);
});

test('full-access-list user receives table visibility permission', () => {
  const { backend } = createBackend({
    email: 'alice@example.com',
    fullAccessEmails: ['alice@example.com']
  });

  assert.equal(backend.getPopulation().canViewIndividualTables, true);
});

test('restricted-list user can access aggregates without table visibility', () => {
  const { backend } = createBackend({
    email: 'alice@example.com',
    restrictedEmails: ['alice@example.com']
  });

  assert.equal(backend.getPopulation().reps.length, 1);
  assert.equal(backend.getPopulation().canViewIndividualTables, false);
});

test('restricted list wins if an email appears in both columns', () => {
  const { backend } = createBackend({
    email: 'alice@example.com',
    fullAccessEmails: ['alice@example.com'],
    restrictedEmails: ['alice@example.com']
  });

  assert.equal(backend.getPopulation().canViewIndividualTables, false);
});

test('NCE deployment uses the shared Access sheet and the NCE population sheet', () => {
  const { backend, openedSpreadsheetIds } = createBackend({
    email: 'alice@example.com',
    fullAccessEmails: ['alice@example.com'],
    profile: 'NCE'
  });

  assert.equal(backend.getPopulation().reps.length, 1);
  assert.deepEqual(openedSpreadsheetIds, [
    ACCESS_SPREADSHEET_ID,
    POPULATION_SPREADSHEET_IDS.NCE
  ]);
});

test('allowlisted SWE user can load the aggregate personae sheet', () => {
  const { backend, getPersonaeReads, openedSpreadsheetIds } = createBackend({
    email: 'alice@example.com',
    fullAccessEmails: ['alice@example.com']
  });

  const result = backend.getPersonae();
  assert.equal(result.personae.length, 1);
  assert.equal(result.ignored, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.personae[0])),
    {
      country: 'FR',
      seniority: 'Junior',
      headcount: 10,
      meanAge: 32,
      fixedSalary: 50000,
      oldNominal: 8000,
      oldNominalPct: 16,
      segment: '1 FR - Junior Inside Sales'
    }
  );
  assert.equal(getPersonaeReads(), 1);
  assert.ok(openedSpreadsheetIds.includes(PERSONAE_SPREADSHEET_ID));
});

test('NCE deployment cannot read the SWE personae sheet', () => {
  const { backend, openedSpreadsheetIds } = createBackend({
    email: 'alice@example.com',
    fullAccessEmails: ['alice@example.com'],
    profile: 'NCE'
  });

  assert.throws(() => backend.getPersonae(), /SWE/i);
  assert.ok(!openedSpreadsheetIds.includes(PERSONAE_SPREADSHEET_ID));
});

test('unlisted user cannot read the personae sheet', () => {
  const { backend, getPersonaeReads } = createBackend({ email: 'alice@example.com' });

  assert.throws(() => backend.getPersonae(), /access/i);
  assert.equal(getPersonaeReads(), 0);
});

if (failed) {
  console.error(`Auth tests: ${passed} passed, ${failed} failed`);
  process.exitCode = 1;
} else {
  console.log(`Auth tests: ${passed} passed`);
}
