'use strict';
/** Real population: Sheet loading, per-rep calculations, real PEX, escaping. */
module.exports = function suite(__h) {
  const { check, els, mock, assertClose, htmlSrc } = __h;
  const S = advState;

  check('4:1 top strip omits Current PEX card', htmlSrc.indexOf('id="four-to-one-pex-old"') === -1);
  check('4:1 top strip omits population status', htmlSrc.indexOf('id="four-to-one-status"') === -1);

  // ===== Preload on app startup =====
  mock.sheetReps = [
    { id: 'STARTUP', orga: 'FR', position: 'AE', country: 'France', fixed: 52000, nominal: 6500 }
  ];
  mock.sheetError = null;
  popAutoLoaded = false;
  advPopulation = [];
  __domReadyHandler();
  check('startup auto-load: population loaded before navigation', advPopulation.length === 1 && advPopulation[0].id === 'STARTUP');

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

  mock.sheetReps = { reps: [{ id: 'OBJ', fixed: 50000, nominal: 5000 }], ignored: 0 };
  loadPopulationFromSheet();
  check('Sheet object response is unwrapped', advPopulation.length === 1 && advPopulation[0].id === 'OBJ');
  mock.sheetReps = [
    { id: 'A1', orga: 'FR', position: 'AE', country: 'France', fixed: 52000, nominal: 6500 },
    { id: 'A2', orga: 'FR', position: 'AE', country: 'France', fixed: 48000, nominal: 9600 }
  ];

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

  // ===== Country / job profile filters =====
  advPopulation = [
    { id: 'F1', country: 'France', jobProfile: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'F2', country: 'Spain', jobProfile: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'F3', country: 'France', jobProfile: 'KAM', fixed: 50000, nominal: 5000 }
  ];
  popFilters.country = ''; popFilters.jobProfile = '';
  refreshPopulation();
  check('country options populated (France, Spain)', els['pop-filter-country'].innerHTML.indexOf('>France<') > -1 && els['pop-filter-country'].innerHTML.indexOf('>Spain<') > -1);
  const pexAllF = realAgg.pexHyb;
  popFilters.country = 'France';
  refreshPopulation();
  check('country filter: 2 rows shown', els['pop-table-body'].innerHTML.split('<tr').length - 1 === 2);
  assertClose('country filter: aggregates reduced to two thirds', realAgg.pexHyb, pexAllF * 2 / 3, 1);
  popFilters.country = 'Spain'; popFilters.jobProfile = 'AE';
  refreshPopulation();
  check('combined filters (AND): one row', els['pop-table-body'].innerHTML.split('<tr').length - 1 === 1);
  popFilters.country = ''; popFilters.jobProfile = 'KAM';
  refreshPopulation();
  check('job profile filter: one row', els['pop-table-body'].innerHTML.split('<tr').length - 1 === 1);
  check('status shows loaded / displayed', els['pop-status'].innerText.indexOf('1 displayed') > -1);
  els['pop-filter-country'].value = 'France'; els['pop-filter-jobProfile'].value = '';
  onPopFilterChange();
  check('onPopFilterChange reads the selects', popFilters.country === 'France' && els['pop-table-body'].innerHTML.split('<tr').length - 1 === 2);
  els['pop-filter-country'].value = 'XX';
  onPopFilterChange();
  check('stale filter reset to All', popFilters.country === '' && els['pop-filter-country'].value === '');
  popFilters.country = ''; popFilters.jobProfile = '';
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

  // ===== IDs are not used or rendered =====
  advPopulation = [{ id: '<b>&x', jobProfile: 'AE', country: 'France', fixed: 50000, nominal: 5000 }];
  refreshPopulation();
  const tblHtml = els['pop-table-body'].innerHTML;
  check('ID omitted from population table', tblHtml.indexOf('&lt;b&gt;&amp;x') === -1 && tblHtml.indexOf('<b>') === -1);

  // ===== Expected (new) + new Δ in the table =====
  state.targetIncrease = 30;
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },
    { id: 'B', fixed: 60000, nominal: 14000 }
  ];
  refreshPopulation();
  check('header contains New expected value', /<tr id="pop-table-head">[\s\S]*?New expected value/.test(htmlSrc));
  const tblNew = els['pop-table-body'].innerHTML;
  check('7 cells per row after removing ID (2 new columns)', tblNew.split('<td').length - 1 === 14);
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
  check('default mode is deltas', els['matrix-mode-deltas'].className.indexOf('text-orange-700') > -1 && els['matrix-mode-levels'].className.indexOf('text-slate-500') > -1);
  check('matrix mode buttons show deltas before levels', htmlSrc.indexOf('id="matrix-mode-deltas"') < htmlSrc.indexOf('id="matrix-mode-levels"'));
  check('cells identified: Δ Hyb and Δ New chips', ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('&Delta; Hyb') > -1 && els[id].innerHTML.indexOf('&Delta; New') > -1));
  check('cells colored: amber and indigo present in levels', setMatrixMode('levels') === undefined && ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('text-amber-600') > -1 && els[id].innerHTML.indexOf('text-indigo-600') > -1));
  check('levels cells identified: Hyb and New chips', ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('Hyb</span>') > -1 && els[id].innerHTML.indexOf('New</span>') > -1));
  setMatrixMode('deltas');
  check('headcounts shown', els['matrix-count-low'].innerText.indexOf('2') > -1 && els['matrix-count-high'].innerText.indexOf('2') > -1);
  check('deltas switch: cells colored as Δ', els['matrix-low-low'].innerHTML.indexOf('text-rose-600') > -1 || els['matrix-low-low'].innerHTML.indexOf('text-emerald-600') > -1);
  check('deltas switch: active button', els['matrix-mode-deltas'].className.indexOf('text-orange-700') > -1 && els['matrix-mode-levels'].className.indexOf('text-slate-500') > -1);
  setMatrixMode('levels');
  check('switch back to levels', els['matrix-mode-levels'].className.indexOf('text-orange-700') > -1);
  setMatrixMode('deltas');

  // ===== Matrix: 2x2 / 3x3 switch =====
  check('matrix default size 2x2', matrixSize === '2x2' && els['matrix-size-2'].className.indexOf('text-orange-700') > -1 && els['matrix-size-3'].className.indexOf('text-slate-500') > -1);
  setMatrixSize('3x3');
  check('3x3: size state + active button', matrixSize === '3x3' && els['matrix-size-3'].className.indexOf('text-orange-700') > -1);
  check('3x3: counts sum to population', popMatrix.count.low + popMatrix.count.mid + popMatrix.count.high === 4);
  check('3x3: salary terciles 1/1/2', popMatrix.count.low === 1 && popMatrix.count.mid === 1 && popMatrix.count.high === 2);
  ['low', 'mid', 'high'].forEach(q => {
    ['low', 'mid', 'top'].forEach(p => {
      check('3x3 cell ' + q + '/' + p + ': positive hyb & new', popMatrix.quadrants[q][p].hyb > 0 && popMatrix.quadrants[q][p].new > 0);
    });
    check('3x3 perf monotony (old, ' + q + '): top >= mid >= low', popMatrix.quadrants[q].top.old >= popMatrix.quadrants[q].mid.old && popMatrix.quadrants[q].mid.old >= popMatrix.quadrants[q].low.old);
    check('3x3 perf monotony (hyb, ' + q + '): top >= mid >= low', popMatrix.quadrants[q].top.hyb >= popMatrix.quadrants[q].mid.hyb && popMatrix.quadrants[q].mid.hyb >= popMatrix.quadrants[q].low.hyb);
  });
  check('3x3: mid DOM cells rendered with chips', ['matrix-low-mid', 'matrix-mid-low', 'matrix-mid-mid', 'matrix-mid-top', 'matrix-high-mid'].every(id => els[id].innerHTML.indexOf('Hyb') > -1 && els[id].innerHTML.indexOf('New') > -1));
  check('3x3: mid count shown', els['matrix-count-mid'].innerText.indexOf('1') > -1);
  check('3x3: mid row visible, 4-column grid', els['matrix-row-mid'].className.indexOf('hidden') === -1 && els['matrix-grid'].className.indexOf('grid-cols-[auto_1fr_1fr_1fr]') > -1);
  ['low', 'mid', 'high'].forEach(q => {
    ['low', 'mid', 'top'].forEach(p => {
      const className = els['matrix-' + q + '-' + p].className;
      check('3x3: stable grid position ' + q + '/' + p,
        typeof className === 'string' && className.indexOf('row-start-') > -1 && className.indexOf('col-start-') > -1);
    });
  });
  setMatrixSize('2x2');
  check('back to 2x2: state + quadrants shape', matrixSize === '2x2' && popMatrix.quadrants.low.mid === undefined && popMatrix.count.mid === undefined);
  check('back to 2x2: mid row hidden, 3-column grid', els['matrix-row-mid'].className.indexOf('hidden') > -1 && els['matrix-grid'].className.indexOf('grid-cols-[auto_1fr_1fr]') > -1);
  check('back to 2x2: all five mid cells hidden', ['matrix-low-mid', 'matrix-mid-low', 'matrix-mid-mid', 'matrix-mid-top', 'matrix-high-mid'].every(id => els[id].className.indexOf('hidden') > -1));
  check('back to 2x2: high salary label on row 3, column 1 (' + els['matrix-row-high'].style.gridRow + '/' + els['matrix-row-high'].style.gridColumn + ')', els['matrix-row-high'].style.gridRow === '3' && els['matrix-row-high'].style.gridColumn === '1');
  check('back to 2x2: high salary low cell on row 3 (' + els['matrix-high-low'].style.gridRow + ')', els['matrix-high-low'].style.gridRow === '3');
  check('back to 2x2: high salary top cell on row 3 (' + els['matrix-high-top'].style.gridRow + ')', els['matrix-high-top'].style.gridRow === '3');
  check('back to 2x2: performer headers aligned', els['matrix-head-low'].style.gridColumn === '2' && els['matrix-head-top'].style.gridColumn === '3');

  // ===== Third tab: Matrix =====
  setView('matrix');
  check('tab-matrix active on setView(matrix)', els['tab-matrix'].className.indexOf('shadow-sm') > -1);
  check('tab-standard inactive on setView(matrix)', els['tab-standard'].className.indexOf('shadow-sm') === -1);
  check('tab-advanced inactive on setView(matrix)', els['tab-advanced'].className.indexOf('shadow-sm') === -1);
  check('view-matrix main exists', !!els['view-matrix']);
  refreshPopulation();
  check('matrix card moved: matrix-card inside view-matrix', htmlSrc.indexOf('id="view-matrix"') < htmlSrc.indexOf('id="matrix-card"'));
  check('matrix card removed from advanced population card', htmlSrc.indexOf('id="pop-table-body"') < htmlSrc.indexOf('id="matrix-card"') && htmlSrc.indexOf('id="pop-results"') < htmlSrc.indexOf('id="view-matrix"'));
  advPopulation = [
    { id: 'M1', country: 'France', jobProfile: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'M2', country: 'Spain', jobProfile: 'KAM', fixed: 60000, nominal: 14000 }
  ];
  refreshPopulation();
  els['matrix-filter-jobProfile'].value = 'AE';
  onMatrixFilterChange();
  check('matrix filter syncs to pop filter', els['pop-filter-jobProfile'].value === 'AE' && popFilters.jobProfile === 'AE');
  els['pop-filter-country'].value = 'France';
  onPopFilterChange();
  check('pop filter syncs to matrix filter', els['matrix-filter-country'].value === 'France' && popFilters.country === 'France');
  els['matrix-filter-jobProfile'].value = ''; els['matrix-filter-country'].value = '';
  onMatrixFilterChange();
  check('matrix filters reset', popFilters.jobProfile === '' && popFilters.country === '' && els['pop-filter-jobProfile'].value === '');
  // Sync target increase & minimums
  syncTargetSliders();
  check('matrix target slider synced', els['matrix-target-increase'].value == state.targetIncrease && els['matrix-val-target-increase'].innerText.indexOf('%') > -1);
  state.targetIncrease = 15;
  syncTargetSliders();
  check('matrix target slider follows state', els['matrix-target-increase'].value == 15);
  state.targetIncrease = 0;
  syncTargetSliders();
  advState.min100E = 12000;
  syncMinInputs();
  check('matrix min100 synced from state', els['matrix-min-100'].value == 12000 && els['adv-min-100'].value == 12000);
  const hybBefore = realAgg.pexHyb;
  advState.min100E = 0;
  syncMinInputs();
  refreshPopulation();
  check('matrix min inputs exist in view', htmlSrc.indexOf('id="matrix-min-100"') > -1 && htmlSrc.indexOf('id="matrix-min-200"') > -1 && htmlSrc.indexOf('id="matrix-target-increase"') > -1);
  check('matrix view omits Orga filter', htmlSrc.indexOf('filter-orga') === -1);
  check('min100=0 restores baseline', realAgg.pexHyb === hybBefore);
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
  check('parse: 2 valid reps', csv1.reps.length === 2);
  check('parse: 3 ignored rows', csv1.ignored === 3);
  check('parse: canonical mapping row 1', csv1.reps[0].jobProfile === 'AE' && csv1.reps[0].country === 'France' && csv1.reps[0].fixed === 50000 && csv1.reps[0].nominal === 5000 && !('id' in csv1.reps[0]));
  check('parse: second row keeps canonical fields', csv1.reps[1].jobProfile === 'KAM' && csv1.reps[1].fixed === 40000);
  check('parse: quoted fields are accepted', csv1.reps[1].country === 'Germany');
  check('parse: \r\n tolerated', parsePopulationCsv('H,H,H,H,,,H,H\r\nFR,AE,France,C9,,,50000,5000\r\n').reps.length === 1);
  check('parse: empty nominal kept as 0', parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,France,C6,,,40000,\n').reps[0].nominal === 0);
  check('parse: blank lines tolerated', parsePopulationCsv('\nH,H,H,H,,,H,H\n\nFR,AE,France,C7,,,45000,7000\n\n').reps.length === 1);
  const csvWithoutMg = parsePopulationCsv(
    'Orga,Position,Country,ID,,,Base Salary,Amount\n' +
    'MG France,AE,France,MG1,,,50000,5000\n' +
    'fr,AE,France,F8,,,50000,5000\n'
  );
  check('parse: orgas containing MG are excluded', csvWithoutMg.reps.length === 1 && csvWithoutMg.reps[0].country === 'France' && csvWithoutMg.ignored === 1);

  // ===== Local CSV: applyPopulationCsv (success path logic) =====
  popAutoLoaded = true;
  applyPopulationCsv(parsePopulationCsv(
    'Orga,Position,Country,ID,,,Base Salary,Amount\n' +
    'FR,AE,France,L1,,,50000,5000\n' +
    'DE,KAM,Germany,L2,,,60000,14000\n'
  ), 'population_test.csv');
  check('local apply: 2 reps in advPopulation', advPopulation.length === 2 && advPopulation[0].country === 'France');
  check('local apply: status names the csv', els['pop-status'].innerText.indexOf('2 rep(s) loaded from population_test.csv') > -1);
  check('local apply: table refreshed', els['pop-table-body'].innerHTML.indexOf('50,000') > -1);
  mock.sheetReps = [
    { jobProfile: 'AE', country: 'France', fixed: 50000, nominal: 5000 },
    { jobProfile: 'KAM', country: 'Germany', fixed: 50000, nominal: 5000 }
  ];
  popAutoLoaded = true;
  loadPopulationFromSheet();
  check('Sheet load: canonical rows are loaded', advPopulation.length === 2 && advPopulation[0].jobProfile === 'AE');
  check('local apply: empty csv → message', (applyPopulationCsv(parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,X,C,,,0,0\n'), 'f.csv'), els['pop-status'].innerText.indexOf('No valid rows found in f.csv') > -1));
  advPopulation = [{ jobProfile: 'AE', country: 'France', fixed: 50000, nominal: 5000 }];
  applyPopulationCsv(parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,X,C,,,0,0\n'), 'bad.csv');
  check('empty csv: existing population untouched', advPopulation.length === 1 && advPopulation[0].jobProfile === 'AE');

  // ===== 4:1 nominal-to-objective scenario =====
  const hasFourToOne = typeof fourToOneState !== 'undefined' && typeof fourToOneNominals === 'function';
  if (hasFourToOne) fourToOneState.corridorC2P = 600000;
  const fourToOneCtx = hasFourToOne ? fourToOneNominals(15000, 150000) : null;
  check('4:1 nominal increase uses standard target nominal', !!fourToOneCtx && fourToOneCtx.nominalIncreaseE === 15000);
  check('4:1 adds four euros of objective per euro nominal', !!fourToOneCtx && fourToOneCtx.objectiveIncreaseE === 60000);
  check('4:1 corridor converts 60000€ into 10 performance points', !!fourToOneCtx && fourToOneCtx.achievementShift === 10);
  check('4:1 corridor normalizes zero to a positive value', typeof normalizeFourToOneCorridor === 'function' && normalizeFourToOneCorridor(0) === 1);
  const savedNewVarShare = state.newVarShare;
  state.newVarShare = 30;
  const fourToOneFixedFloorCtx = hasFourToOne ? fourToOneNominals(10000, 100000) : null;
  check('4:1 keeps the standard 20% fixed-salary floor', !!fourToOneFixedFloorCtx && fourToOneFixedFloorCtx.targetNomE === 20000);
  state.newVarShare = savedNewVarShare;
  advPopulation = [{ jobProfile: 'AE', country: 'France', fixed: 150000, nominal: 15000 }];
  state.targetIncrease = 0;
  refreshPopulation();
  const fourToOnePex0 = typeof realAgg.pexFourToOne === 'number' ? realAgg.pexFourToOne : null;
  state.targetIncrease = 30;
  refreshPopulation();
  check('4:1 ignores global target increase slider', fourToOnePex0 !== null && realAgg.pexFourToOne === fourToOnePex0);
  state.targetIncrease = 0;

  // ===== Fourth tab and matrix scenario =====
  const fourTab = document.getElementById('tab-four-to-one');
  const fourView = document.getElementById('view-four-to-one');
  const fourCorridor = document.getElementById('four-to-one-corridor');
  const fourTable = document.getElementById('four-to-one-table-body');
  setView('four-to-one');
  check('4:1 tab active', typeof fourTab.className === 'string' && fourTab.className.indexOf('shadow-sm') > -1);
  check('4:1 view exists', htmlSrc.indexOf('id="view-four-to-one"') > -1 && !!fourView);
  check('4:1 corridor input exists', htmlSrc.indexOf('id="four-to-one-corridor"') > -1 && !!fourCorridor);
  refreshPopulation();
  check('4:1 table renders', fourTable.innerHTML.indexOf('150,000') > -1);
  check('matrix includes 4:1 scenario', els['matrix-low-low'].innerHTML.indexOf('4:1') > -1 || els['matrix-high-low'].innerHTML.indexOf('4:1') > -1);

  // ===== 4:1 overperformance slider and impact cards =====
  const fourOverperf = document.getElementById('four-to-one-overperf');
  const fourOverperfValue = document.getElementById('four-to-one-overperf-value');
  const fourPnl = document.getElementById('four-to-one-pnl');
  check('4:1 overperformance slider exists', htmlSrc.indexOf('id="four-to-one-overperf"') > -1 && !!fourOverperf);
  check('4:1 impact cards exist', htmlSrc.indexOf('id="four-to-one-pnl"') > -1
    && htmlSrc.indexOf('id="four-to-one-pnl-c2p"') > -1 && !!fourPnl);
  check('4:1 P&L uses the scenario-specific label', htmlSrc.indexOf('4:1 P&L') > -1);
  check('4:1 P&L has one generated C2P value', htmlSrc.indexOf('C2P generated') > -1
    && htmlSrc.indexOf('id="four-to-one-pnl-c2p" class="text-lg font-black text-white"') > -1
    && htmlSrc.indexOf('id="four-to-one-c2p-gain"') === -1
    && htmlSrc.indexOf('id="four-to-one-c2p-gain-gross"') === -1);
  check('4:1 top strip matches Hybrid font sizes', htmlSrc.indexOf('id="four-to-one-pex-standard" class="text-xl mt-1') > -1
    && htmlSrc.indexOf('id="four-to-one-pnl" class="text-2xl mt-1') > -1);
  check('Hybrid P&L mirrors the 4:1 C2P layout', htmlSrc.indexOf('C2P generated') > -1
    && htmlSrc.indexOf('id="hyb-top-c2p" class="text-lg font-black text-white"') > -1);
  check('4:1 overperformance slider is synchronized', typeof syncOverperfSliders === 'function');
  state.overperf = 2;
  syncOverperfSliders();
  check('4:1 slider mirrors overperformance', fourOverperf.value === 2
    && fourOverperfValue.innerText === '+2.0%');
  refreshPopulation();
  const fourPnlExpected = (1.4 + (realAgg.stdOld - realAgg.pexFourToOne) / 1e6).toFixed(2);
  check('4:1 P&L combines corridor contribution and PEX delta', fourPnl.innerText === (Number(fourPnlExpected) >= 0 ? '+' : '') + fourPnlExpected + ' M€');
  check('4:1 and Hybrid C2P values are separate from P&L', fourPnl.innerText !== document.getElementById('four-to-one-pnl-c2p').innerText
    && document.getElementById('hyb-top-pnl').innerText !== document.getElementById('hyb-top-c2p').innerText);
  check('4:1 and Hybrid positive C2P values are green', document.getElementById('four-to-one-pnl-c2p').className === 'text-lg font-black text-emerald-600'
    && document.getElementById('hyb-top-c2p').className === 'text-lg font-black text-emerald-600');
  state.overperf = -2;
  refreshPopulation();
  check('4:1 and Hybrid negative C2P values are red', document.getElementById('four-to-one-pnl-c2p').className === 'text-lg font-black text-rose-600'
    && document.getElementById('hyb-top-c2p').className === 'text-lg font-black text-rose-600');
  state.overperf = 2;
  refreshPopulation();
  advPopulation = [
    { jobProfile: 'AE', country: 'France', fixed: 50000, nominal: 5000 },
    { jobProfile: 'AE', country: 'Germany', fixed: 50000, nominal: 5000 }
  ];
  popFilters.country = 'France'; popFilters.jobProfile = '';
  refreshPopulation();
  check('4:1 C2P value follows active population filter', document.getElementById('four-to-one-pnl-c2p').innerText === '+0.70 M€');
  popFilters.country = ''; popFilters.jobProfile = '';
  state.overperf = 0;
  syncOverperfSliders();

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
  check('FileReader: rep loaded from chosen file', advPopulation.length === 1 && advPopulation[0].country === 'France' && advPopulation[0].fixed === 45000);
  check('FileReader: status names the chosen file', els['pop-status'].innerText.indexOf('1 rep(s) loaded from my_pop.csv') > -1);
  delete globalThis.__lastFR;
  globalThis.FileReader = SavedFR;

  // ===== Reset → average model =====
  advPopulation = [];
  refreshPopulation();
  updateDashboard();
  check('average model restored (current PEX 2.50 M€)', els['kpi-pex-old'].innerText === '2.50 M€');
};
