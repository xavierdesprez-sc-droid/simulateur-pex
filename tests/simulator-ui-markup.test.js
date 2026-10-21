'use strict';

module.exports = function suite(h) {
  const html = h.buildString('SWE');
  const salesRepHtml = h.buildSalesRepString();

  h.check('Tailwind Play CDN loads without CORS-only attributes in every app',
    [html, h.buildString('NCE'), salesRepHtml].every(page => {
      const script = page.match(/<script\b[^>]*src="https:\/\/cdn\.tailwindcss\.com\/[^"]+"[^>]*><\/script>/)?.[0];
      return script && !/\b(?:integrity|crossorigin)\s*=/.test(script);
    }));

  const nceHtml = h.buildString('NCE');
  h.check('scenario preset shortcuts are absent from every app header',
    [html, nceHtml, salesRepHtml].every(page => {
      const pageHeader = page.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
      return !/Scenario presets|preset-(?:initial|targetGroup|highIncentive)/.test(pageHeader);
    }));

  h.check('reset icon button remains accessible in cluster profile headers',
    [html, nceHtml].every(page => {
      const pageHeader = page.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
      return /<button[^>]*aria-label="Reset parameters"[^>]*>[\s\S]*?<i[^>]*aria-hidden="true"/.test(pageHeader);
    }));

  h.check('simulator typography and keyboard focus styles are upgraded',
    html.includes('[class~="text-[10px]"]') &&
    html.includes('[class~="text-[11px]"]') &&
    html.includes(':focus-visible'));

  const describedCharts = [
    ['mainChart', 'Distribution, payout, and nominal-weighted curves'],
    ['advChart', 'Hybrid, old, and all-new payout curves'],
    ['personae-chart', 'Comparison of persona pay curves']
  ];
  h.check('primary simulator charts expose accessible descriptions',
    describedCharts.every(([id, description]) => {
      const canvas = html.match(new RegExp(`<canvas[^>]*id="${id}"[^>]*>`))?.[0] || '';
      return /role="img"/.test(canvas) && canvas.includes(`aria-label="${description}"`);
    }));

  h.check('matrix data remains readable through a labeled horizontal scroller',
    /role="region"[^>]*aria-label="Scrollable salary and performance matrix"[^>]*tabindex="0"[^>]*class="[^"]*overflow-x-auto/.test(html) &&
    /id="matrix-grid"[^>]*class="[^"]*min-w-\[/.test(html));

  h.check('breakpoint table retains its accessible region label',
    /role="region" aria-label="Curve breakpoint table"/.test(html));

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
