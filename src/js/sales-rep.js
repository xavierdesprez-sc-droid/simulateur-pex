'use strict';

const SALES_REP_KPIS = [
  { key: 'c2pTotal', label: 'C2P Total', weight: 0.5 },
  { key: 'c2pPrice', label: 'C2P Price', weight: 0.2 },
  { key: 'dev', label: 'Dev', weight: 0.2 },
  { key: 'churn', label: 'Churn', weight: 0.1 }
];
const SALES_REP_PERFORMANCE_THRESHOLD = 40;

const SALES_REP_PERIODS = ['q1', 'q2', 'q3', 'fy'];

function salesRepDefaultPeriod() {
  return {
    entered: false,
    achievements: { c2pTotal: 100, c2pPrice: 100, dev: 100, churn: 100 },
    qualifiers: { portfolio: 100, visits: 100 }
  };
}

const salesRepState = {
  fixedSalary: 40000,
  oldNominalMode: 'fixed',
  oldNominalFixedE: 6000,
  oldNominalPercent: 15,
  minNominalE: 8000,
  periods: {
    q1: salesRepDefaultPeriod(),
    q2: salesRepDefaultPeriod(),
    q3: salesRepDefaultPeriod(),
    fy: salesRepDefaultPeriod()
  }
};

function salesRepNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

const SALES_REP_STORAGE_KEY = 'sales-rep-quarterly-v1';

function salesRepSerialize(state = salesRepState) {
  const periods = {};
  SALES_REP_PERIODS.forEach(key => {
    const period = (state.periods && state.periods[key]) || salesRepDefaultPeriod();
    periods[key] = {
      entered: period.entered,
      achievements: { ...period.achievements },
      qualifiers: { ...period.qualifiers }
    };
  });
  return JSON.stringify({
    version: 1,
    fixedSalary: state.fixedSalary,
    oldNominalMode: state.oldNominalMode,
    oldNominalFixedE: state.oldNominalFixedE,
    oldNominalPercent: state.oldNominalPercent,
    minNominalE: state.minNominalE,
    periods
  });
}

function salesRepSanitizePeriod(raw) {
  const period = salesRepDefaultPeriod();
  if (!raw || typeof raw !== 'object') return period;
  period.entered = raw.entered === true;
  const achievements = raw.achievements || {};
  SALES_REP_KPIS.forEach(kpi => {
    period.achievements[kpi.key] = Math.min(
      salesRepNonNegative(achievements[kpi.key], period.achievements[kpi.key]), 200);
  });
  const qualifiers = raw.qualifiers || {};
  Object.keys(period.qualifiers).forEach(key => {
    period.qualifiers[key] = Math.min(
      salesRepNonNegative(qualifiers[key], period.qualifiers[key]), 100);
  });
  return period;
}

function salesRepDeserialize(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return null;
  }
  if (!data || typeof data !== 'object' || data.version !== 1 ||
      !data.periods || typeof data.periods !== 'object') return null;
  const state = {
    fixedSalary: salesRepNonNegative(data.fixedSalary, 40000),
    oldNominalMode: data.oldNominalMode === 'percent' ? 'percent' : 'fixed',
    oldNominalFixedE: salesRepNonNegative(data.oldNominalFixedE, 6000),
    oldNominalPercent: salesRepNonNegative(data.oldNominalPercent, 15),
    minNominalE: salesRepNonNegative(data.minNominalE, 8000),
    periods: {}
  };
  SALES_REP_PERIODS.forEach(key => {
    state.periods[key] = salesRepSanitizePeriod(data.periods[key]);
  });
  return state;
}

function salesRepSaveState(storage, state = salesRepState) {
  try {
    storage.setItem(SALES_REP_STORAGE_KEY, salesRepSerialize(state));
    return true;
  } catch (error) {
    return false;
  }
}

function salesRepLoadState(storage) {
  try {
    return salesRepDeserialize(storage.getItem(SALES_REP_STORAGE_KEY));
  } catch (error) {
    return null;
  }
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
    SALES_REP_PERFORMANCE_THRESHOLD,
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

function salesRepAnnualPayout(period, shared = salesRepState) {
  return calculateSalesRepPayout({
    ...shared,
    achievements: period.achievements,
    qualifiers: period.qualifiers
  }).finalPayout;
}

function salesRepQuarterPayment(period, shared = salesRepState) {
  return period.entered ? salesRepAnnualPayout(period, shared) / 4 : 0;
}

function salesRepPaidBeforeQ4(state = salesRepState) {
  return ['q1', 'q2', 'q3'].reduce(
    (sum, key) => sum + salesRepQuarterPayment(state.periods[key], state), 0);
}

function salesRepQ4Payment(state = salesRepState) {
  if (!state.periods.fy.entered) return 0;
  return Math.max(0, salesRepAnnualPayout(state.periods.fy, state) - salesRepPaidBeforeQ4(state));
}

const SALES_REP_CHARTS = {};
const salesRepInvalidInputIds = new Set();

function salesRepFormatE(value) {
  return '€' + Math.round(value).toLocaleString('en-US');
}

function salesRepShowMessage(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = message;
  el.style.display = 'block';
  if (el.classList && el.classList.remove) el.classList.remove('hidden');
}

function salesRepHideMessage(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = '';
  el.style.display = 'none';
  if (el.classList && el.classList.add) el.classList.add('hidden');
}

function salesRepSetInvalid(el, invalid) {
  if (!el || !el.classList) return;
  if (invalid && el.classList.add) el.classList.add('border-red-500');
  if (!invalid && el.classList.remove) el.classList.remove('border-red-500');
}

function salesRepUpdateValidationMessage() {
  if (salesRepInvalidInputIds.size) {
    salesRepShowMessage('sr-validation-message', 'Please enter a finite, non-negative number.');
  } else {
    salesRepHideMessage('sr-validation-message');
  }
}

function salesRepReadNumber(el) {
  if (!el || String(el.value).trim() === '') return null;
  const value = Number(el.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function salesRepSetOutput(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function salesRepRefreshCharts(result) {
  const chartStatus = document.getElementById('sr-chart-status');
  if (typeof Chart !== 'function') {
    salesRepShowMessage('sr-chart-status', 'Charts are unavailable, but payout amounts remain available.');
    return;
  }
  salesRepHideMessage('sr-chart-status');
  const labels = Array.from({ length: 201 }, (_, index) => index);
  SALES_REP_KPIS.forEach(kpi => {
    const achievement = result.kpiPayouts.find(item => item.key === kpi.key).achievement;
    const curve = labels.map(x => Engine.hybridE(x, result.context) * kpi.weight);
    const point = labels.map(x => x === achievement ? Engine.hybridE(x, result.context) * kpi.weight : null);
    const canvas = document.getElementById('sr-chart-' + kpi.key.replace(/([A-Z])/g, '-$1').toLowerCase());
    if (!canvas) return;
    if (!SALES_REP_CHARTS[kpi.key]) {
      try {
        SALES_REP_CHARTS[kpi.key] = new Chart(canvas.getContext('2d'), {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: kpi.label + ' weighted payout',
                data: curve,
                borderColor: '#4f46e5',
                borderWidth: 2,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false
              },
              {
                label: 'Current achievement',
                data: point,
                borderColor: '#dc2626',
                backgroundColor: '#dc2626',
                pointRadius: 3.5,
                pointHoverRadius: 5,
                pointBorderWidth: 2,
                pointBorderColor: '#ffffff',
                showLine: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: { legend: { display: false }, tooltip: { displayColors: false } },
            scales: {
              x: {
                min: 0,
                max: 200,
                title: { display: true, text: 'Achievement (%)', color: '#64748b', font: { size: 12 } },
                grid: { display: false },
                border: { display: false },
                ticks: { color: '#94a3b8', stepSize: 50, font: { size: 12 }, padding: 6 }
              },
              y: {
                title: { display: true, text: 'Payout (€)', color: '#64748b', font: { size: 12 } },
                beginAtZero: true,
                grid: { color: 'rgba(148, 163, 184, 0.16)', drawTicks: false },
                border: { display: false },
                ticks: { color: '#94a3b8', maxTicksLimit: 4, padding: 8, font: { size: 12 } }
              }
            }
          }
        });
      } catch (error) {
        salesRepShowMessage('sr-chart-status', 'Charts could not be initialized: ' + error.message);
      }
      return;
    }
    const chart = SALES_REP_CHARTS[kpi.key];
    chart.data.labels = labels;
    chart.data.datasets[0].data = curve;
    chart.data.datasets[1].data = point;
    if (chart.update) chart.update();
  });
  if (chartStatus && !Object.keys(SALES_REP_CHARTS).length) {
    salesRepShowMessage('sr-chart-status', 'Charts could not be initialized.');
  }
}

function updateSalesRepCalculator() {
  const result = calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 });
  result.kpiPayouts.forEach(item => {
    const key = item.key.replace(/([A-Z])/g, '-$1').toLowerCase();
    salesRepSetOutput('sr-payout-' + key, salesRepFormatE(item.weightedPayout));
    salesRepSetOutput('sr-summary-' + key, salesRepFormatE(item.weightedPayout));
    salesRepSetOutput('sr-achievement-' + key + '-value', item.achievement.toFixed(0) + '%');
  });
  salesRepSetOutput('sr-performance-subtotal', salesRepFormatE(result.performanceSubtotal));
  salesRepSetOutput('sr-qualifier-multiplier', (result.qualifierMultiplier * 100).toFixed(0) + '%');
  salesRepSetOutput('sr-final-payout', salesRepFormatE(result.finalPayout));
  salesRepSetOutput(
    'sr-final-payout-percent',
    result.context.newNomE === 0
      ? '—'
      : ((result.finalPayout / result.context.newNomE) * 100).toFixed(1) + '%'
  );
  salesRepSetOutput('sr-qualifier-portfolio-value', Math.min(salesRepState.periods.q1.qualifiers.portfolio, 100).toFixed(0) + '%');
  salesRepSetOutput('sr-qualifier-visits-value', Math.min(salesRepState.periods.q1.qualifiers.visits, 100).toFixed(0) + '%');
  salesRepRefreshCharts(result);
  return result;
}

function salesRepBindNumber(id, stateKey) {
  const el = document.getElementById(id);
  const update = event => {
    const value = salesRepReadNumber(event.target);
    if (value === null) {
      salesRepSetInvalid(event.target, true);
      salesRepInvalidInputIds.add(id);
      salesRepUpdateValidationMessage();
      return;
    }
    salesRepSetInvalid(event.target, false);
    salesRepInvalidInputIds.delete(id);
    salesRepUpdateValidationMessage();
    salesRepState[stateKey] = value;
    updateSalesRepCalculator();
  };
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

function salesRepBindSlider(id, target, key, max) {
  const el = document.getElementById(id);
  const update = event => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    const bounded = Math.max(0, Math.min(max, value));
    salesRepState.periods.q1[target][key] = bounded;
    event.target.value = String(bounded);
    updateSalesRepCalculator();
  };
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

function initializeSalesRepCalculator() {
  const app = document.getElementById('sales-rep-app');
  if (!app) return;
  const defaults = {
    'sr-fixed-salary': salesRepState.fixedSalary,
    'sr-old-nominal-mode': salesRepState.oldNominalMode,
    'sr-old-nominal-fixed': salesRepState.oldNominalFixedE,
    'sr-old-nominal-percent': salesRepState.oldNominalPercent,
    'sr-min-nominal': salesRepState.minNominalE,
    'sr-achievement-c2p-total': salesRepState.periods.q1.achievements.c2pTotal,
    'sr-achievement-c2p-price': salesRepState.periods.q1.achievements.c2pPrice,
    'sr-achievement-dev': salesRepState.periods.q1.achievements.dev,
    'sr-achievement-churn': salesRepState.periods.q1.achievements.churn,
    'sr-qualifier-portfolio': salesRepState.periods.q1.qualifiers.portfolio,
    'sr-qualifier-visits': salesRepState.periods.q1.qualifiers.visits
  };
  Object.keys(defaults).forEach(id => { document.getElementById(id).value = String(defaults[id]); });
  salesRepBindNumber('sr-fixed-salary', 'fixedSalary');
  salesRepBindNumber('sr-old-nominal-fixed', 'oldNominalFixedE');
  salesRepBindNumber('sr-old-nominal-percent', 'oldNominalPercent');
  salesRepBindNumber('sr-min-nominal', 'minNominalE');
  const mode = document.getElementById('sr-old-nominal-mode');
  mode.addEventListener('change', event => {
    salesRepState.oldNominalMode = event.target.value === 'percent' ? 'percent' : 'fixed';
    updateSalesRepCalculator();
  });
  salesRepBindSlider('sr-achievement-c2p-total', 'achievements', 'c2pTotal', 200);
  salesRepBindSlider('sr-achievement-c2p-price', 'achievements', 'c2pPrice', 200);
  salesRepBindSlider('sr-achievement-dev', 'achievements', 'dev', 200);
  salesRepBindSlider('sr-achievement-churn', 'achievements', 'churn', 200);
  salesRepBindSlider('sr-qualifier-portfolio', 'qualifiers', 'portfolio', 100);
  salesRepBindSlider('sr-qualifier-visits', 'qualifiers', 'visits', 100);
  updateSalesRepCalculator();
}

window.addEventListener('DOMContentLoaded', initializeSalesRepCalculator);
