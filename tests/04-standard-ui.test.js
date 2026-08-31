'use strict';
/** Vue standard : textes dynamiques, badges archétype, modèle moyen. */
module.exports = function suite(__h) {
  const { check, els } = __h;
  setView('standard');

  // ===== Textes dynamiques =====
  state.muInit = 95; state.sigmaInit = 25; state.currentPEX = 3.2;
  state.oldVarShare = 12; state.newVarShare = 22;
  updateDashboard();
  check('légende mu dynamique', els['legend-mu'].innerHTML.indexOf('95') > -1);
  check('sigma des tranches dynamique', els['segments-sigma'].innerHTML.indexOf('25') > -1);
  check('nominal moyen dynamique (12 → 22)', els['agg-nominal'].innerHTML.indexOf('12') > -1 && els['agg-nominal'].innerHTML.indexOf('22') > -1);
  check('mu agrégat dynamique', els['agg-mu'].innerHTML.indexOf('95') > -1);
  check('footer sigma dynamique', els['footer-sigma'].innerHTML.indexOf('25') > -1);
  check('footer PEX dynamique', els['footer-pex'].innerHTML.indexOf('3.2') > -1);

  // ===== Badges archétype cohérents =====
  state.repInitPerf = 80; updateDashboard();
  check('80% → En difficulté (60-85%)', els['badge-rep-archetype'].innerText.indexOf('60-85%') > -1);
  state.repInitPerf = 95; updateDashboard();
  check('95% → Objectif atteint (85-105%)', els['badge-rep-archetype'].innerText.indexOf('85-105%') > -1);
  state.repInitPerf = 110; updateDashboard();
  check('110% → Bon performer (105-125%)', els['badge-rep-archetype'].innerText.indexOf('105-125%') > -1);
  state.repInitPerf = 140; updateDashboard();
  check('140% → Top Performer (>125%)', els['badge-rep-archetype'].innerText.indexOf('>125%') > -1);

  // ===== Modèle moyen par défaut =====
  state.muInit = 110; state.sigmaInit = 30; state.currentPEX = 2.5;
  state.oldVarShare = 11; state.newVarShare = 20;
  updateDashboard();
  check('PEX actuel = 2.50 M€ (modèle moyen)', els['kpi-pex-old'].innerText === '2.50 M€');
  check('budget cible = 4.13 M€', els['val-new-target-pex'].innerText === '4.13');
  check('taux de payout moyen affiché', els['kpi-pex-payout-rate'].innerText.indexOf('% moy.') > -1);

  // ===== Reset : retour aux défauts =====
  resetDefaults();
  check('reset → mu 110', state.muInit === 110);
  check('reset → PEX 2.5', state.currentPEX === 2.5);
  check('reset → breakpoints par défaut', state.breakpoints.length === 5 && state.breakpoints[1].payout === 10);
};
