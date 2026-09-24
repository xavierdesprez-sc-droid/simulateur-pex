'use strict';
module.exports = function suite(__h) {
  const { check, assertClose, htmlSrc, defaultHtmlSrc, buildSalesRepString } = __h;
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
    Object.values(salesRepState.achievements).every(value => value === 100) &&
    Object.values(salesRepState.qualifiers).every(value => value === 100));
};
