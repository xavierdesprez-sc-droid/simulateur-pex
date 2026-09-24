'use strict';

module.exports = function suite(__h) {
  const { check, els, htmlSrc, mock } = __h;
  const reps = [
    { jobProfile: 'AE', country: 'France', fixed: 50000, nominal: 5000 }
  ];
  document.getElementById('pop-individual-table');
  document.getElementById('four-to-one-results');

  check('both individual table wrappers are present', [
    'pop-individual-table',
    'four-to-one-results'
  ].every(id => htmlSrc.indexOf('id="' + id + '"') > -1));

  mock.sheetError = null;
  mock.sheetReps = { reps, ignored: 0, canViewIndividualTables: false };
  loadPopulationFromSheet();
  check('aggregate-only account hides both individual tables',
    els['pop-individual-table'].hidden === true &&
    els['four-to-one-results'].hidden === true);

  mock.sheetReps = { reps, ignored: 0, canViewIndividualTables: true };
  loadPopulationFromSheet();
  check('details account shows both individual tables',
    els['pop-individual-table'].hidden === false &&
    els['four-to-one-results'].hidden === false);

  applyPopulationCsv({ reps, ignored: 0 }, 'local.csv');
  check('local CSV mode keeps individual tables visible',
    els['pop-individual-table'].hidden === false &&
    els['four-to-one-results'].hidden === false);
};
