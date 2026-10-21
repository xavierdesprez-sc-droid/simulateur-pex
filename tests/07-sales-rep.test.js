'use strict';
module.exports = function suite(__h) {
  const { check, els, assertClose, htmlSrc, defaultHtmlSrc, buildSalesRepString } = __h;
  const h = __h;
  const salesRepHtml = buildSalesRepString();

  check('Sales Rep bundle has its own title',
    /<title>Sales Rep Variable Compensation Calculator<\/title>/.test(salesRepHtml));
  check('Sales Rep bundle has its own body and hybrid engine',
    /id="sales-rep-app"/.test(salesRepHtml) &&
    /hybridContext\(oldNomE, fixedE, targetSharePct/.test(salesRepHtml));
  check('Sales Rep bundle excludes population parsing, server calls, and persistence',
    !/parsePopulationCsv|google\.script\.run|localStorage|sessionStorage/.test(salesRepHtml));
  check('Sales Rep bundle excludes existing simulator views',
    !/id="view-(standard|advanced|matrix)"/.test(salesRepHtml));
  check('Sales Rep harness exposes matching generated HTML',
    htmlSrc === salesRepHtml);
  check('Sales Rep bundle is distinct from the default bundle',
    salesRepHtml !== defaultHtmlSrc);

  const rep = {
    fixedSalary: 40000,
    oldNominalMode: 'fixed',
    oldNominalFixedE: 6000,
    oldNominalPercent: 15,
    minNominalE: 8000,
    achievements: { c2pTotal: 100, c2pPrice: 100, dev: 100, churn: 100 },
    qualifiers: { portfolio: 100, visits: 100 }
  };
  const result = calculateSalesRepPayout(rep);

  assertClose('new nominal uses the €8,000 floor', result.context.newNomE, 8000);
  assertClose('200% nominal is twice the new nominal', result.context.val200E, 16000);
  assertClose('70% remains on the old curve below T1', Engine.hybridE(70, result.context), 4200);
  assertClose('80% uses the old nominal curve', Engine.hybridE(80, result.context), 4800);
  assertClose('90% interpolates halfway through the transition', Engine.hybridE(90, result.context), 6400);
  assertClose('100% reaches the new nominal', Engine.hybridE(100, result.context), 8000);
  assertClose('110% follows the new curve above T2', Engine.hybridE(110, result.context), 8800);
  assertClose('200% reaches twice the new nominal', Engine.hybridE(200, result.context), 16000);
  const belowThreshold = calculateSalesRepPayout({
    ...rep,
    achievements: { c2pTotal: 39, c2pPrice: 39, dev: 39, churn: 39 }
  });
  check('all performance KPI payouts are zero below 40% achievement',
    belowThreshold.kpiPayouts.every(item => item.curvePayout === 0 && item.weightedPayout === 0));
  const atThreshold = calculateSalesRepPayout({
    ...rep,
    achievements: { c2pTotal: 40, c2pPrice: 40, dev: 40, churn: 40 }
  });
  check('all performance KPI curves resume at 40% achievement',
    atThreshold.kpiPayouts.every(item => item.curvePayout === Engine.hybridE(40, atThreshold.context)));
  assertClose('weighted KPI results sum to €8,000 at 100%', result.performanceSubtotal, 8000);
  assertClose('all qualifiers at 100% preserve the subtotal', result.finalPayout, 8000);

  const salaryFloor = calculateSalesRepPayout({ ...rep, fixedSalary: 50000 });
  assertClose('20% salary floor dominates at €50,000 salary', salaryFloor.context.newNomE, 10000);
  const grandfathered = calculateSalesRepPayout({
    ...rep, oldNominalFixedE: 12000
  });
  assertClose('old nominal above the floors is retained', grandfathered.context.newNomE, 12000);

  check('default performance allocations are exactly [0.5, 0.2, 0.2, 0.1]',
    SALES_REP_KPIS.map(kpi => kpi.weight).join(',') === '0.5,0.2,0.2,0.1');
  check('a KPI weighted result is its hybrid curve result times its weight',
    result.kpiPayouts.every(item => item.weightedPayout === item.curvePayout * item.weight));
  assertClose('four weighted KPI results sum to the performance subtotal',
    result.kpiPayouts.reduce((sum, item) => sum + item.weightedPayout, 0),
    result.performanceSubtotal);
  assertClose('percent mode at 15% of €40,000 yields a €6,000 old nominal',
    salesRepOldNominalE({ ...rep, oldNominalMode: 'percent' }), 6000);
  const cappedQualifiers = calculateSalesRepPayout({
    ...rep,
    qualifiers: { portfolio: 120, visits: 40 }
  });
  assertClose('qualifiers are capped individually before averaging',
    cappedQualifiers.qualifierMultiplier, 0.7);
  assertClose('the capped qualifier multiplier reduces final payout',
    cappedQualifiers.finalPayout, 5600);

  check('Sales Rep state uses approved defaults',
    salesRepState.fixedSalary === 40000 &&
    salesRepState.oldNominalMode === 'fixed' &&
    salesRepState.oldNominalFixedE === 6000 &&
    salesRepState.oldNominalPercent === 15 &&
    salesRepState.minNominalE === 8000 &&
    SALES_REP_PERIODS.join(',') === 'q1,q2,q3,fy' &&
    SALES_REP_PERIODS.every(key => {
      const p = salesRepState.periods[key];
      return p.entered === false &&
        Object.values(p.achievements).every(value => value === 100) &&
        Object.values(p.qualifiers).every(value => value === 100);
    }));

  const mkPeriod = (entered, ach, qual) => ({
    entered,
    achievements: { c2pTotal: ach, c2pPrice: ach, dev: ach, churn: ach },
    qualifiers: { portfolio: qual, visits: qual }
  });
  const mkState = (q1, q2, q3, fy) => ({ ...rep, periods: { q1, q2, q3, fy } });
  const off = mkPeriod(false, 100, 100);
  assertClose('full-year period at 100% pays €8,000 annually',
    salesRepAnnualPayout(mkPeriod(true, 100, 100), rep), 8000);
  assertClose('entered Q1 at 100% pays €2,000', salesRepQuarterPayment(mkPeriod(true, 100, 100), rep), 2000);
  assertClose('unentered quarter pays 0', salesRepQuarterPayment(off, rep), 0);
  assertClose('Q4 after Q1-Q3 at 100% pays €2,000',
    salesRepQ4Payment(mkState(mkPeriod(true, 100, 100), mkPeriod(true, 100, 100), mkPeriod(true, 100, 100), mkPeriod(true, 100, 100))), 2000);
  assertClose('untouched Q3 adds 0 so Q4 pays €4,000',
    salesRepQ4Payment(mkState(mkPeriod(true, 100, 100), mkPeriod(true, 100, 100), off, mkPeriod(true, 100, 100))), 4000);
  assertClose('paid before Q4 counts only entered quarters',
    salesRepPaidBeforeQ4(mkState(mkPeriod(true, 100, 100), mkPeriod(true, 100, 100), off, off)), 4000);
  assertClose('Q1 at 200% pays €4,000 per quarter', salesRepQuarterPayment(mkPeriod(true, 200, 100), rep), 4000);
  assertClose('Q4 subtracts a €4,000 Q1 from €8,000 FY',
    salesRepQ4Payment(mkState(mkPeriod(true, 200, 100), off, off, mkPeriod(true, 100, 100))), 4000);
  assertClose('Q4 floors at 0 when FY annual is below paid',
    salesRepQ4Payment(mkState(mkPeriod(true, 200, 100), off, off, mkPeriod(true, 100, 0))), 0);
  assertClose('Q4 pays 0 when FY is untouched',
    salesRepQ4Payment(mkState(mkPeriod(true, 100, 100), off, off, off)), 0);

  const uiReady = typeof __domReadyHandler === 'function';
  check('Sales Rep app registers DOM initialization', uiReady);

  if (uiReady) {
    __domReadyHandler();
    check('four KPI charts initialize independently', __chartInstances.length === 4);
    check('Sales Rep payout curves use a fine, smoothed line without point clutter',
      __chartInstances.every(chart => {
        const curve = chart.data.datasets[0];
        return curve.borderWidth === 2 && curve.tension === 0.2 &&
          curve.pointRadius === 0 && curve.pointHoverRadius === 4 && curve.fill === false;
      }));
    check('current achievement markers stay distinct but subtle',
      __chartInstances.every(chart => {
        const marker = chart.data.datasets[1];
        return marker.pointRadius === 3.5 && marker.pointBorderWidth === 2 &&
          marker.pointBorderColor === '#ffffff';
      }));
    check('Sales Rep charts use restrained axes and gridlines',
      __chartInstances.every(chart => {
        const { x, y } = chart.options.scales;
        return x.grid?.display === false && x.ticks?.stepSize === 50 &&
          y.grid?.color === 'rgba(148, 163, 184, 0.16)' && y.border?.display === false &&
          y.beginAtZero === true;
      }));
    check('achievement axes use regular 50% ticks and larger labels',
      __chartInstances.every(chart => {
        const { x, y } = chart.options.scales;
        return x.min === 0 && x.max === 200 && x.ticks.stepSize === 50 &&
          x.ticks.font.size === 12 && y.ticks.font.size === 12 &&
          x.title.font.size === 12 && y.title.font.size === 12;
      }));
    check('responsive KPI charts stay inside fixed-height containers',
      ['c2p-total', 'c2p-price', 'dev', 'churn'].every(id =>
        new RegExp(`<div class="mt-3 relative h-48">\\s*<canvas id="sr-chart-${id}" class="w-full h-full"><\\/canvas>\\s*<\\/div>`).test(salesRepHtml)));
    check('salary and nominal controls use approved defaults',
      els['sr-fixed-salary'].value === '40000' &&
      els['sr-old-nominal-mode'].value === 'fixed' &&
      els['sr-old-nominal-fixed'].value === '6000' &&
      els['sr-old-nominal-percent'].value === '15' &&
      els['sr-min-nominal'].value === '8000');
    check('four KPI sliders default to 100%',
      ['c2p-total', 'c2p-price', 'dev', 'churn'].every(key =>
        els[`sr-achievement-${key}`].value === '100'));
    check('two qualifier sliders default to 100%',
      els['sr-qualifier-portfolio'].value === '100' &&
      els['sr-qualifier-visits'].value === '100');
    check('KPI and qualifier slider bounds are present in markup',
      ['c2p-total', 'c2p-price', 'dev', 'churn'].every(key =>
        new RegExp(`type="range" id="sr-achievement-${key}" min="0" max="200"`).test(h.htmlSrc)) &&
      ['portfolio', 'visits'].every(key =>
        new RegExp(`type="range" id="sr-qualifier-${key}" min="0" max="100"`).test(h.htmlSrc)));
    assertClose('C2P Total chart plots its weighted €4,000 at 100%',
      __chartInstances[0].data.datasets[0].data[100], 4000);
    check('all KPI charts plot zero payout below the 40% threshold',
      __chartInstances.every(chart => chart.data.datasets[0].data.slice(0, 40).every(value => value === 0)));

    h.input('sr-fixed-salary', '50000');
    h.input('sr-old-nominal-percent', '15');
    h.change('sr-old-nominal-mode', 'percent');
    assertClose('percentage mode derives old nominal from salary', salesRepOldNominalE(), 7500);
    h.change('sr-old-nominal-mode', 'fixed');
    h.input('sr-fixed-salary', '40000');

    const initialFinalPayout = els['sr-final-payout'].innerText;
    const initialC2PTotal = els['sr-payout-c2p-total'].innerText;
    h.input('sr-achievement-c2p-total', '200');
    check('changing one KPI updates its weighted line item and total',
      els['sr-payout-c2p-total'].innerText !== initialC2PTotal &&
      els['sr-final-payout'].innerText !== initialFinalPayout);
    check('other KPI sliders remain independent',
      els['sr-achievement-c2p-price'].value === '100');

    h.input('sr-qualifier-portfolio', '120');
    check('qualifier input and state clamp values above 100%',
      els['sr-qualifier-portfolio'].value === '100' &&
      salesRepState.periods.q1.qualifiers.portfolio === 100);
    h.input('sr-qualifier-visits', '80');
    assertClose('qualifiers are individually capped before averaging',
      calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 }).qualifierMultiplier, 0.9);
    const finalBeforeInvalid = calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 }).finalPayout;
    h.input('sr-fixed-salary', '');
    assertClose('empty salary preserves the last valid calculation',
      calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 }).finalPayout, finalBeforeInvalid);
    h.input('sr-fixed-salary', '-1');
    assertClose('negative salary preserves the last valid calculation',
      calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 }).finalPayout, finalBeforeInvalid);
    h.input('sr-min-nominal', '-1');
    h.change('sr-old-nominal-mode', 'percent');
    check('changing nominal mode keeps validation visible while numeric inputs remain invalid',
      els['sr-validation-message'].innerText.length > 0);
    h.input('sr-fixed-salary', '40000');
    check('correcting salary keeps validation visible for invalid minimum nominal',
      els['sr-validation-message'].innerText.length > 0);
    h.input('sr-min-nominal', '8000');
    check('validation clears after every invalid numeric input is corrected',
      els['sr-validation-message'].innerText.length === 0);

    h.change('sr-old-nominal-mode', 'fixed');
    h.input('sr-fixed-salary', '40000');
    h.input('sr-old-nominal-fixed', '6000');
    h.input('sr-min-nominal', '8000');
    h.input('sr-achievement-c2p-total', '100');
    h.input('sr-qualifier-portfolio', '100');
    h.input('sr-qualifier-visits', '100');
    const finalPayoutPercent = () =>
      els['sr-final-payout-percent'] ? els['sr-final-payout-percent'].innerText : '';
    check('final payout percentage is labeled as a percentage of new nominal',
      /id="sr-final-payout-percent"/.test(salesRepHtml) &&
      /Percentage of new nominal/.test(salesRepHtml));
    check('full final payout displays as 100.0% of the new nominal',
      finalPayoutPercent() === '100.0%');
    h.input('sr-qualifier-visits', '50');
    check('changing a qualifier updates the final payout percentage',
      finalPayoutPercent() === '75.0%');
    h.input('sr-qualifier-visits', '100');
    h.input('sr-achievement-c2p-total', '200');
    check('changing a KPI input updates the final payout percentage',
      finalPayoutPercent() === '150.0%');

    h.input('sr-fixed-salary', '0');
    h.input('sr-old-nominal-fixed', '0');
    h.input('sr-min-nominal', '0');
    check('zero new nominal displays an em dash instead of dividing by zero',
      calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 }).context.newNomE === 0 &&
      finalPayoutPercent() === '—');
  }
};
