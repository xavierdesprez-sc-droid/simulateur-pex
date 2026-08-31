'use strict';
/** Vue avancée : UI (toggles, sliders synchronisés, points, KPIs individuels). */
module.exports = function suite(__h) {
  const { check, els, mock } = __h;
  const S = advState;
  setView('advanced');

  // ===== Scénario standard superposable (caché par défaut) =====
  check('6 datasets sur le chart avancé', __chartDatasets.length === 6);
  check('scénario standard caché par défaut', __chartDatasets[5].hidden === true);
  S.oldNominalE = 5000; S.t1 = 90; S.t2 = 100; S.zeroThreshold = 0; S.min100E = 0; S.min200E = 0;
  S.fixedSalary = 50000; state.targetIncrease = 0; state.overperf = 0;
  updateAdvancedView();
  check('données paliers × ratio remplies', __chartDatasets[5].data[90] === evalNewPayout(110) * 2);
  toggleDatasetAdv(5);
  check('toggle → visible', __chartDatasets[5].hidden === false);
  toggleDatasetAdv(5);
  check('toggle → caché', __chartDatasets[5].hidden === true);

  // ===== Sliders hausse d'objectifs synchronisés =====
  state.targetIncrease = 25;
  syncTargetSliders();
  check('slider standard reflète la valeur', parseFloat(els['slider-target-increase'].value) === 25);
  check('slider avancé reflète la valeur', parseFloat(els['adv-target-increase'].value) === 25);
  check('labels synchronisés', els['val-target-increase'].innerText === '+25.0%' && els['adv-val-target-increase'].innerText === '+25.0%');

  // ===== Calibrage unifié (individu == agrégat, surperf incluse) =====
  state.overperf = 3;
  S.x = 110;
  updateAdvancedView();
  check('point individuel = getCalibratedAchievement (110-25+3=88.0%)', els['adv-val-achieve-after'].innerText === '88.0%');
  state.overperf = 0;

  // ===== Preset synchronise les deux sliders =====
  state.targetIncrease = 0;
  applyPreset('targetGroup');
  check('preset targetGroup → sliders à 30', parseFloat(els['adv-target-increase'].value) === 30 && parseFloat(els['slider-target-increase'].value) === 30);
  state.targetIncrease = 0;

  // ===== Points avant/après sur le chart =====
  S.x = 110;
  updateAdvancedView();
  check('point avant sur la courbe ancienne', __chartDatasets[3].data[90] === 110);
  check("point après sur l'hybride calibré (x=110 → index 90)", __chartDatasets[4].data[90] !== null);

  // ===== KPI individuel réagit au salaire fixe testé =====
  const kpiAvant = els['adv-kpi-hyb'].innerText;
  S.fixedSalary = 100000;
  updateAdvancedView();
  check('KPI individuel suit le slider fixe', els['adv-kpi-hyb'].innerText !== kpiAvant);
  S.fixedSalary = 50000;
};
