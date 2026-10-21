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

let salesRepActivePeriod = 'q1';

const SALES_REP_PERIOD_LABELS = {
  q1: 'Q1 results',
  q2: 'Q2 results',
  q3: 'Q3 results',
  fy: 'Full-year results (Q4 catch-up)'
};

function salesRepActive() {
  return salesRepState.periods[salesRepActivePeriod];
}

function salesRepStorageOrNull() {
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function salesRepPersist() {
  const storage = salesRepStorageOrNull();
  if (storage !== null && salesRepSaveState(storage, salesRepState)) {
    salesRepHideMessage('sr-storage-status');
  } else {
    salesRepShowMessage('sr-storage-status', 'Changes are not saved in this browser.');
  }
}

function salesRepMarkEntered() {
  salesRepActive().entered = true;
}

function updateSalesRepRecap() {
  const quarterKeys = ['q1', 'q2', 'q3'];
  quarterKeys.forEach(key => {
    const period = salesRepState.periods[key];
    salesRepSetOutput('sr-recap-' + key + '-status', period.entered ? 'Entered' : 'Not entered');
    salesRepSetOutput('sr-recap-' + key + '-payment',
      period.entered ? salesRepFormatE(salesRepQuarterPayment(period)) : '—');
  });
  const fy = salesRepState.periods.fy;
  const paid = salesRepPaidBeforeQ4();
  const q4 = salesRepQ4Payment();
  salesRepSetOutput('sr-recap-q4-status', fy.entered ? 'Entered' : 'Not entered');
  salesRepSetOutput('sr-recap-q4-payment', fy.entered ? salesRepFormatE(q4) : '—');
  salesRepSetOutput('sr-recap-total', salesRepFormatE(paid + q4));
  salesRepSetOutput('sr-q4-annual-payout',
    fy.entered ? salesRepFormatE(salesRepAnnualPayout(fy)) : '—');
  salesRepSetOutput('sr-q4-already-paid', salesRepFormatE(paid));
  salesRepSetOutput('sr-q4-payment', fy.entered ? salesRepFormatE(q4) : '—');
  salesRepSetOutput('sr-year-total', salesRepFormatE(paid + q4));
}

function updateSalesRepCalculator() {
  const period = salesRepActive();
  const isFullYear = salesRepActivePeriod === 'fy';
  const divisor = isFullYear ? 1 : 4;
  const result = calculateSalesRepPayout({ ...salesRepState, ...period });
  const money = value => period.entered ? salesRepFormatE(value / divisor) : '—';
  result.kpiPayouts.forEach(item => {
    const key = item.key.replace(/([A-Z])/g, '-$1').toLowerCase();
    salesRepSetOutput('sr-payout-' + key, money(item.weightedPayout));
    salesRepSetOutput('sr-summary-' + key, money(item.weightedPayout));
    salesRepSetOutput('sr-achievement-' + key + '-value', item.achievement.toFixed(0) + '%');
  });
  salesRepSetOutput('sr-performance-subtotal', money(result.performanceSubtotal));
  salesRepSetOutput('sr-qualifier-multiplier', (result.qualifierMultiplier * 100).toFixed(0) + '%');
  const payment = isFullYear ? salesRepQ4Payment() : result.finalPayout / divisor;
  salesRepSetOutput('sr-final-payout', period.entered ? salesRepFormatE(payment) : '—');
  salesRepSetOutput(
    'sr-final-payout-percent',
    result.context.newNomE === 0 || !period.entered
      ? '—'
      : ((result.finalPayout / result.context.newNomE) * 100).toFixed(1) + '%'
  );
  salesRepSetOutput('sr-qualifier-portfolio-value', Math.min(period.qualifiers.portfolio, 100).toFixed(0) + '%');
  salesRepSetOutput('sr-qualifier-visits-value', Math.min(period.qualifiers.visits, 100).toFixed(0) + '%');
  updateSalesRepRecap();
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
    salesRepPersist();
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
    salesRepActive()[target][key] = bounded;
    event.target.value = String(bounded);
    salesRepMarkEntered();
    updateSalesRepCalculator();
    salesRepPersist();
  };
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

function salesRepApplyPeriodToControls() {
  const period = salesRepActive();
  const values = {
    'sr-achievement-c2p-total': period.achievements.c2pTotal,
    'sr-achievement-c2p-price': period.achievements.c2pPrice,
    'sr-achievement-dev': period.achievements.dev,
    'sr-achievement-churn': period.achievements.churn,
    'sr-qualifier-portfolio': period.qualifiers.portfolio,
    'sr-qualifier-visits': period.qualifiers.visits
  };
  Object.keys(values).forEach(id => { document.getElementById(id).value = String(values[id]); });
}

function salesRepSelectPeriod(key) {
  salesRepActivePeriod = key;
  SALES_REP_PERIODS.forEach(periodKey => {
    document.getElementById('sr-tab-' + periodKey).setAttribute('aria-selected', String(periodKey === key));
  });
  salesRepSetOutput('sr-period-label', SALES_REP_PERIOD_LABELS[key]);
  salesRepApplyPeriodToControls();
  updateSalesRepCalculator();
}

function salesRepResetPeriod() {
  salesRepState.periods[salesRepActivePeriod] = salesRepDefaultPeriod();
  salesRepSelectPeriod(salesRepActivePeriod);
  salesRepPersist();
}

function initializeSalesRepCalculator() {
  const app = document.getElementById('sales-rep-app');
  if (!app) return;
  const storage = salesRepStorageOrNull();
  if (storage === null) {
    salesRepShowMessage('sr-storage-status', 'Changes are not saved in this browser.');
  } else {
    const loaded = salesRepLoadState(storage);
    if (loaded) Object.assign(salesRepState, loaded);
  }
  const defaults = {
    'sr-fixed-salary': salesRepState.fixedSalary,
    'sr-old-nominal-mode': salesRepState.oldNominalMode,
    'sr-old-nominal-fixed': salesRepState.oldNominalFixedE,
    'sr-old-nominal-percent': salesRepState.oldNominalPercent,
    'sr-min-nominal': salesRepState.minNominalE
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
    salesRepPersist();
  });
  salesRepBindSlider('sr-achievement-c2p-total', 'achievements', 'c2pTotal', 200);
  salesRepBindSlider('sr-achievement-c2p-price', 'achievements', 'c2pPrice', 200);
  salesRepBindSlider('sr-achievement-dev', 'achievements', 'dev', 200);
  salesRepBindSlider('sr-achievement-churn', 'achievements', 'churn', 200);
  salesRepBindSlider('sr-qualifier-portfolio', 'qualifiers', 'portfolio', 100);
  salesRepBindSlider('sr-qualifier-visits', 'qualifiers', 'visits', 100);
  SALES_REP_PERIODS.forEach(key => {
    document.getElementById('sr-tab-' + key).addEventListener('click', () => salesRepSelectPeriod(key));
  });
  document.getElementById('sr-reset-period').addEventListener('click', salesRepResetPeriod);
  salesRepSelectPeriod('q1');
}

window.addEventListener('DOMContentLoaded', initializeSalesRepCalculator);
