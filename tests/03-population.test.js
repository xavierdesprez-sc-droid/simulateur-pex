'use strict';
/** Population réelle : chargement Sheet, calculs par rep, PEX réels, échappement. */
module.exports = function suite(__h) {
  const { check, els, mock } = __h;
  const S = advState;
  setView('advanced');
  S.oldNominalE = 5000; S.t1 = 90; S.t2 = 100; S.zeroThreshold = 0; S.min100E = 0; S.min200E = 0;
  S.fixedSalary = 50000; state.targetIncrease = 0; state.overperf = 0;

  // ===== Chargement depuis le Sheet (mock) =====
  mock.sheetReps = [
    { id: 'A1', orga: 'FR', position: 'AE', country: 'France', fixed: 52000, nominal: 6500 },
    { id: 'A2', orga: 'FR', position: 'AE', country: 'France', fixed: 48000, nominal: 9600 }
  ];
  mock.sheetError = null;
  popAutoLoaded = false;
  setView('advanced'); // auto-load au premier switch
  check('auto-load: 2 reps chargées', advPopulation.length === 2);
  check('statut affiché', els['pop-status'].innerText.indexOf('2 commercial') > -1);

  // Erreur propagée
  mock.sheetError = 'Permission denied';
  loadPopulationFromSheet();
  check('erreur Sheet propagée au statut', els['pop-status'].innerText.indexOf('Permission denied') > -1);
  mock.sheetError = null;

  // Lignes ignorées (nouvelle forme {reps, ignored} de Code.gs)
  loadPopulationFromSheet.__testOnly = null;
  mock.sheetReps = [{ id: 'A1', fixed: 50000, nominal: 5000 }];
  loadPopulationFromSheet();
  check('chargement 1 rep', advPopulation.length === 1);

  // ===== Plancher 20% basé sur le salaire de CHAQUE rep =====
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },  // plancher 10000 > 5000 → relevé
    { id: 'B', fixed: 60000, nominal: 14000 }  // acquis 14000 > plancher 12000 → préservé
  ];
  refreshPopulation();
  check('plancher par rep: A relevé à 10000', advNominals(5000, 50000).newNomE === 10000);
  check('plancher par rep: B préservé à 14000', advNominals(14000, 60000).newNomE === 14000);
  const tbl = els['pop-table-body'].innerHTML;
  check('statut acquis préservé présent', tbl.indexOf('Acquis pr') > -1);
  check('statut gagnant présent', tbl.indexOf('Gagnant') > -1);

  // ===== Le slider fixe ne change PAS le PEX réel =====
  refreshPopulation();
  const pexHybAvant = realAgg.pexHyb;
  S.fixedSalary = 80000;
  updateAdvancedView();
  check('PEX hybride réel insensible au slider fixe', realAgg.pexHyb === pexHybAvant);
  S.fixedSalary = 50000;

  // ===== Hausse des objectifs prise en compte dans l'hybride =====
  advPopulation = [{ id: "X", fixed: 50000, nominal: 5000 }];
  state.targetIncrease = 0;
  refreshPopulation();
  const hyb0 = realAgg.pexHyb;
  state.targetIncrease = 30;
  refreshPopulation();
  check("hausse objectifs baisse l'espérance hybride (110→80)", realAgg.pexHyb < hyb0 - 100);
  state.targetIncrease = 0;

  // ===== Espérance hybride tient compte des planchers € =====
  refreshPopulation();
  const base = realAgg.pexHyb;
  S.min200E = 25000;
  refreshPopulation();
  check("min200 relève l'espérance", realAgg.pexHyb > base + 100);
  S.min200E = 0; S.min100E = 12000;
  refreshPopulation();
  check('min100 > base', realAgg.pexHyb > base);
  S.min100E = 0;

  // ===== Échappement HTML des IDs =====
  advPopulation = [{ id: '<b>&x', fixed: 50000, nominal: 5000 }];
  refreshPopulation();
  const tblHtml = els['pop-table-body'].innerHTML;
  check('ID échappé', tblHtml.indexOf('&lt;b&gt;&amp;x') > -1 && tblHtml.indexOf('<b>') === -1);

  // ===== Réinitialisation → modèle moyen =====
  advPopulation = [];
  refreshPopulation();
  updateDashboard();
  check('modèle moyen restauré (PEX actuel 2.50 M€)', els['kpi-pex-old'].innerText === '2.50 M€');
};
