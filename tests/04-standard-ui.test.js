'use strict';
/** Standard view: dynamic texts, archetype badges, average model. */
module.exports = function suite(__h) {
  const { check, els } = __h;
  setView('standard');
  initChart();
  updateChartData();
  document.getElementById('btn-toggle-weighted');
  check('weighted curve button reflects its initially visible chart dataset',
    els['btn-toggle-weighted'].ariaPressed === 'true');
  toggleDataset(4);
  check('weighted curve button reflects its hidden chart dataset',
    els['btn-toggle-weighted'].ariaPressed === 'false');
  check('standard Gaussian uses the hybrid density scale',
    Math.abs(mainChartInstance.data.datasets[0].data[100] - normalPdf(110, state.muInit, state.sigmaInit) * 100) < 0.0001 &&
    mainChartInstance.options.scales.yDensity.max === undefined &&
    mainChartInstance.options.scales.yDensity.ticks.display !== false &&
    mainChartInstance.options.scales.yDensity.title.text === 'Distribution density (%)');
  check('standard Gaussian curves and density axis use the same blue',
    mainChartInstance.data.datasets[0].borderColor === '#2563eb' &&
    mainChartInstance.data.datasets[1].borderColor === '#2563eb' &&
    mainChartInstance.options.scales.yDensity.title.color === '#2563eb' &&
    mainChartInstance.options.scales.yDensity.ticks.color === '#2563eb');

  // ===== Dynamic texts =====
  state.muInit = 95; state.sigmaInit = 25; state.currentPEX = 3.2;
  state.oldVarShare = 12; state.newVarShare = 22;
  updateDashboard();
  check('dynamic mu legend', els['legend-mu'].innerHTML.indexOf('95') > -1);
  check('dynamic segments sigma', els['segments-sigma'].innerHTML.indexOf('25') > -1);
  check('footer keeps the requested fixed summary',
    __h.htmlSrc.includes('Variable Pay &amp; PEX Simulator') &&
    __h.htmlSrc.includes('Data-driven population analysis &bull; Standard, Hybrid &amp; Matrix scenarios') &&
    !__h.htmlSrc.includes('SWE / NCE profiles'));

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
  check('reset → sigma 60 and corridor rate 10', state.sigmaInit === 60 && state.marginRate === 10);
  check('standard inputs start at sigma 60 and corridor rate 10', els['input-sigma-init'].value === 60 && els['input-margin-rate'].value === 10);
  check('reset → default breakpoints', state.breakpoints.length === 4 && state.breakpoints[1].achievement === 40 && state.breakpoints[1].payout === 0);
  updateDashboard();
  check('standard ΔPEX keeps the original sign for an overrun', els['kpi-pex-diff'].innerText.indexOf('+') > -1);
  check('standard ΔPEX amount keeps positive sign for an overrun', els['kpi-pex-savings'].innerText.indexOf('+') === 0
    && els['kpi-pex-savings-label'].innerText === 'Additional PEX cost vs current');
};
