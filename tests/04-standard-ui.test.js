'use strict';
/** Standard view: dynamic texts, archetype badges, average model. */
module.exports = function suite(__h) {
  const { check, els } = __h;
  setView('standard');

  // ===== Dynamic texts =====
  state.muInit = 95; state.sigmaInit = 25; state.currentPEX = 3.2;
  state.oldVarShare = 12; state.newVarShare = 22;
  updateDashboard();
  check('dynamic mu legend', els['legend-mu'].innerHTML.indexOf('95') > -1);
  check('dynamic segments sigma', els['segments-sigma'].innerHTML.indexOf('25') > -1);
  check('dynamic footer sigma', els['footer-sigma'].innerHTML.indexOf('25') > -1);
  check('dynamic footer PEX', els['footer-pex'].innerHTML.indexOf('3.2') > -1);

  // ===== Consistent archetype badges =====
  state.repInitPerf = 80; updateDashboard();
  check('80% → Struggling (60-85%)', els['badge-rep-archetype'].innerText.indexOf('60-85%') > -1);
  state.repInitPerf = 95; updateDashboard();
  check('95% → On target (85-105%)', els['badge-rep-archetype'].innerText.indexOf('85-105%') > -1);
  state.repInitPerf = 110; updateDashboard();
  check('110% → Strong performer (105-125%)', els['badge-rep-archetype'].innerText.indexOf('105-125%') > -1);
  state.repInitPerf = 140; updateDashboard();
  check('140% → Top Performer (>125%)', els['badge-rep-archetype'].innerText.indexOf('>125%') > -1);

  // ===== Average model defaults =====
  state.muInit = 110; state.sigmaInit = 30; state.currentPEX = 2.5;
  state.oldVarShare = 11; state.newVarShare = 20;
  updateDashboard();
  check('current PEX = 2.50 M€ (average model)', els['kpi-pex-old'].innerText === '2.50 M€');
  check('target budget = 4.13 M€', els['val-new-target-pex'].innerText === '4.13');
  check('average payout rate shown', els['kpi-pex-payout-rate'].innerText.indexOf('% avg.') > -1);

  // ===== Reset: back to defaults =====
  resetDefaults();
  check('reset → mu 110', state.muInit === 110);
  check('reset → PEX 2.5', state.currentPEX === 2.5);
  check('reset → default breakpoints', state.breakpoints.length === 5 && state.breakpoints[1].payout === 10);
};
