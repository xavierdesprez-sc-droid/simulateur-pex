'use strict';
/** SWE population source switch: requested key, reload on change, named CSV parse, NCE has no switch. */

module.exports = function suite(__h) {
  const { check, els, mock } = __h;
  const fixtureText = __h.readRepoFile('population_test_swe2025.csv');

  check('SWE profile defaults the population source to swe2025', activePopulationSourceKey === 'swe2025');

  mock.sheetError = null;
  mock.sheetReps = [];
  loadPopulationFromSheet();
  check('Apps Script load requests the swe2025 source', mock.lastPopulationKey === 'swe2025');

  onPopulationSourceChange('legacy');
  check('switching to legacy reloads with the legacy key',
    mock.lastPopulationKey === 'legacy' && activePopulationSourceKey === 'legacy');

  onPopulationSourceChange('swe2025');
  check('switching back to swe2025 reloads with that key', mock.lastPopulationKey === 'swe2025');

  const named = parsePopulationCsv(fixtureText, 'named');
  check('named CSV parse: 9 reps and 3 ignored', named.reps.length === 9 && named.ignored === 3);
  const withBlankLine = parsePopulationCsv(fixtureText + ',,,,,,,,,,,,,\n', 'named');
  check('named CSV parse ignores comma-only lines', withBlankLine.reps.length === 9 && withBlankLine.ignored === 3);
  const quoted = parsePopulationCsv(fixtureText + 'France,Sales,"Account Executive, Senior",France,Sales,"In",3,34,100%,52000,13%,6760,104%,P4 - Excellent performance\n', 'named');
  check('named CSV parse keeps quoted commas and quoted In',
    quoted.reps.length === 10 && quoted.reps[9].jobProfile === 'Account Executive, Senior');
  check('named CSV parse keeps the canonical fields',
    JSON.stringify(named.reps[0]) === JSON.stringify(
      { jobProfile: 'Account Executive', country: 'France', fixed: 52000, nominal: 6760 }));

  let threw = false;
  try {
    parsePopulationCsv('Country,In/Out\nFrance,In\n', 'named');
  } catch (error) {
    threw = /Missing column/.test(error.message);
  }
  check('named CSV parse without the required headers throws', threw);

  // Late answer for a source that is no longer selected must not replace the current population.
  const pending = [];
  const chain = () => {
    const call = {};
    const api = {
      withSuccessHandler(fn) { call.ok = fn; return api; },
      withFailureHandler(fn) { call.fail = fn; return api; },
      getPopulation(key) { call.key = key; pending.push(call); return api; }
    };
    return api;
  };
  const savedRun = google.script.run;
  google.script.run = {
    withSuccessHandler: fn => chain().withSuccessHandler(fn),
    withFailureHandler: fn => chain().withFailureHandler(fn)
  };
  activePopulationSourceKey = 'swe2025';
  loadPopulationFromSheet();
  onPopulationSourceChange('legacy');
  pending[1].ok([{ id: 'LEGACY', fixed: 40000, nominal: 4000 }]);
  pending[0].ok([{ id: 'NEW2025', fixed: 50000, nominal: 5000 }]);
  google.script.run = savedRun;
  check('late answer for a previous source is ignored',
    advPopulation.length === 1 && advPopulation[0].id === 'LEGACY');
  activePopulationSourceKey = 'swe2025';

  // Chosen file with the wrong layout for the selected source: reported in the status, not thrown.
  const SavedFR = globalThis.FileReader;
  globalThis.FileReader = function () {};
  globalThis.FileReader.prototype.readAsText = function () { globalThis.__lastFR = this; };
  activePopulationSourceKey = 'swe2025';
  loadPopulationCsvFile({ name: 'legacy_layout.csv' });
  globalThis.__lastFR.result = 'Orga,Position,Country,ID,,,Base Salary,Amount\nFR,AE,France,F1,,,45000,7000\n';
  globalThis.__lastFR.onload();
  check('picker: wrong layout for the selected source is reported in the status',
    els['pop-status'].innerText.indexOf('Missing column') > -1);
  delete globalThis.__lastFR;
  globalThis.FileReader = SavedFR;

  configurePopulationProfile('NCE');
  applyProfileUi();
  check('NCE hides the population source switch', els['pop-source-switch'].classList.contains('hidden'));

  configurePopulationProfile('SWE');
  applyProfileUi();
  check('SWE shows the population source switch', !els['pop-source-switch'].classList.contains('hidden'));
};
