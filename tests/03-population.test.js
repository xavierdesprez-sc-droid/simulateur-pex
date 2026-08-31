'use strict';
/** Population réelle : chargement Sheet, calculs par rep, PEX réels, échappement. */
module.exports = function suite(__h) {
  const { check, els, mock, assertClose, htmlSrc } = __h;
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
  check('plus de colonne statut', tbl.indexOf('Gagnant') === -1 && tbl.indexOf('Acquis pr') === -1);
  check('delta > +20 € en vert', tbl.indexOf('text-emerald-600') > -1);
  check('delta neutre (±20 €) en gris', tbl.indexOf('text-slate-400') > -1);

  // ===== Delta ≤ −20 € en rouge =====
  state.targetIncrease = 30;
  refreshPopulation();
  check('delta ≤ −20 € en rouge', els['pop-table-body'].innerHTML.indexOf('text-rose-600') > -1);
  state.targetIncrease = 0;

  // ===== Filtres orga / pays / position =====
  advPopulation = [
    { id: 'F1', orga: 'FR', country: 'France', position: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'F2', orga: 'FR', country: 'Espagne', position: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'F3', orga: 'DE', country: 'France', position: 'KAM', fixed: 50000, nominal: 5000 }
  ];
  popFilters.orga = ''; popFilters.country = ''; popFilters.position = '';
  refreshPopulation();
  check('options orga peuplées (DE, FR)', els['pop-filter-orga'].innerHTML.indexOf('>DE<') > -1 && els['pop-filter-orga'].innerHTML.indexOf('>FR<') > -1);
  const pexAllF = realAgg.pexHyb;
  popFilters.orga = 'DE';
  refreshPopulation();
  check('filtre orga: 1 ligne affichée', els['pop-table-body'].innerHTML.split('<tr').length - 1 === 1);
  assertClose('filtre orga: agrégats réduits au tiers', realAgg.pexHyb, pexAllF / 3, 1);
  popFilters.orga = 'FR'; popFilters.country = 'Espagne';
  refreshPopulation();
  check('filtres cumulés (ET): F2 seul', els['pop-table-body'].innerHTML.indexOf('F2') > -1 && els['pop-table-body'].innerHTML.indexOf('F1') === -1);
  popFilters.orga = ''; popFilters.country = ''; popFilters.position = 'KAM';
  refreshPopulation();
  check('filtre position: F3 seul', els['pop-table-body'].innerHTML.indexOf('F3') > -1 && els['pop-table-body'].innerHTML.indexOf('F2') === -1);
  check('statut affiche chargés / affichés', els['pop-status'].innerText.indexOf('1 affiché') > -1);
  els['pop-filter-orga'].value = 'FR'; els['pop-filter-country'].value = ''; els['pop-filter-position'].value = '';
  onPopFilterChange();
  check('onPopFilterChange lit les selects', popFilters.orga === 'FR' && els['pop-table-body'].innerHTML.indexOf('F1') > -1 && els['pop-table-body'].innerHTML.indexOf('F3') === -1);
  els['pop-filter-orga'].value = 'XX';
  onPopFilterChange();
  check('filtre obsolète réinitialisé à Tous', popFilters.orga === '' && els['pop-filter-orga'].value === '');
  popFilters.orga = ''; popFilters.country = ''; popFilters.position = '';
  refreshPopulation();

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

  // ===== Espérance nouveau + Δ nouveau dans le tableau =====
  state.targetIncrease = 30;
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },
    { id: 'B', fixed: 60000, nominal: 14000 }
  ];
  refreshPopulation();
  check('entête contient Espérance nouveau', /<tr id="pop-table-head">[\s\S]*?Espérance nouveau/.test(htmlSrc));
  const tblNew = els['pop-table-body'].innerHTML;
  check('8 cellules par ligne (2 nouvelles colonnes)', tblNew.split('<td').length - 1 === 16);
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
  check('cellule espérance nouveau du rep A affichée', tblNew.indexOf(Math.round(expNewA).toLocaleString('fr-FR')) > -1);
  assertClose('somme espérances nouveau ≈ agrégat pexNew', expNewTot, realAgg.pexNew, 1);
  check('Δ nouveau ≤ −20 € en rouge', tblNew.indexOf('text-rose-600') > -1);
  state.targetIncrease = 0;

  // ===== Matrice salaire × performance : calcul =====
  advPopulation = [
    { id: 'L1', fixed: 40000, nominal: 5000 },
    { id: 'L2', fixed: 45000, nominal: 5000 },
    { id: 'H1', fixed: 80000, nominal: 14000 },
    { id: 'H2', fixed: 90000, nominal: 14000 }
  ];
  refreshPopulation();
  check('matrice calculée', !!popMatrix && !!popMatrix.quadrants);
  check('effectifs quadrants = population', popMatrix.count.low + popMatrix.count.high === 4);
  check('salaire bas = fixes < moyenne', popMatrix.count.low === 2 && popMatrix.meanFixed > 45000 && popMatrix.meanFixed < 80000);
  ['low', 'high'].forEach(q => {
    check('quadrant ' + q + ' : hyb et new positifs', popMatrix.quadrants[q].hyb > 0 && popMatrix.quadrants[q].new > 0);
    check('quadrant ' + q + ' : new ≥ hyb', popMatrix.quadrants[q].new >= popMatrix.quadrants[q].hyb);
  });
  check('conditionnel low ≤ inconditionnel (actuel, salaire bas)', popMatrix.quadrants.low.old <= realAgg.pexOld / 4 + 1);
  const savedPop = advPopulation;
  advPopulation = [];
  refreshPopulation();
  check('population vide → popMatrix null', popMatrix === null);
  advPopulation = savedPop;
  refreshPopulation();

  // ===== Réinitialisation → modèle moyen =====
  advPopulation = [];
  refreshPopulation();
  updateDashboard();
  check('modèle moyen restauré (PEX actuel 2.50 M€)', els['kpi-pex-old'].innerText === '2.50 M€');
};
