'use strict';
/**
 * Harnais de test : DOM simulé + chargement du script de la page + helpers.
 * Chaque suite reçoit un état de page FRAIS (le script de index.html est ré-évalué).
 */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const results = { pass: 0, fail: 0, failures: [] };

function makeEl() {
  return new Proxy(
    {
      style: {}, classList: { toggle(){}, add(){}, remove(){} },
      innerText: '', innerHTML: '',
      getContext: () => ({}), appendChild: () => ({}), removeChild: () => ({})
    },
    {
      get(t, p) { if (p in t) return t[p]; return t[p] = makeEl(); },
      set(t, p, v) { t[p] = v; return true; }
    }
  );
}

function extractPageScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  return scripts[scripts.length - 1][1];
}

function runSuite(suiteFile) {
  const suiteName = path.basename(suiteFile);
  const suiteFn = require(suiteFile);
  const page = extractPageScript(fs.readFileSync(HTML_PATH, 'utf8'));

  // Environnement DOM neuf pour chaque suite
  const els = {};
  global.document = {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    querySelectorAll: () => [],
    body: makeEl(),
    addEventListener: () => {}
  };
  global.window = { addEventListener: () => {} };

  // Mock Chart.js : les datasets sont exposés pour les assertions
  global.Chart = function (ctx, cfg) {
    globalThis.__chartDatasets = cfg.data.datasets;
    return { data: cfg.data, options: { scales: {} }, update() {}, getDatasetMeta() { return { hidden: null }; } };
  };
  global.lucide = { createIcons() {} };

  // Mock google.script.run (contrôlé par la suite via h.mock)
  const mocks = { sheetReps: [], sheetError: null };
  global.google = { script: {} };
  global.google.script.run = (() => {
    const obj = {};
    const api = {
      getPopulation() {
        if (mocks.sheetError) { if (obj.fail) obj.fail({ message: mocks.sheetError }); }
        else if (obj.ok) obj.ok(mocks.sheetReps);
        return api;
      },
      withSuccessHandler(fn) { obj.ok = fn; return api; },
      withFailureHandler(fn) { obj.fail = fn; return api; }
    };
    return api;
  })();

  const record = (name, ok) => {
    if (ok) results.pass++;
    else { results.fail++; results.failures.push({ suite: suiteName, name }); console.log('  FAIL:', name); }
  };
  const h = {
    els,
    mock: mocks,
    check: record,
    assertClose(name, got, exp, tol = 0.01) {
      record(`${name} (got ${got}, exp ${exp})`, Math.abs(got - exp) <= tol);
    }
  };
  globalThis.__h = h;

  // La fonction de suite est injectée dans le scope du script de la page :
  // elle accède directement à state, advState, evalHybridE, refreshPopulation, etc.
  (0, eval)(page + '\n;(' + suiteFn.toString() + ')(__h);');

  console.log(`  ${suiteName}: ${suiteName} terminé`);
}

module.exports = { runSuite, results, HTML_PATH };
