'use strict';
/** Cluster profiles: common UI fields, NCE mapping, and dynamic population metrics. */
module.exports = function suite(__h) {
  const { check, els, htmlSrc } = __h;

  configurePopulationProfile('NCE');
  appInitialized = true;
  applyProfileUi();
  syncInputsFromState();
  check('NCE leaves population-dependent inputs blank by default',
    els['input-current-pex'].value === '' &&
    els['input-old-var-share'].value === '' &&
    els['input-base-ca'].value === '' &&
    els['input-headcount'].value === '' &&
    els['input-current-pex'].placeholder === '-' &&
    els['input-old-var-share'].placeholder === '-' &&
    els['input-base-ca'].placeholder === '-' &&
    els['input-headcount'].placeholder === '-');
  updateDashboard(true);
  document.getElementById('val-new-target-pex');
  check('NCE leaves population-dependent dashboard metrics blank by default',
    els['kpi-pex-new'].innerText === '—' &&
    els['kpi-pex-payout-rate'].innerText === '—' &&
    els['kpi-pex-old'].innerText === '—' &&
    els['kpi-pex-diff'].innerText === '—' &&
    els['val-new-target-pex'].innerText === '—');
  check('NCE hides the 4:1 view',
    els['tab-four-to-one'].className.indexOf('hidden') > -1 &&
    els['view-four-to-one'].className.indexOf('hidden') > -1);
  const nceBundleHtml = __h.buildString('NCE').split('<!-- Application Logic JS -->')[0];
  check('NCE bundle removes all 4:1 UI',
    nceBundleHtml.indexOf('tab-four-to-one') === -1 &&
    nceBundleHtml.indexOf('view-four-to-one') === -1 &&
    nceBundleHtml.indexOf('4:1') === -1);
  check('NCE Hybrid top strip keeps its cards on one row',
    /lg:grid-cols-3\b/.test(__h.buildString('NCE')));
  check('NCE uses its configured default curve',
    state.breakpoints.map(p => [p.achievement, p.payout]).join('|') === '0,0|20,10|80,50|100,100|180,200');
  const nce = parsePopulationCsv([
    'Job Profile,Country,ID,Annual Base Pay 2026 Revised,Nominal Bonus 2026 Revised',
    'Account Executive,France,IGNORED-1,50000,6000',
    'Manager,,IGNORED-2,60000,7000',
    'Senior AE,Germany,IGNORED-3,0,4000'
  ].join('\n'));

  check('NCE mapping ignores ID and keeps canonical fields',
    nce.reps.length === 1 &&
    nce.reps[0].jobProfile === 'Account Executive' &&
    nce.reps[0].country === 'France' &&
    nce.reps[0].fixed === 50000 &&
    nce.reps[0].nominal === 6000 &&
    !Object.prototype.hasOwnProperty.call(nce.reps[0], 'id'));
  check('NCE reports excluded rows', nce.ignored === 2);

  advPopulation = nce.reps;
  popFilters = { country: '', jobProfile: '' };
  refreshPopulation();
  check('dynamic current PEX is the sum of nominal bonuses', realAgg.currentPaid === 6000);
  check('dynamic current variable share is weighted', realAgg.currentVarShare === 12);
  check('dynamic headcount uses valid rows', realAgg.count === 1);
  check('top banner current PEX matches the dynamic metric',
    els['hyb-top-pex-old'].innerText === '0.01 M€');
  advPopulation = [{ jobProfile: 'Account Executive', country: 'France', fixed: 10000000, nominal: 2500000 }];
  refreshPopulation();
  check('top banner uses paid nominal instead of expected old curve',
    els['hyb-top-pex-old'].innerText === '2.50 M€');
  check('standard Current PEX card matches the dynamic metric',
    (document.getElementById('kpi-pex-old'), els['kpi-pex-old'].innerText === '2.50 M€'));
  const expectedPayoutRate = realAgg.targetNew > 0 ? realAgg.stdNew / realAgg.targetNew : 0;
  const expectedNewPex = realAgg.currentPaid * (state.newVarShare / realAgg.currentVarShare) / 1e6 * expectedPayoutRate;
  document.getElementById('kpi-pex-new');
  check('standard New Variable PEX is recalculated from the loaded population',
    els['kpi-pex-new'].innerText === expectedNewPex.toFixed(2) + ' M€');
  document.getElementById('kpi-pex-savings');
  const expectedDelta = expectedNewPex - 2.5;
  check('standard delta is based on the same current PEX',
    els['kpi-pex-savings'].innerText === (expectedDelta >= 0 ? '+' : '') + expectedDelta.toFixed(2) + ' M€');

  check('common filters expose Country and Job Profile only',
    htmlSrc.indexOf('id="pop-filter-country"') > -1 &&
    htmlSrc.indexOf('id="pop-filter-jobProfile"') > -1 &&
    htmlSrc.indexOf('filter-orga') === -1 &&
    htmlSrc.indexOf('filter-position') === -1);

  popFilters.country = 'Unknown';
  refreshPopulation();
  check('empty filter result displays dash metrics', els['pop-risk-max'].innerText === '—' && els['pop-risk-avg'].innerText === '—');

  configurePopulationProfile('SWE');
};
