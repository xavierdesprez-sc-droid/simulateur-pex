'use strict';
/**
 * Test harness: simulated DOM + page script loading + helpers.
 * Each suite gets a FRESH page state (the index.html script is re-evaluated).
 */
const fs = require('fs');
const path = require('path');
const { buildString } = require('../build');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const results = { pass: 0, fail: 0, failures: [] };

function makeEl() {
  return new Proxy(
    {
      style: {}, classList: { toggle(){}, add(){}, remove(){} },
      innerText: '', innerHTML: '',
      addEventListener: () => {},
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

function loadPageScript() {
  const srcDir = path.join(__dirname, '..', 'src', 'js');
  if (fs.existsSync(srcDir)) {
    const { JS_PARTS, concatJs } = require('../build');
    JS_PARTS.forEach(f => {
      if (!fs.existsSync(path.join(srcDir, f))) throw new Error(`harness: src/js manquant: ${f} — relance le split (Task 2)`);
    });
    return concatJs();
  }
  return extractPageScript(fs.readFileSync(HTML_PATH, 'utf8'));
}

function runSuite(suiteFile) {
  const suiteName = path.basename(suiteFile);
  const suiteFn = require(suiteFile);
  const page = loadPageScript();

  // Fresh DOM environment for each suite
  const els = {};
  global.document = {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    querySelectorAll: () => [],
    body: makeEl(),
    addEventListener: () => {}
  };
  globalThis.__domReadyHandler = null;
  global.window = {
    addEventListener: (event, handler) => {
      if (event === 'DOMContentLoaded') globalThis.__domReadyHandler = handler;
    }
  };

  // Chart.js mock: datasets are exposed for assertions
  global.Chart = function (ctx, cfg) {
    globalThis.__chartDatasets = cfg.data.datasets;
    return { data: cfg.data, options: cfg.options || { scales: {} }, update() {}, getDatasetMeta() { return { hidden: null }; } };
  };
  global.lucide = { createIcons() {} };

  // google.script.run mock (controlled by the suite via h.mock)
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
    htmlSrc: fs.readFileSync(HTML_PATH, 'utf8'),
    buildString,
    assertClose(name, got, exp, tol = 0.01) {
      record(`${name} (got ${got}, exp ${exp})`, Math.abs(got - exp) <= tol);
    }
  };
  globalThis.__h = h;

  // The suite function is injected into the page script's scope:
  // it directly accesses state, advState, evalHybridE, refreshPopulation, etc.
  (0, eval)(page + '\n;(' + suiteFn.toString() + ')(__h);');

  console.log(`  ${suiteName}: ${suiteName} done`);
}

module.exports = { runSuite, results, HTML_PATH };
