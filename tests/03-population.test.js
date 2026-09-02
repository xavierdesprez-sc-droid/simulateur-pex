'use strict';
/** Real population: Sheet loading, per-rep calculations, real PEX, escaping. */
module.exports = function suite(__h) {
  const { check, els, mock, assertClose, htmlSrc } = __h;
  const S = advState;
  setView('advanced');
  S.oldNominalE = 5000; S.t1 = 90; S.t2 = 100; S.zeroThreshold = 0; S.min100E = 0; S.min200E = 0;
  S.fixedSalary = 50000; state.targetIncrease = 0; state.overperf = 0;

  // ===== Loading from the Sheet (mock) =====
  mock.sheetReps = [
    { id: 'A1', orga: 'FR', position: 'AE', country: 'France', fixed: 52000, nominal: 6500 },
    { id: 'A2', orga: 'FR', position: 'AE', country: 'France', fixed: 48000, nominal: 9600 }
  ];
  mock.sheetError = null;
  popAutoLoaded = false;
  setView('advanced'); // auto-load on first switch
  check('auto-load: 2 reps loaded', advPopulation.length === 2);
  check('status shown', els['pop-status'].innerText.indexOf('2 rep') > -1);

  // Error propagated
  mock.sheetError = 'Permission denied';
  loadPopulationFromSheet();
  check('Sheet error propagated to status', els['pop-status'].innerText.indexOf('Permission denied') > -1);
  mock.sheetError = null;

  // Ignored rows (new {reps, ignored} shape from Code.gs)
  loadPopulationFromSheet.__testOnly = null;
  mock.sheetReps = [{ id: 'A1', fixed: 50000, nominal: 5000 }];
  loadPopulationFromSheet();
  check('loading 1 rep', advPopulation.length === 1);

  // ===== 20% floor based on EACH rep's salary =====
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },  // floor 10000 > 5000 → raised
    { id: 'B', fixed: 60000, nominal: 14000 }  // grandfathered 14000 > floor 12000 → preserved
  ];
  refreshPopulation();
  check('per-rep floor: A raised to 10000', advNominals(5000, 50000).newNomE === 10000);
  check('per-rep floor: B preserved at 14000', advNominals(14000, 60000).newNomE === 14000);
  const tbl = els['pop-table-body'].innerHTML;
  check('no more status column', tbl.indexOf('Loser') === -1 && tbl.indexOf('Grandfathered') === -1);
  check('delta > +20 € in green', tbl.indexOf('text-emerald-600') > -1);
  check('neutral delta (±20 €) in gray', tbl.indexOf('text-slate-400') > -1);

  // ===== Delta ≤ −20 € in red =====
  state.targetIncrease = 30;
  refreshPopulation();
  check('delta ≤ −20 € in red', els['pop-table-body'].innerHTML.indexOf('text-rose-600') > -1);
  state.targetIncrease = 0;

  // ===== Orga / country / position filters =====
  advPopulation = [
    { id: 'F1', orga: 'FR', country: 'France', position: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'F2', orga: 'FR', country: 'Spain', position: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'F3', orga: 'DE', country: 'France', position: 'KAM', fixed: 50000, nominal: 5000 }
  ];
  popFilters.orga = ''; popFilters.country = ''; popFilters.position = '';
  refreshPopulation();
  check('orga options populated (DE, FR)', els['pop-filter-orga'].innerHTML.indexOf('>DE<') > -1 && els['pop-filter-orga'].innerHTML.indexOf('>FR<') > -1);
  const pexAllF = realAgg.pexHyb;
  popFilters.orga = 'DE';
  refreshPopulation();
  check('orga filter: 1 row shown', els['pop-table-body'].innerHTML.split('<tr').length - 1 === 1);
  assertClose('orga filter: aggregates reduced to one third', realAgg.pexHyb, pexAllF / 3, 1);
  popFilters.orga = 'FR'; popFilters.country = 'Spain';
  refreshPopulation();
  check('combined filters (AND): F2 only', els['pop-table-body'].innerHTML.indexOf('F2') > -1 && els['pop-table-body'].innerHTML.indexOf('F1') === -1);
  popFilters.orga = ''; popFilters.country = ''; popFilters.position = 'KAM';
  refreshPopulation();
  check('position filter: F3 only', els['pop-table-body'].innerHTML.indexOf('F3') > -1 && els['pop-table-body'].innerHTML.indexOf('F2') === -1);
  check('status shows loaded / displayed', els['pop-status'].innerText.indexOf('1 displayed') > -1);
  els['pop-filter-orga'].value = 'FR'; els['pop-filter-country'].value = ''; els['pop-filter-position'].value = '';
  onPopFilterChange();
  check('onPopFilterChange reads the selects', popFilters.orga === 'FR' && els['pop-table-body'].innerHTML.indexOf('F1') > -1 && els['pop-table-body'].innerHTML.indexOf('F3') === -1);
  els['pop-filter-orga'].value = 'XX';
  onPopFilterChange();
  check('stale filter reset to All', popFilters.orga === '' && els['pop-filter-orga'].value === '');
  popFilters.orga = ''; popFilters.country = ''; popFilters.position = '';
  refreshPopulation();

  // ===== The fixed salary slider does NOT change the real PEX =====
  refreshPopulation();
  const pexHybAvant = realAgg.pexHyb;
  S.fixedSalary = 80000;
  updateAdvancedView();
  check('real hybrid PEX insensitive to fixed salary slider', realAgg.pexHyb === pexHybAvant);
  S.fixedSalary = 50000;

  // ===== Target increase taken into account in the hybrid =====
  advPopulation = [{ id: "X", fixed: 50000, nominal: 5000 }];
  state.targetIncrease = 0;
  refreshPopulation();
  const hyb0 = realAgg.pexHyb;
  state.targetIncrease = 30;
  refreshPopulation();
  check('target increase lowers hybrid expected payout (110→80)', realAgg.pexHyb < hyb0 - 100);
  state.targetIncrease = 0;

  // ===== Hybrid expected payout takes € floors into account =====
  refreshPopulation();
  const base = realAgg.pexHyb;
  S.min200E = 25000;
  refreshPopulation();
  check('min200 raises the expected payout', realAgg.pexHyb > base + 100);
  S.min200E = 0; S.min100E = 12000;
  refreshPopulation();
  check('min100 > base', realAgg.pexHyb > base);
  S.min100E = 0;

  // ===== HTML escaping of IDs =====
  advPopulation = [{ id: '<b>&x', fixed: 50000, nominal: 5000 }];
  refreshPopulation();
  const tblHtml = els['pop-table-body'].innerHTML;
  check('ID escaped', tblHtml.indexOf('&lt;b&gt;&amp;x') > -1 && tblHtml.indexOf('<b>') === -1);

  // ===== Expected (new) + new Δ in the table =====
  state.targetIncrease = 30;
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },
    { id: 'B', fixed: 60000, nominal: 14000 }
  ];
  refreshPopulation();
  check('header contains New expected value', /<tr id="pop-table-head">[\s\S]*?New expected value/.test(htmlSrc));
  const tblNew = els['pop-table-body'].innerHTML;
  check('8 cells per row (2 new columns)', tblNew.split('<td').length - 1 === 16);
  const muCt = getCalibratedAchievement(state.muInit);
  const ptsCt = Engine.densityPoints(muCt, state.sigmaInit);
  let expNewA = 0, expNewTot = 0;
  advPopulation.forEach(rep => {
    const na = advNominals(rep.nominal, rep.fixed);
    let s = 0;
    for (const { x, w } of ptsCt) s += Engine.newBaseE(x, na) * w;
    expNewTot += s;
    if (rep.id === 'A') expNewA = s;
  });
  check('rep A expected (new) cell shown', tblNew.indexOf(Math.round(expNewA).toLocaleString('en-US')) > -1);
  assertClose('sum of new expected payouts ≈ pexNew aggregate', expNewTot, realAgg.pexNew, 1);
  check('new Δ ≤ −20 € in red', tblNew.indexOf('text-rose-600') > -1);
  check('hybrid expected value cell in amber (not orange/red)', tblNew.indexOf('text-amber-600') > -1 && tblNew.indexOf('text-orange-700') === -1);
  state.targetIncrease = 0;

  // ===== Salary × performance matrix: calculation =====
  advPopulation = [
    { id: 'L1', fixed: 40000, nominal: 5000 },
    { id: 'L2', fixed: 45000, nominal: 5000 },
    { id: 'H1', fixed: 80000, nominal: 14000 },
    { id: 'H2', fixed: 90000, nominal: 14000 }
  ];
  refreshPopulation();
  check('matrix computed', !!popMatrix && !!popMatrix.quadrants);
  check('quadrant headcount = population', popMatrix.count.low + popMatrix.count.high === 4);
  check('low salary = fixed < mean', popMatrix.count.low === 2 && popMatrix.meanFixed > 45000 && popMatrix.meanFixed < 80000);
  ['low', 'high'].forEach(q => {
    ['low', 'top'].forEach(p => {
      check('quadrant ' + q + '/' + p + ': hyb and new positive', popMatrix.quadrants[q][p].hyb > 0 && popMatrix.quadrants[q][p].new > 0);
      check('quadrant ' + q + '/' + p + ': new ≥ hyb', popMatrix.quadrants[q][p].new >= popMatrix.quadrants[q][p].hyb);
    });
  });
  check('conditional low ≤ unconditional (current, low salary)', popMatrix.quadrants.low.low.old <= realAgg.pexOld / 4 + 1);
  // ===== Matrix: performance columns must differ (bug repro: identical low/top cells) =====
  ['low', 'high'].forEach(q => {
    check('perf halves differ (old, ' + q + ' salary): top > low', popMatrix.quadrants[q].top.old > popMatrix.quadrants[q].low.old);
    check('perf halves differ (hyb, ' + q + ' salary): top > low', popMatrix.quadrants[q].top.hyb > popMatrix.quadrants[q].low.hyb);
    check('perf halves differ (new, ' + q + ' salary): top > low', popMatrix.quadrants[q].top.new > popMatrix.quadrants[q].low.new);
  });
  const savedPop = advPopulation;
  advPopulation = [];
  refreshPopulation();
  check('empty population → popMatrix null', popMatrix === null);
  advPopulation = savedPop;
  refreshPopulation();

  // ===== Matrix: DOM rendering and switch =====
  check('matrix card: 4 cells rendered', ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('text-orange-700') > -1 && els[id].innerHTML.indexOf('text-indigo') > -1));
  check('headcounts shown', els['matrix-count-low'].innerText.indexOf('2') > -1 && els['matrix-count-high'].innerText.indexOf('2') > -1);
  setMatrixMode('deltas');
  check('deltas switch: cells colored as Δ', els['matrix-low-low'].innerHTML.indexOf('text-rose-600') > -1 || els['matrix-low-low'].innerHTML.indexOf('text-emerald-600') > -1);
  check('deltas switch: active button', els['matrix-mode-deltas'].className.indexOf('text-orange-700') > -1 && els['matrix-mode-levels'].className.indexOf('text-slate-500') > -1);
  setMatrixMode('levels');
  check('switch back to levels', els['matrix-mode-levels'].className.indexOf('text-orange-700') > -1);

  // ===== Third tab: Matrix =====
  setView('matrix');
  check('tab-matrix active on setView(matrix)', els['tab-matrix'].className.indexOf('shadow-sm') > -1);
  check('tab-standard inactive on setView(matrix)', els['tab-standard'].className.indexOf('shadow-sm') === -1);
  check('tab-advanced inactive on setView(matrix)', els['tab-advanced'].className.indexOf('shadow-sm') === -1);
  check('view-matrix main exists', !!els['view-matrix']);
  setView('standard');
  check('tab-standard active on setView(standard)', els['tab-standard'].className.indexOf('shadow-sm') > -1);
  check('tab-matrix inactive on setView(standard)', els['tab-matrix'].className.indexOf('shadow-sm') === -1);
  setView('advanced');
  check('tab-advanced active on setView(advanced)', els['tab-advanced'].className.indexOf('shadow-sm') > -1);

  // ===== Local CSV: parsePopulationCsv (pure) =====
  const csv1 = parsePopulationCsv(
    'Orga,Position,Country,ID,,,Base Salary,Amount\n' +
    'FR,AE,France,C1,,,50000,5000\n' +
    ',,,,,,60000,14000\n' +
    'DE,KAM,Germany,"C 3",,,40000,3000\n' +
    'FR,AE,Spain,C4,,,0,5000\n' +
    'FR,AE,Italy,C5\n'
  );
  check('parse: 3 valid reps', csv1.reps.length === 3);
  check('parse: 2 ignored rows', csv1.ignored === 2);
  check('parse: full mapping row 1', csv1.reps[0].id === 'C1' && csv1.reps[0].orga === 'FR' && csv1.reps[0].position === 'AE' && csv1.reps[0].country === 'France' && csv1.reps[0].fixed === 50000 && csv1.reps[0].nominal === 5000);
  check('parse: id fallback rep2', csv1.reps[1].id === 'rep2');
  check('parse: quoted field stripped', csv1.reps[2].id === 'C 3');
  check('parse: \r\n tolerated', parsePopulationCsv('H,H,H,H,,,H,H\r\nFR,AE,France,C9,,,50000,5000\r\n').reps.length === 1);
  check('parse: empty nominal kept as 0', parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,France,C6,,,40000,\n').reps[0].nominal === 0);
  check('parse: blank lines tolerated', parsePopulationCsv('\nH,H,H,H,,,H,H\n\nFR,AE,France,C7,,,45000,7000\n\n').reps.length === 1);

  // ===== Local CSV: applyPopulationCsv (success path logic) =====
  popAutoLoaded = true;
  applyPopulationCsv(parsePopulationCsv(
    'Orga,Position,Country,ID,,,Base Salary,Amount\n' +
    'FR,AE,France,L1,,,50000,5000\n' +
    'DE,KAM,Germany,L2,,,60000,14000\n'
  ), 'population_test.csv');
  check('local apply: 2 reps in advPopulation', advPopulation.length === 2 && advPopulation[0].id === 'L1');
  check('local apply: status names the csv', els['pop-status'].innerText.indexOf('2 rep(s) loaded from population_test.csv') > -1);
  check('local apply: table refreshed', els['pop-table-body'].innerHTML.indexOf('L1') > -1);
  check('local apply: empty csv → message', (applyPopulationCsv(parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,X,C,,,0,0\n'), 'f.csv'), els['pop-status'].innerText.indexOf('No valid rows found in f.csv') > -1));
  advPopulation = [{ id: 'KEEP', fixed: 50000, nominal: 5000 }];
  applyPopulationCsv(parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,X,C,,,0,0\n'), 'bad.csv');
  check('empty csv: existing population untouched', advPopulation.length === 1 && advPopulation[0].id === 'KEEP');

  // ===== Local CSV: fetch blocked → file picker fallback =====
  const savedGoogle = globalThis.google;
  globalThis.google = undefined; // force the local branch
  const savedFetch = globalThis.fetch;
  document.getElementById('pop-csv-input'); // ensure the element exists in the harness registry
  els['pop-csv-input'].clicked = false;
  els['pop-csv-input'].click = function () { els['pop-csv-input'].clicked = true; };
  globalThis.fetch = () => ({ then() { return this; }, catch(fn) { fn(new TypeError('Failed to fetch')); return this; } });
  loadPopulationFromSheet();
  check('fetch blocked: info status shown', els['pop-status'].innerText.indexOf('blocked by the browser') > -1);
  check('fetch blocked: picker opened', els['pop-csv-input'].clicked === true);
  globalThis.fetch = savedFetch;
  globalThis.google = savedGoogle;
  mock.sheetReps = [{ id: 'A1', fixed: 50000, nominal: 5000 }]; mock.sheetError = null;
  loadPopulationFromSheet(); // back on the mocked Sheet path (google restored)
  check('google restored: Sheet path still works', advPopulation.length === 1 && advPopulation[0].id === 'A1');

  // ===== Local CSV: FileReader path (chosen file) =====
  const SavedFR = globalThis.FileReader;
  globalThis.FileReader = function () {};
  globalThis.FileReader.prototype.readAsText = function (file) { globalThis.__lastFR = this; };
  loadPopulationCsvFile({ name: 'my_pop.csv' });
  globalThis.__lastFR.result = 'Orga,Position,Country,ID,,,Base Salary,Amount\nFR,AE,France,F1,,,45000,7000\n';
  globalThis.__lastFR.onload();
  check('FileReader: rep loaded from chosen file', advPopulation.length === 1 && advPopulation[0].id === 'F1' && advPopulation[0].fixed === 45000);
  check('FileReader: status names the chosen file', els['pop-status'].innerText.indexOf('1 rep(s) loaded from my_pop.csv') > -1);
  delete globalThis.__lastFR;
  globalThis.FileReader = SavedFR;

  // ===== Reset → average model =====
  advPopulation = [];
  refreshPopulation();
  updateDashboard();
  check('average model restored (current PEX 2.50 M€)', els['kpi-pex-old'].innerText === '2.50 M€');
};
