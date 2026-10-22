'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

async function openDashboard(page) {
  await page.addInitScript(() => {
    const rows = ['France', 'Spain', 'Italy', 'Portugal'].flatMap(country =>
      [80, 100, 120].map((achievement, index) => ({
        country, jobProfile: index === 2 ? 'Manager' : 'Account Executive',
        market: index === 0 ? '' : 'Retail', category: index === 2 ? 'Managers' : 'Sales',
        fixed: 40000 + index * 10000, nominal: 4000 + index * 1000,
        achievement, rating: ['', 'P1', 'P4'][index], seniority: index + 1, age: 30 + index
      })));
    window.google = { script: { run: {
      withSuccessHandler(handler) { this.success = handler; return this; },
      withFailureHandler(handler) { this.failure = handler; return this; },
      getDashboardData() {
        this.success({ rows, counts: { total: 12, notIn: 0, invalid: 0, achievementMissing: 0 } });
      }
    } } };
  });
  await page.goto(pathToFileURL(path.resolve(__dirname, '../../dist/dashboard/index.html')).href);
  await expect(page.locator('#dash-hist-count-3')).toHaveText('n = 3');
}

test('country overview opens first and filters update histogram statistics and Spearman values', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openDashboard(page);
  await expect(page.locator('#dash-view-overview')).toBeVisible();
  await expect(page.locator('#dash-view-detail')).toBeHidden();
  await expect(page.locator('#dash-filter-category')).toBeVisible();
  await expect(page.locator('#dash-filter-job')).toHaveCount(0);
  await expect(page.locator('#dash-filter-category option[value="__EMPTY__"]')).toHaveText('None');
  await expect(page.locator('#dash-country-correlations tr')).toHaveCount(4);
  await expect(page.locator('#dash-country-correlations tr').first().locator('td').first()).toHaveText('1.00');
  const correlationColumnWidths = await page.locator('#dash-country-correlations tr').first().evaluate(row =>
    [...row.cells].slice(1).map(cell => cell.getBoundingClientRect().width));
  expect(Math.max(...correlationColumnWidths) - Math.min(...correlationColumnWidths)).toBeLessThanOrEqual(1);
  await expect(page.locator('#dash-hist-stats-0')).toHaveText('Mean 100.0% · Std 16.3%');
  const charts = await page.evaluate(() => [0, 1, 2, 3].map(index => {
    const chart = window.Chart.getChart('dash-hist-' + index);
    const bars = chart.getDatasetMeta(0).data;
    return { data: chart.data.datasets[0].data.map(point => point.y), max: chart.options.scales.y.max,
      minX: chart.scales.x.min, maxX: chart.scales.x.max,
      gap: bars[1].x - bars[0].x - bars[0].width,
      width: chart.width, height: chart.height };
  }));
  expect(charts[0].data).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  expect(charts.every(chart => chart.max === 2 && chart.width > 400 && chart.height === 256 &&
    chart.minX === 0 && chart.maxX === 200 && chart.gap > 0)).toBe(true);
  await expect(page.locator('#dash-overview-legend')).toContainText('Very weak / near zero');
  await page.locator('#dash-filter-market').selectOption('__EMPTY__');
  await expect(page.locator('#dash-hist-stats-0')).toHaveText('Mean 80.0% · Std 0.0%');
  await expect(page.locator('#dash-country-correlations tr').first().locator('td').first()).toHaveText('n/a');
  await page.locator('#dash-filter-category').selectOption('Managers');
  await expect(page.locator('#dash-hist-count-3')).toHaveText('No achievement data');
  await expect(page.locator('#dash-hist-stats-3')).toHaveText('Mean n/a · Std n/a');
});

test('correlation colors and tooltip interpretations distinguish magnitude from sign', async ({ page }) => {
  await openDashboard(page);
  const cells = await page.evaluate(() => {
    const container = document.createElement('table');
    const values = [0.14, -0.14, 0.15, -0.29, 0.30, -0.49, 0.50, -0.80, null];
    container.innerHTML = '<tbody><tr>' + values.map(spearman => window.dashCorrelationCell({
      variable: 'Nominal', spearman, n: 10
    })).join('') + '</tr></tbody>';
    return [...container.querySelectorAll('td')].map(cell => ({
      background: cell.style.background, title: cell.title, text: cell.textContent
    }));
  });
  expect(cells[0].background).toBe(cells[1].background);
  expect(cells[0].title).toContain('Very weak / near zero');
  expect(cells[2].title).toContain('Weak · Positive');
  expect(cells[3].title).toContain('Weak · Negative');
  expect(cells[4].title).toContain('Moderate');
  expect(cells[6].title).toContain('Strong');
  expect(cells[8].text).toBe('n/a');
  expect(new Set(cells.slice(0, 8).map(cell => cell.background)).size).toBe(7);
  await page.getByRole('tab', { name: 'Detailed analysis' }).click();
  await expect(page.locator('#dash-detail-legend')).toContainText('0.30 ≤ |ρ| < 0.50');
  expect(cells[0].background).toBe('rgb(229, 231, 235)');
});

test('detailed view shows ordered ratings and a large scatter with employee tooltips', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openDashboard(page);
  await page.getByRole('tab', { name: 'Detailed analysis' }).click();
  await expect(page.locator('#dash-view-overview')).toBeHidden();
  await expect(page.locator('#dash-view-detail')).toBeVisible();
  await expect(page.locator('#dash-view-detail thead')).toHaveText(/Variable\s+Spearman ρ\s+n/);
  const chartInfo = await page.evaluate(() => {
    const scatter = window.Chart.getChart('dash-scatter');
    const rating = window.Chart.getChart('dash-rating');
    return {
      labels: [...rating.data.labels], datasetLabels: scatter.data.datasets.map(dataset => dataset.label),
      datasetColors: scatter.data.datasets.slice(0, 4).map(dataset => dataset.backgroundColor),
      trendLegend: document.querySelector('#dash-scatter-legend').innerText,
      trendBorderDash: scatter.data.datasets[4].borderDash,
      countryLegend: [...document.querySelectorAll('#dash-scatter-legend [data-country-legend]')]
        .map(item => [item.dataset.countryLegend, item.querySelector('[data-legend-swatch]').style.backgroundColor]),
      pointCountries: scatter.data.datasets.slice(0, 4).map(dataset => dataset.data.map(point => point.country)),
      width: scatter.width, height: scatter.height,
      tooltip: scatter.options.plugins.tooltip.callbacks.label({
        dataset: scatter.data.datasets[0], raw: scatter.data.datasets[0].data[0]
      })
    };
  });
  expect(chartInfo.labels).toEqual(['Unclassified (n 4)', 'P2 (n 0)', 'P3 (n 0)', 'P4 (n 4)', 'P5 (n 0)']);
  expect(chartInfo.datasetLabels).toEqual(['France', 'Spain', 'Italy', 'Portugal', 'Trend']);
  expect(new Set(chartInfo.datasetColors).size).toBe(4);
  expect(chartInfo.datasetColors).toEqual(['#0072B2', '#D55E00', '#009E73', '#CC79A7']);
  expect(chartInfo.countryLegend).toEqual([
    ['France', 'rgb(0, 114, 178)'], ['Spain', 'rgb(213, 94, 0)'],
    ['Italy', 'rgb(0, 158, 115)'], ['Portugal', 'rgb(204, 121, 167)']
  ]);
  expect(chartInfo.trendLegend).toContain('Distribution trend');
  expect(chartInfo.trendBorderDash || []).toEqual([]);
  expect(chartInfo.pointCountries).toEqual([['France', 'France', 'France'], ['Spain', 'Spain', 'Spain'],
    ['Italy', 'Italy', 'Italy'], ['Portugal', 'Portugal', 'Portugal']]);
  await expect(page.locator('#dash-filter-category')).toBeVisible();
  await expect(page.locator('#dash-filter-job')).toHaveCount(0);
  expect(chartInfo.width).toBeGreaterThan(1000);
  expect(chartInfo.height).toBe(520);
  expect(chartInfo.tooltip).toEqual([
    'Achievement: 80.0%', 'Annualized base pay: €40,000',
    'Job title: Account Executive', 'Nominal: €4,000', 'Country: France'
  ]);
  await page.locator('#dash-filter-country').selectOption('Italy');
  await expect(page.locator('#dash-counts')).toContainText('3 in current filters');
  await page.getByRole('tab', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('#dash-hist-count-0')).toHaveText('n = 3');
  await expect(page.locator('#dash-counts')).toContainText('12 in current filters');
});
