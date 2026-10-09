// Dashboard UI: loads rows, applies filters, renders charts and the correlation table.
// Statistics come from stats.js (parseSwe2025Csv, aggregateDashboard); nothing is recomputed here.
let dashRows = [];
let dashCounts = null;
const dashCharts = {};

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
    country: document.getElementById('dash-filter-country').value,
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
    values.map(value => '<option value="' + dashEscape(value) + '">' + dashEscape(value) + '</option>').join('');
  select.value = values.includes(current) ? current : '';
}

function dashSetChart(id, config) {
  if (dashCharts[id]) dashCharts[id].destroy();
  dashCharts[id] = new Chart(document.getElementById(id), config);
}

function dashDrawScatter(model) {
  const datasets = [{
    label: 'Employees',
    data: model.scatter,
    backgroundColor: 'rgba(234, 88, 12, 0.6)',
    pointRadius: 4
  }];
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
  dashSetChart('dash-scatter', {
    type: 'scatter',
    data: { datasets },
    options: {
      animation: false,
      plugins: { legend: { display: false } },
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
      plugins: { legend: { display: false } },
      scales: { y: { title: { display: true, text: 'Mean achievement 2025 (%)' } } }
    }
  });
}

function dashRenderCorrelations(model) {
  const format = value => (value === null || value === undefined ? 'n/a' : value.toFixed(2));
  document.getElementById('dash-correlations-body').innerHTML = model.correlations.map(row =>
    '<tr><td class="py-1 pr-4 font-sans">' + dashEscape(row.variable) + '</td>' +
    '<td class="py-1 pr-4">' + format(row.pearson) + '</td>' +
    '<td class="py-1 pr-4">' + format(row.spearman) + '</td>' +
    '<td class="py-1">' + row.n + '</td></tr>'
  ).join('');
}

function dashRender() {
  const model = aggregateDashboard(dashRows, dashFilters());
  document.getElementById('dash-counts').innerText =
    dashRows.length + ' rows used · ' + (dashCounts.notIn + dashCounts.invalid) + ' ignored (' +
    dashCounts.notIn + ' not In, ' + dashCounts.invalid + ' invalid) · ' +
    dashCounts.achievementMissing + ' without achievement · ' + model.rowCount + ' in current filters';
  if (model.achievementCount < 3) {
    dashSetStatus('Not enough data for these filters (fewer than 3 achievements).');
  } else {
    dashClearStatus();
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
      dashClearStatus();
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
        dashClearStatus();
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
      dashClearStatus();
    })
    .catch(error => {
      if (error instanceof TypeError || /^HTTP/.test(String(error && error.message))) dashShowPicker();
      else dashSetStatus('Loading error: ' + dashErrorText(error));
    });
}

['dash-filter-country', 'dash-filter-market', 'dash-filter-category'].forEach(id => {
  document.getElementById(id).addEventListener('change', dashRender);
});
document.getElementById('dash-csv-input').addEventListener('change', event => {
  const file = event.target.files[0];
  if (file) dashLoadFile(file);
});
dashLoad();
