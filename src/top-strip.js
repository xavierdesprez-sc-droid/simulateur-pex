'use strict';
/**
 * Top strip shared by the Hybrid / 4:1 / Matrix tabs — SINGLE SOURCE OF TRUTH.
 *
 * Build-time only (required by build.js, never shipped to the browser).
 * Each tab keeps its own IDs (prefix-based) so per-tab updates still work,
 * but the markup (ΔPEX cards + synced overperformance slider) is defined once.
 *
 * Main figure of scenario cards = ΔPEX vs current (colored at runtime:
 * emerald = savings, rose = overrun). Placeholders:
 *   <!-- @@TOP-STRIP:hybrid --> / four-to-one / matrix
 */
const DELTA_THEMES = {
  standard: { box: 'bg-indigo-50 rounded-xl border border-indigo-200', label: 'text-indigo-500', value: 'text-indigo-700', text: 'Standard ΔPEX', key: 'standard' },
  fourtoone: { box: 'bg-cyan-50 rounded-xl border border-cyan-200', label: 'text-cyan-600', value: 'text-cyan-700', text: '4:1 ΔPEX', key: 'fourtoone' },
  hybrid: { box: 'bg-orange-50 rounded-xl border border-orange-200', label: 'text-orange-600', value: 'text-orange-700', text: 'Hybrid ΔPEX', key: 'hybrid' }
};

function currentCard(prefix, valCls) {
  return `<div class="p-3 bg-slate-50 rounded-xl border border-slate-200/70">\n` +
    `          <span class="text-slate-500 font-semibold block">Current PEX</span>\n` +
    `          <span id="${prefix}-pex-old" class="${valCls} font-black font-mono text-slate-700">—</span>\n` +
    `        </div>`;
}

function deltaCard(prefix, kind, valCls) {
  const t = DELTA_THEMES[kind];
  return `<div class="p-3 ${t.box}">\n` +
    `          <span class="${t.label} font-semibold block">${t.text}</span>\n` +
    `          <span id="${prefix}-pex-${t.key}" class="${valCls} font-black font-mono ${t.value}">—</span>\n` +
    `          <span id="${prefix}-pex-${t.key}-delta" class="text-[10px] font-bold block text-slate-500">— vs current</span>\n` +
    `        </div>`;
}

function pnlCard(cfg, pnlCls) {
  return `<div class="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-3 rounded-xl shadow-md">\n` +
    `          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-300">${cfg.label}</span>\n` +
    `          <div id="${cfg.id}" class="${pnlCls} font-black text-white">—</div>\n` +
    `          <div class="text-[10px] text-indigo-200 mt-0.5">${cfg.sub}</div>\n` +
    (cfg.extra || '') +
    `        </div>`;
}

function overperfSlider(sliderId) {
  return `<div class="px-4 py-2 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">\n` +
    `        <div class="flex items-center justify-between text-xs">\n` +
    `          <label for="${sliderId}" class="font-semibold text-slate-700 flex items-center gap-1">\n` +
    `            <span>Induced overperformance (scheme)</span>\n` +
    `            <span class="text-slate-400 hover:text-slate-600 cursor-help" title="Incentive effect of the scheme on C2P — synced everywhere"><i data-lucide="help-circle" class="w-3.5 h-3.5"></i></span>\n` +
    `          </label>\n` +
    `          <span id="${sliderId}-value" class="font-mono font-bold text-emerald-700 text-sm bg-emerald-100 px-2 py-0.5 rounded-md">+0.0%</span>\n` +
    `        </div>\n` +
    `        <input type="range" id="${sliderId}" min="-10" max="15" step="0.2" value="0" class="w-full cursor-pointer accent-emerald-600">\n` +
    `        <div class="relative h-4 text-[10px] text-slate-400 font-mono">\n` +
    `          <span class="absolute left-[0%] -translate-x-1/2">-10%</span>\n` +
    `          <span class="absolute left-[40%] -translate-x-1/2">0%</span>\n` +
    `          <span class="absolute left-[100%] -translate-x-1/2">+15%</span>\n` +
    `        </div>\n` +
    `      </div>`;
}

// Per-tab composition. Card order preserved from the original views.
const TOP_STRIPS = {
  hybrid: {
    prefix: 'hyb-top',
    icon: '<div class="p-1.5 bg-orange-50 text-orange-600 rounded-lg"><i data-lucide="scale" class="w-4 h-4"></i></div>',
    title: 'PEX Impact vs Current — All Scenarios',
    subtitle: 'Same population, same filters · <span id="hyb-top-status" class="font-semibold">load a population below</span>',
    valCls: 'text-xl mt-1',
    pnlCls: 'text-2xl mt-1',
    cards: [
      { type: 'delta', kind: 'standard' },
      { type: 'delta', kind: 'fourtoone' },
      { type: 'delta', kind: 'hybrid' },
      { type: 'pnl', label: 'Hybrid P&L', id: 'hyb-top-pnl', sub: 'C2P contribution + Hybrid savings · <span id="hyb-top-c2p" class="font-bold">—</span>' }
    ],
    sliderId: 'hyb-overperf',
    after: ''
  },
  'four-to-one': {
    prefix: 'four-to-one',
    icon: '<div class="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg"><i data-lucide="repeat-2" class="w-4 h-4"></i></div>',
    title: 'Scenario 4:1 — Nominal to Objective',
    subtitle: 'The standard curve with a 4 € objective increase for each 1 € nominal increase',
    valCls: 'text-lg',
    pnlCls: 'text-2xl',
    cards: [
      { type: 'current' },
      { type: 'delta', kind: 'standard' },
      { type: 'delta', kind: 'fourtoone' },
      { type: 'delta', kind: 'hybrid' },
      { type: 'pnl', label: 'P&L', id: 'four-to-one-pnl', sub: 'C2P <span id="four-to-one-pnl-c2p" class="font-bold">—</span> + savings', extra: '          <span id="four-to-one-c2p-gain" class="hidden"></span>\n          <span id="four-to-one-c2p-gain-gross" class="hidden"></span>\n' }
    ],
    sliderId: 'four-to-one-overperf',
    after: '      <p id="four-to-one-status" class="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Load a population to display the 4:1 scenario.</p>'
  },
  matrix: {
    prefix: 'matrix',
    icon: '<div class="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><i data-lucide="scale" class="w-4 h-4"></i></div>',
    title: 'PEX Impact vs Current — All Scenarios',
    subtitle: 'Same population, same filters · <span id="matrix-top-status" class="font-semibold">load a population to display the matrix</span>',
    valCls: 'text-lg',
    cards: [
      { type: 'current' },
      { type: 'delta', kind: 'standard' },
      { type: 'delta', kind: 'hybrid' },
      { type: 'delta', kind: 'fourtoone' }
    ],
    sliderId: 'matrix-overperf',
    after: ''
  }
};

function renderTopStrip(name) {
  const cfg = TOP_STRIPS[name];
  if (!cfg) throw new Error('top-strip: unknown strip "' + name + '"');
  const cards = cfg.cards.map(c => {
    if (c.type === 'current') return currentCard(cfg.prefix, cfg.valCls);
    if (c.type === 'delta') return deltaCard(cfg.prefix, c.kind, cfg.valCls);
    return pnlCard(c, cfg.pnlCls);
  }).join('\n');
  const n = cfg.cards.length;
  return `<div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">\n` +
    `      <div class="flex items-center gap-2 border-b border-slate-100 pb-3">\n` +
    `        ${cfg.icon}\n` +
    `        <div>\n` +
    `          <h2 class="font-bold text-slate-900 text-sm">${cfg.title}</h2>\n` +
    `          <p class="text-xs text-slate-500">${cfg.subtitle}</p>\n` +
    `        </div>\n` +
    `      </div>\n` +
    `      <div class="grid grid-cols-2 lg:grid-cols-${n} gap-3 text-center text-xs">\n` +
    `        ${cards}\n` +
    `      </div>\n` +
    `      ${overperfSlider(cfg.sliderId)}\n` +
    (cfg.after ? `      ${cfg.after}\n` : '') +
    `    </div>`;
}

module.exports = { TOP_STRIPS, renderTopStrip };
