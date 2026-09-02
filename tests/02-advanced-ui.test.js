'use strict';
/** Advanced view: UI (toggles, synced sliders, points, individual KPIs). */
module.exports = function suite(__h) {
  const { check, els, mock } = __h;
  const S = advState;
  setView('advanced');

  // ===== Overlayable standard scenario (hidden by default) =====
  check('6 datasets on the advanced chart', __chartDatasets.length === 6);
  check('standard scenario hidden by default', __chartDatasets[5].hidden === true);
  S.oldNominalE = 5000; S.t1 = 90; S.t2 = 100; S.zeroThreshold = 0; S.min100E = 0; S.min200E = 0;
  S.fixedSalary = 50000; state.targetIncrease = 0; state.overperf = 0;
  updateAdvancedView();
  check('breakpoints × ratio data filled', __chartDatasets[5].data[90] === evalNewPayout(110) * 2);
  toggleDatasetAdv(5);
  check('toggle → visible', __chartDatasets[5].hidden === false);
  toggleDatasetAdv(5);
  check('toggle → hidden', __chartDatasets[5].hidden === true);

  // ===== Synced target increase sliders =====
  state.targetIncrease = 25;
  syncTargetSliders();
  check('standard slider reflects the value', parseFloat(els['slider-target-increase'].value) === 25);
  check('advanced slider reflects the value', parseFloat(els['adv-target-increase'].value) === 25);
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
