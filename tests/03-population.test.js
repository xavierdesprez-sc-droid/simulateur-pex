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
    check('quadrant ' + q + ': hyb and new positive', popMatrix.quadrants[q].hyb > 0 && popMatrix.quadrants[q].new > 0);
    check('quadrant ' + q + ': new ≥ hyb', popMatrix.quadrants[q].new >= popMatrix.quadrants[q].hyb);
  });
  check('conditional low ≤ unconditional (current, low salary)', popMatrix.quadrants.low.old <= realAgg.pexOld / 4 + 1);
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

  // ===== Reset → average model =====
  advPopulation = [];
  refreshPopulation();
  updateDashboard();
  check('average model restored (current PEX 2.50 M€)', els['kpi-pex-old'].innerText === '2.50 M€');
};
