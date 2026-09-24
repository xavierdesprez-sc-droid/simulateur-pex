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

const SALES_REP_CHARTS = {};
let salesRepInvalidInputId = null;

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
              { label: kpi.label + ' weighted payout', data: curve, borderColor: '#4f46e5', tension: 0.15 },
              { label: 'Current achievement', data: point, borderColor: '#dc2626', backgroundColor: '#dc2626', pointRadius: 4, showLine: false }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Achievement (%)' } }, y: { title: { display: true, text: 'Payout (€)' } } } }
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
  const result = calculateSalesRepPayout();
  result.kpiPayouts.forEach(item => {
    const key = item.key.replace(/([A-Z])/g, '-$1').toLowerCase();
    salesRepSetOutput('sr-payout-' + key, salesRepFormatE(item.weightedPayout));
    salesRepSetOutput('sr-summary-' + key, salesRepFormatE(item.weightedPayout));
    salesRepSetOutput('sr-achievement-' + key + '-value', item.achievement.toFixed(0) + '%');
  });
  salesRepSetOutput('sr-performance-subtotal', salesRepFormatE(result.performanceSubtotal));
  salesRepSetOutput('sr-qualifier-multiplier', (result.qualifierMultiplier * 100).toFixed(0) + '%');
  salesRepSetOutput('sr-final-payout', salesRepFormatE(result.finalPayout));
  salesRepSetOutput('sr-qualifier-portfolio-value', Math.min(salesRepState.qualifiers.portfolio, 100).toFixed(0) + '%');
  salesRepSetOutput('sr-qualifier-visits-value', Math.min(salesRepState.qualifiers.visits, 100).toFixed(0) + '%');
  salesRepRefreshCharts(result);
  return result;
}

function salesRepBindNumber(id, stateKey) {
  const el = document.getElementById(id);
  const update = event => {
    const value = salesRepReadNumber(event.target);
    if (value === null) {
      salesRepSetInvalid(event.target, true);
      salesRepInvalidInputId = id;
      salesRepShowMessage('sr-validation-message', 'Please enter a finite, non-negative number.');
      return;
    }
    salesRepSetInvalid(event.target, false);
    if (salesRepInvalidInputId === id) {
      salesRepInvalidInputId = null;
      salesRepHideMessage('sr-validation-message');
    }
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
    salesRepState[target][key] = bounded;
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
    'sr-achievement-c2p-total': salesRepState.achievements.c2pTotal,
    'sr-achievement-c2p-price': salesRepState.achievements.c2pPrice,
    'sr-achievement-dev': salesRepState.achievements.dev,
    'sr-achievement-churn': salesRepState.achievements.churn,
    'sr-qualifier-portfolio': salesRepState.qualifiers.portfolio,
    'sr-qualifier-visits': salesRepState.qualifiers.visits
  };
  Object.keys(defaults).forEach(id => { document.getElementById(id).value = String(defaults[id]); });
  salesRepBindNumber('sr-fixed-salary', 'fixedSalary');
  salesRepBindNumber('sr-old-nominal-fixed', 'oldNominalFixedE');
  salesRepBindNumber('sr-old-nominal-percent', 'oldNominalPercent');
  salesRepBindNumber('sr-min-nominal', 'minNominalE');
  const mode = document.getElementById('sr-old-nominal-mode');
  mode.addEventListener('change', event => {
    salesRepState.oldNominalMode = event.target.value === 'percent' ? 'percent' : 'fixed';
    salesRepHideMessage('sr-validation-message');
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
