'use strict';

const SALES_REP_KPIS = [
  { key: 'c2pTotal', label: 'C2P Total', weight: 0.5 },
  { key: 'c2pPrice', label: 'C2P Price', weight: 0.2 },
  { key: 'dev', label: 'Dev', weight: 0.2 },
  { key: 'churn', label: 'Churn', weight: 0.1 }
];

const salesRepState = {
  fixedSalary: 40000,
  oldNominalMode: 'fixed',
  oldNominalFixedE: 6000,
  oldNominalPercent: 15,
  minNominalE: 8000,
  achievements: {
    c2pTotal: 100,
    c2pPrice: 100,
    dev: 100,
    churn: 100
  },
  qualifiers: {
    portfolio: 100,
    visits: 100
  }
};

function salesRepNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function salesRepOldNominalE(inputs = salesRepState) {
  const fixedSalary = salesRepNonNegative(inputs.fixedSalary, salesRepState.fixedSalary);
  if (inputs.oldNominalMode === 'percent') {
    const percent = salesRepNonNegative(inputs.oldNominalPercent, salesRepState.oldNominalPercent);
    return fixedSalary * percent / 100;
  }
  return salesRepNonNegative(inputs.oldNominalFixedE, salesRepState.oldNominalFixedE);
}

function salesRepBuildCurveContext(inputs = salesRepState) {
  const fixedSalary = salesRepNonNegative(inputs.fixedSalary, salesRepState.fixedSalary);
  const minNominalE = salesRepNonNegative(inputs.minNominalE, salesRepState.minNominalE);
  return Engine.hybridContext(
    salesRepOldNominalE(inputs),
    fixedSalary,
    20,
    minNominalE,
    0,
    0,
    80,
    100,
    200
  );
}

function calculateSalesRepPayout(inputs = salesRepState) {
  const context = salesRepBuildCurveContext(inputs);
  const achievements = inputs.achievements || {};
  const kpiPayouts = SALES_REP_KPIS.map(kpi => {
    const achievement = salesRepNonNegative(achievements[kpi.key], 0);
    const curvePayout = Engine.hybridE(achievement, context);
    return {
      key: kpi.key,
      achievement,
      weight: kpi.weight,
      curvePayout,
      weightedPayout: curvePayout * kpi.weight
    };
  });
  const performanceSubtotal = kpiPayouts.reduce((sum, payout) => sum + payout.weightedPayout, 0);
  const qualifiers = inputs.qualifiers || {};
  const portfolio = Math.min(salesRepNonNegative(qualifiers.portfolio, 0), 100) / 100;
  const visits = Math.min(salesRepNonNegative(qualifiers.visits, 0), 100) / 100;
  const qualifierMultiplier = (portfolio + visits) / 2;
  return {
    context,
    kpiPayouts,
    performanceSubtotal,
    qualifierMultiplier,
    finalPayout: performanceSubtotal * qualifierMultiplier
  };
}

window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('sales-rep-app');
  if (!app) return;
});
