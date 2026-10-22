// Dashboard UI: loads rows, applies filters, renders charts and the correlation table.
// Statistics come from stats.js (parseSwe2025Csv, aggregateDashboard); nothing is recomputed here.
let dashRows = [];
let dashCounts = null;
const dashCharts = {};
let dashView = 'overview';

function dashEscape(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function dashSetStatus(text) {
  const el = document.getElementById('dash-status');
  el.innerText = text;
  el.classList.remove('hidden');
}

function dashClearStatus() {
  document.getElementById('dash-status').classList.add('hidden');
}

function dashFilters() {
  return {
    country: dashView === 'detail' ? document.getElementById('dash-filter-country').value : '',
    jobProfile: '',
    market: document.getElementById('dash-filter-market').value,
    category: document.getElementById('dash-filter-category').value
  };
}

function dashDistinct(key) {
  return [...new Set(dashRows.map(row => row[key]).filter(Boolean))].sort();
}

function dashFillSelect(id, values) {
  const select = document.getElementById(id);
  const current = select.value;
  select.innerHTML = '<option value="">All</option>' +
    '<option value="' + DASHBOARD_EMPTY_FILTER + '">None</option>' +
    values.map(value => '<option value="' + dashEscape(value) + '">' + dashEscape(value) + '</option>').join('');
  select.value = values.includes(current) || current === DASHBOARD_EMPTY_FILTER ? current : '';
}

function dashSetChart(id, config) {
  if (dashCharts[id]) dashCharts[id].destroy();
  dashCharts[id] = new Chart(document.getElementById(id), config);
}

function dashDrawScatter(model) {
  const countryColors = {
    France: '#0072B2', Spain: '#D55E00', Italy: '#009E73', Portugal: '#CC79A7'
  };
  const datasets = DASHBOARD_COUNTRIES.map(country => ({
    label: country,
    data: model.scatter.filter(point => point.country === country),
    backgroundColor: countryColors[country],
    pointRadius: 5,
    pointHoverRadius: 7
  }));
  if (model.trend) {
    const { slope, intercept, x0, x1 } = model.trend;
    datasets.push({
      label: 'Trend',
      type: 'line',
      data: [{ x: x0, y: slope * x0 + intercept }, { x: x1, y: slope * x1 + intercept }],
      borderColor: '#334155',
      borderWidth: 2,
      pointRadius: 0,
      fill: false
    });
  }
  const legend = datasets.filter(dataset => DASHBOARD_COUNTRIES.includes(dataset.label)).map(dataset =>
    '<span data-country-legend="' + dataset.label + '" class="inline-flex items-center gap-2 text-slate-600">' +
    '<span data-legend-swatch class="h-3 w-3 rounded-full" style="background:' + dataset.backgroundColor + '"></span>' +
    dataset.label + '</span>'
  );
  if (model.trend) {
    legend.push('<span class="inline-flex items-center gap-2 text-slate-600">' +
      '<span class="h-0 w-6 border-t-2 border-slate-700"></span>' +
      'Distribution trend</span>');
  }
  document.getElementById('dash-scatter-legend').innerHTML = legend.join('');
  dashSetChart('dash-scatter', {
    type: 'scatter',
    data: { datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: context => {
            const point = context.raw;
            if (context.dataset.label === 'Trend') return 'Trend: ' + point.y.toFixed(1) + '%';
            return [
              'Achievement: ' + point.y.toFixed(1) + '%',
              'Annualized base pay: ' + dashMoney(point.x),
              'Job title: ' + (point.jobProfile || 'None'),
              'Nominal: ' + dashMoney(point.nominal),
              'Country: ' + (point.country || 'None')
            ];
          }
        } }
      },
      scales: {
        x: { title: { display: true, text: 'Annualized base pay (€)' } },
        y: { title: { display: true, text: 'Achievement 2025 (%)' } }
      }
    }
  });
}

function dashDrawBars(id, entries, labelOf) {
  dashSetChart(id, {
    type: 'bar',
    data: {
      labels: entries.map(labelOf),
      datasets: [{
        label: 'Mean achievement (%)',
        data: entries.map(entry => entry.mean),
        backgroundColor: 'rgba(51, 65, 85, 0.7)'
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { title: { display: true, text: 'Mean achievement 2025 (%)' } } }
    }
  });
}

function dashRenderCorrelations(model) {
  document.getElementById('dash-correlations-body').innerHTML = model.correlations.map(row =>
    '<tr><td class="py-1 pr-4 font-sans">' + dashEscape(row.variable) + '</td>' +
    dashCorrelationCell(row) +
    '<td class="py-1">' + row.n + '</td></tr>'
  ).join('');
}

function dashMoney(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(value) : 'n/a';
}

function dashCorrelationCell(row) {
  const value = row.spearman;
  const strength = correlationStrength(value);
  const valid = strength !== null;
  const labels = { negligible: 'Very weak / near zero', weak: 'Weak', moderate: 'Moderate', strong: 'Strong' };
  const opacity = { weak: 0.1, moderate: 0.23, strong: 0.4 };
  const colored = valid && strength !== 'negligible';
  const background = colored ? (value < 0
    ? 'rgba(249,115,22,' + opacity[strength] + ')'
    : 'rgba(79,70,229,' + opacity[strength] + ')') : '#e5e7eb';
  const color = colored ? (value < 0 ? '#9a3412' : '#3730a3') : valid ? '#64748b' : '#94a3b8';
  return '<td class="px-4 py-3 rounded-lg text-center font-mono font-semibold" style="background:' +
    background + ';color:' + color + '" title="' + dashEscape(row.variable) +
    ': ' + row.n + ' valid pairs · ' + (valid ? labels[strength] +
      (value < 0 ? ' · Negative' : value > 0 ? ' · Positive' : '') : 'Insufficient data or no variation') + '">' +
    (valid ? value.toFixed(2) : 'n/a') + '</td>';
}

function dashRenderCorrelationLegends() {
  const bands = [
    ['#e5e7eb', 'Very weak / near zero', '|ρ| < 0.15'],
    ['rgba(79,70,229,0.1)', 'Weak', '0.15 ≤ |ρ| < 0.30'],
    ['rgba(79,70,229,0.23)', 'Moderate', '0.30 ≤ |ρ| < 0.50'],
    ['rgba(79,70,229,0.4)', 'Strong', '|ρ| ≥ 0.50']
  ];
  const html = '<div class="flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-slate-500">' +
    bands.map(([color, label, range]) => '<span class="flex items-center gap-2"><span class="h-3 w-3 rounded" style="background:' +
      color + '"></span><span>' + label + ' <span class="text-slate-400">(' + range + ')</span></span></span>').join('') +
    '</div><p class="text-[10px] text-slate-400 mt-2">Orange: negative · Indigo: positive · Strength uses |ρ|. ' +
    'These are descriptive guidelines, not significance thresholds; reliability depends on sample size. ' +
    'Near-zero Spearman does not rule out a non-monotonic relationship.</p>';
  ['dash-overview-legend', 'dash-detail-legend'].forEach(id => {
    document.getElementById(id).innerHTML = html;
  });
}

function dashDrawOverview(overview) {
  const colors = ['#6366f1', '#0d9488', '#0284c7', '#a855f7'];
  overview.countries.forEach((country, index) => {
    document.getElementById('dash-hist-count-' + index).innerText = country.achievementCount
      ? 'n = ' + country.achievementCount : 'No achievement data';
    const percent = value => Number.isFinite(value) ? value.toFixed(1) + '%' : 'n/a';
    document.getElementById('dash-hist-stats-' + index).innerText =
      'Mean ' + percent(country.meanAchievement) + ' · Std ' + percent(country.stdAchievement) +
      (country.belowRange || country.aboveRange
        ? ' · Outside chart: ' + country.belowRange + ' below 0%, ' + country.aboveRange + ' above 200%' : '');
    dashSetChart('dash-hist-' + index, {
      type: 'bar',
      data: {
        datasets: [{ label: 'Employees', data: country.histogram.map((count, binIndex) => ({
          x: overview.bins[binIndex].low + 5, y: count
        })), backgroundColor: colors[index], borderRadius: 4,
        barPercentage: 0.85, categoryPercentage: 0.9 }]
      },
      options: {
        animation: false, responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: contexts => {
            const bin = overview.bins[contexts[0].dataIndex];
            return bin.low + '% ≤ achievement ' + (bin.high === 200 ? '≤ ' : '< ') + bin.high + '%';
          },
          label: context => 'Employees: ' + context.raw.y
        } } },
        scales: {
          x: { type: 'linear', min: 0, max: 200, offset: false,
            title: { display: true, text: 'Achievement 2025 (%)' }, grid: { display: false },
            ticks: { stepSize: 20, maxRotation: 0, callback: value => value + '%' } },
          y: { beginAtZero: true, max: overview.maxFrequency + 1, ticks: { precision: 0 },
            grid: { color: '#f1f5f9' }, border: { display: false },
            title: { display: true, text: 'Employees' } }
        }
      }
    });
  });
  document.getElementById('dash-country-correlations').innerHTML = overview.countries.map(country =>
    '<tr><th scope="row" class="text-left px-2 py-3 text-slate-700 font-semibold">' +
    dashEscape(country.country) + '</th>' + country.correlations.map(dashCorrelationCell).join('') + '</tr>'
  ).join('');
}

function dashSetView(view) {
  dashView = view;
  ['overview', 'detail'].forEach(name => {
    const active = name === view;
    document.getElementById('dash-view-' + name).classList.toggle('hidden', !active);
    const button = document.getElementById('dash-tab-' + name);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    button.className = 'px-4 py-2 rounded-lg text-xs font-bold ' +
      (active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500');
  });
  document.getElementById('dash-country-control').classList.toggle('hidden', view !== 'detail');
  if (dashCounts) dashRender();
}

function dashRender() {
  if (!dashCounts) return;
  const model = aggregateDashboard(dashRows, dashFilters());
  const overview = dashView === 'overview' ? aggregateCountryDashboard(dashRows, dashFilters()) : null;
  const rowCount = overview ? overview.countries.reduce((sum, country) => sum + country.rowCount, 0) : model.rowCount;
  const achievementCount = overview ? overview.countries.reduce((sum, country) => sum + country.achievementCount, 0) : model.achievementCount;
  document.getElementById('dash-counts').innerText =
    dashRows.length + ' rows used · ' + (dashCounts.notIn + dashCounts.invalid) + ' ignored (' +
    dashCounts.notIn + ' not In, ' + dashCounts.invalid + ' invalid) · ' +
    dashCounts.achievementMissing + ' without achievement · ' + rowCount + ' in current filters';
  if (achievementCount < 3) {
    dashSetStatus('Not enough data for these filters (fewer than 3 achievements).');
  } else {
    dashClearStatus();
  }
  if (overview) {
    dashDrawOverview(overview);
    return;
  }
  dashDrawScatter(model);
  dashDrawBars('dash-rating', model.byRating, entry => entry.level + ' (n ' + entry.n + ')');
  dashDrawBars('dash-seniority', model.bySeniority, entry => entry.bin + ' (n ' + entry.n + ')');
  dashDrawBars('dash-age', model.byAge, entry => entry.bin + ' (n ' + entry.n + ')');
  dashRenderCorrelations(model);
}

function dashApplyResult(result) {
  dashRows = result.rows;
  dashCounts = result.counts;
  dashFillSelect('dash-filter-country', dashDistinct('country'));
  dashFillSelect('dash-filter-market', dashDistinct('market'));
  dashFillSelect('dash-filter-category', dashDistinct('category'));
  dashRender();
}

function dashErrorText(error) {
  return error && error.message ? error.message : String(error);
}

function dashLoadFile(file) {
  dashSetStatus('Loading ' + file.name + '…');
  const reader = new FileReader();
  reader.onload = () => {
    try {
      dashApplyResult(parseSwe2025Csv(reader.result));
    } catch (error) {
      dashSetStatus('Reading error: ' + file.name + ' (' + dashErrorText(error) + ')');
    }
  };
  reader.onerror = () => dashSetStatus('Reading error: ' + file.name);
  reader.readAsText(file);
}

function dashShowPicker() {
  dashSetStatus('Automatic CSV loading blocked by the browser: choose the CSV file…');
  document.getElementById('dash-csv-input').click();
}

function dashLoad() {
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    dashSetStatus('Loading from the Sheet…');
    google.script.run
      .withSuccessHandler(result => {
        dashApplyResult(result);
      })
      .withFailureHandler(error => dashSetStatus('Loading error: ' + dashErrorText(error)))
      .getDashboardData();
    return;
  }
  dashSetStatus('Loading population_test_swe2025.csv…');
  fetch('population_test_swe2025.csv')
    .then(async response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      dashApplyResult(parseSwe2025Csv(await response.text()));
    })
    .catch(error => {
      if (error instanceof TypeError || /^HTTP/.test(String(error && error.message))) dashShowPicker();
      else dashSetStatus('Loading error: ' + dashErrorText(error));
    });
}

['dash-filter-country', 'dash-filter-market', 'dash-filter-category'].forEach(id => {
  document.getElementById(id).addEventListener('change', dashRender);
});
['overview', 'detail'].forEach(view => {
  const tab = document.getElementById('dash-tab-' + view);
  tab.addEventListener('click', () => dashSetView(view));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'detail' :
      view === 'overview' ? 'detail' : 'overview';
    dashSetView(next);
    document.getElementById('dash-tab-' + next).focus();
  });
});
document.getElementById('dash-csv-input').addEventListener('change', event => {
  const file = event.target.files[0];
  if (file) dashLoadFile(file);
});
dashRenderCorrelationLegends();
dashLoad();
