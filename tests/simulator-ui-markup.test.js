'use strict';

module.exports = function suite(h) {
  const html = h.buildString('SWE');
  const salesRepHtml = h.buildSalesRepString();

  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
  h.check('simulator header wraps on narrow screens and keeps all presets available',
    /flex-col[^"]*xl:flex-row/.test(header) &&
    !/hidden md:flex/.test(header) &&
    /role="group" aria-label="Scenario presets" class="[^"]*overflow-x-auto/.test(header) &&
    ['preset-initial', 'preset-targetGroup', 'preset-highIncentive']
      .every(id => header.includes(`id="${id}"`)));

  h.check('reset icon button has an accessible name',
    /<button[^>]*aria-label="Reset parameters"[^>]*>[\s\S]*?<i[^>]*aria-hidden="true"/.test(header));

  h.check('simulator typography and keyboard focus styles are upgraded',
    html.includes('[class~="text-[10px]"]') &&
    html.includes('[class~="text-[11px]"]') &&
    html.includes(':focus-visible'));

  const describedCharts = [
    ['mainChart', 'Distribution, payout, and nominal-weighted curves'],
    ['advChart', 'Hybrid, old, and all-new payout curves'],
    ['personae-chart', 'Comparaison des courbes de rémunération des personas']
  ];
  h.check('primary simulator charts expose accessible descriptions',
    describedCharts.every(([id, description]) => {
      const canvas = html.match(new RegExp(`<canvas[^>]*id="${id}"[^>]*>`))?.[0] || '';
      return /role="img"/.test(canvas) && canvas.includes(`aria-label="${description}"`);
    }));

  h.check('matrix data remains readable through a labeled horizontal scroller',
    /role="region"[^>]*aria-label="Scrollable salary and performance matrix"[^>]*tabindex="0"[^>]*class="[^"]*overflow-x-auto/.test(html) &&
    /id="matrix-grid"[^>]*class="[^"]*min-w-\[/.test(html));

  h.check('breakpoint data table can scroll horizontally on narrow screens',
    /class="overflow-x-auto[^"]*rounded-xl"[^>]*>\s*<table class="w-full min-w-\[/.test(html));

  h.check('all Sales Rep KPI charts have role, title, and text alternative',
    ['c2p-total', 'c2p-price', 'dev', 'churn'].every(key => {
      const canvas = salesRepHtml.match(new RegExp(`<canvas[^>]*id="sr-chart-${key}"[^>]*>`))?.[0] || '';
      const descriptionId = `sr-chart-${key}-description`;
      const graphic = salesRepHtml.match(new RegExp(
        `<figure role="img" aria-label="[^"]+" aria-describedby="${descriptionId}">\\s*<div class="mt-3 relative h-48">\\s*<canvas id="sr-chart-${key}" class="w-full h-full"><\\/canvas>\\s*<\\/div>\\s*<\\/figure>`))?.[0] || '';
      return canvas.length > 0 &&
        graphic.length > 0 &&
        new RegExp(`<p id="${descriptionId}" class="sr-only">[^<]+</p>`).test(salesRepHtml);
    }));
};
