'use strict';
/** Advanced view: UI (toggles, synced sliders, points, individual KPIs). */
module.exports = function suite(__h) {
  const { check, els, mock, htmlSrc } = __h;
  const S = advState;
  setView('advanced');

  // ===== Overlayable standard scenario (hidden by default) =====
  check('8 datasets on the advanced chart', __chartDatasets.length === 8);
  check('standard scenario hidden by default', __chartDatasets[5].hidden === true);
  check('gaussian distribution hidden by default',
    __chartDatasets[6].hidden === true &&
    __chartDatasets[7].hidden === true &&
    __chartDatasets[6].yAxisID === 'density' &&
    __chartDatasets[7].yAxisID === 'density' &&
    advChartInstance.options.scales.density.display === false);
  check('advanced Gaussian curves and density axis use the same blue',
    __chartDatasets[6].borderColor === '#2563eb' &&
    __chartDatasets[7].borderColor === '#2563eb' &&
    advChartInstance.options.scales.density.title.color === '#2563eb' &&
    advChartInstance.options.scales.density.ticks.color === '#2563eb');
  check('hybrid chart includes gaussian toggle', htmlSrc.indexOf('id="btn-adv-gaussian"') > -1);
  S.oldNominalE = 5000; S.t1 = 90; S.t2 = 100; S.zeroThreshold = 0; S.min100E = 0; S.min200E = 0;
  S.fixedSalary = 50000; state.targetIncrease = 0; state.overperf = 0;
  updateAdvancedView();
  check('breakpoints × ratio data filled', __chartDatasets[5].data[90] === evalNewPayout(110) * 2);
  check('gaussian distribution data filled', __chartDatasets[6].data[90] > 0);
  state.targetIncrease = 25;
  state.overperf = 3;
  updateAdvancedView();
  check('gaussian calibrated distribution shifts with target increase and overperformance',
    __chartDatasets[7].data[68] > __chartDatasets[7].data[90] &&
    __chartDatasets[6].data[90] !== __chartDatasets[7].data[90]);
  state.targetIncrease = 0;
  state.overperf = 0;
  toggleDatasetAdv(5);
  check('toggle → visible', __chartDatasets[5].hidden === false);
  toggleDatasetAdv(5);
  check('toggle → hidden', __chartDatasets[5].hidden === true);
  toggleDatasetAdv(6);
  check('gaussian toggle → visible',
    __chartDatasets[6].hidden === false &&
    __chartDatasets[7].hidden === false &&
    advChartInstance.options.scales.density.display === true);
  toggleDatasetAdv(6);
  check('gaussian toggle → hidden',
    __chartDatasets[6].hidden === true &&
    __chartDatasets[7].hidden === true &&
    advChartInstance.options.scales.density.display === false);

  // ===== Synced target increase sliders =====
  state.targetIncrease = 25;
  syncTargetSliders();
  check('standard slider reflects the value', parseFloat(els['slider-target-increase'].value) === 25);
  check('advanced slider reflects the value', parseFloat(els['adv-target-increase'].value) === 25);
  check('advanced target increase max label is right-aligned and unwrapped',
    /right-0[^"]*whitespace-nowrap">\+60 pp<\/span>/.test(htmlSrc));
  check('labels synced', els['val-target-increase'].innerText === '+25.0%' && els['adv-val-target-increase'].innerText === '+25.0%');

  // ===== Unified calibration (individual == aggregate, overperf included) =====
  state.overperf = 3;
  S.x = 110;
  updateAdvancedView();
  check('individual point = getCalibratedAchievement (110-25+3=88.0%)', els['adv-val-achieve-after'].innerText === '88.0%');
  state.overperf = 0;

  // ===== Preset syncs both sliders =====
  state.targetIncrease = 0;
  applyPreset('targetGroup');
  check('preset targetGroup → sliders at 30', parseFloat(els['adv-target-increase'].value) === 30 && parseFloat(els['slider-target-increase'].value) === 30);
  check('preset targetGroup → matrix slider synced', els['matrix-target-increase'].value == state.targetIncrease && els['matrix-val-target-increase'].innerText.indexOf('+30.0%') > -1);
  state.targetIncrease = 0;

  // ===== Before/after points on the chart =====
  S.x = 110;
  updateAdvancedView();
  check('before point on the old curve', __chartDatasets[3].data[90] === 110);
  check('after point on the calibrated hybrid (x=110 → index 90)', __chartDatasets[4].data[90] !== null);

  // ===== Individual KPI reacts to the tested fixed salary =====
  const kpiBefore = els['adv-kpi-hyb'].innerText;
  S.fixedSalary = 100000;
  updateAdvancedView();
  check('individual KPI follows the fixed slider', els['adv-kpi-hyb'].innerText !== kpiBefore);
  S.fixedSalary = 50000;
};
