# Sales Rep Variable Compensation Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate Sales Rep compensation calculator that visualizes four weighted hybrid KPI payouts and applies two capped qualifiers, then deploy it from a dedicated Apps Script bundle.

**Architecture:** Add a Sales Rep build target and isolated page/script fragments that reuse `Engine.hybridContext` and `Engine.hybridE` from the existing calculation engine. Keep the default simulator build unchanged apart from setting its editable hybrid T1 default to 80%; calculate and render the Sales Rep scenario entirely in the browser.

**Tech Stack:** Node.js build script, generated single-file HTML, vanilla JavaScript, Tailwind CSS CDN, Chart.js CDN, dependency-free Node test harness.

**Spec:** `docs/superpowers/specs/2026-09-24-sales-rep-calculator-design.md`

## Global Constraints

- Fixed salary defaults to €40,000.
- Old nominal defaults to €6,000 in fixed-euro mode and 15% in percent-of-salary mode.
- The editable minimum nominal defaults to €8,000.
- The new 100% nominal is `max(20% × fixed salary, minimum nominal, old nominal)`; the new curve pays twice that nominal at 200%.
- The Sales Rep hybrid curve uses zero threshold, T1 = 80%, T2 = 100%, and a 200% achievement cap; these settings are fixed in the Sales Rep app.
- Performance allocations are C2P Total 50%, C2P Price 20%, Dev 20%, and Churn 10%; each achievement slider ranges from 0% to 200% and defaults to 100%.
- Portfolio and Visits are independently capped at 100%, weighted 50/50, and default to 100%.
- Final payout is the sum of the weighted performance-KPI payouts multiplied by the qualifier multiplier.
- The Sales Rep app has a separate Apps Script deployment and URL; its calculator does not load population data, persist inputs, or send scenario inputs to a server.
- The existing simulator's hybrid T1 default changes from 85% to 80%, and its T1 control remains editable.
- `node build.js` must continue to build the root `index.html`; the Sales Rep target builds `dist/sales-rep/index.html` without replacing the root bundle.
- Preserve all unrelated existing workspace changes; do not overwrite or stage pre-existing files or changes outside this feature.

## File Map

- `build.js`: Preserve the current default/profile build and add Sales Rep HTML composition, CLI selection, separate output, and freshness check.
- `src/body-sales-rep.html`: Add the Sales Rep calculator's own body markup, controls, four chart canvases, result summary, and chart-error/status message.
- `src/js/sales-rep.js`: Define Sales Rep inputs and KPI weights, pure nominal/payout calculations, chart lifecycle, rendering, validation, and event bindings.
- `src/js/01-engine.js`: Continue to provide the shared hybrid curve; do not copy its calculation logic into the new app.
- `src/js/04-population.js`: Own CSV/population parsing helpers so the isolated Sales Rep bundle can reuse the curve engine without including population code.
- `src/js/03-advanced.js` and `src/body-advanced.html`: Change only the existing app's initial T1 state, label, slider value, and slider-track geometry.
- `tests/harness.js` and `tests/run.js`: Allow a suite to evaluate the Sales Rep bundle and exercise registered input handlers and multiple Chart instances.
- `tests/07-sales-rep.test.js`: Verify the Sales Rep build, calculation, defaults, independent controls, chart outputs, and payout updates.
- `tests/build-target.test.js`: Exercise the Sales Rep CLI build in a temporary output path and prove it does not change the root bundle.
- `tests/02-advanced-ui.test.js`: Verify the existing app starts at T1 = 80% and retains its editable range control.
- `README.md`: Document how to build and deploy the separate Sales Rep Apps Script app.

## Task 1: Add an Isolated Sales Rep Build Target

**Files:**
- Modify: `build.js`
- Modify: `src/js/04-population.js`
- Modify: `tests/harness.js`
- Modify: `tests/run.js`
- Create: `tests/build-target.test.js`
- Create: `src/body-sales-rep.html`
- Create: `src/js/sales-rep.js`
- Create: `tests/07-sales-rep.test.js`

**Interfaces:**
- `buildSalesRepString()` returns the complete, deterministic Sales Rep HTML bundle without writing any files.
- `runSuite(suiteFile, app = 'default')` evaluates the default app unless `app === 'sales-rep'`.
- `h.input(id, value)` sets an element's value and invokes its registered `input` handler.
- `h.change(id, value)` sets an element's value and invokes its registered `change` handler.

- [ ] **Step 1: Write a failing Sales Rep build test**

Add the initial `tests/07-sales-rep.test.js` suite with these assertions:

```js
module.exports = function suite(__h) {
  const { check, htmlSrc, buildSalesRepString } = __h;
  const salesRepHtml = buildSalesRepString();

  check('Sales Rep bundle has its own title',
    /<title>Sales Rep Variable Compensation Calculator<\/title>/.test(salesRepHtml));
  check('Sales Rep bundle has its own body and hybrid engine',
    /id="sales-rep-app"/.test(salesRepHtml) &&
    /hybridContext\(oldNomE, fixedE, targetSharePct/.test(salesRepHtml));
  check('Sales Rep bundle excludes population parsing, server calls, and persistence',
    !/parsePopulationCsv|google\.script\.run|localStorage|sessionStorage/.test(salesRepHtml));
  check('Sales Rep bundle excludes existing simulator views',
    !/id="view-(standard|advanced|matrix)"/.test(salesRepHtml));
  check('Sales Rep bundle is distinct from the default bundle',
    salesRepHtml !== htmlSrc);
};
```

Also add `tests/build-target.test.js` as a direct Node test:

```js
'use strict';
const assert = require('assert').strict;
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const buildPath = path.join(root, 'build.js');
const outputPath = path.join(os.tmpdir(), `sales-rep-build-${process.pid}.html`);
const originalIndex = fs.readFileSync(indexPath, 'utf8');

try {
  execFileSync(process.execPath, [
    buildPath, '--app=sales-rep', `--out=${outputPath}`
  ], { stdio: 'pipe' });
  const output = fs.readFileSync(outputPath, 'utf8');
  assert.notEqual(output, originalIndex, 'Sales Rep target must produce a distinct page');
  execFileSync(process.execPath, [
    buildPath, '--app=sales-rep', `--out=${outputPath}`, '--check'
  ], { stdio: 'pipe' });
  assert.equal(fs.readFileSync(indexPath, 'utf8'), originalIndex,
    'Sales Rep target must not modify root index.html');
  console.log('build-target.test.js: Sales Rep output remains separate');
} finally {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
}
```

The test uses Node's built-in modules only.

The suite must run in Sales Rep mode after the harness change in Step 4; before the
builder is implemented, it fails because `buildSalesRepString` is not exposed. The
CLI test fails because `--app=sales-rep` is not recognized.

- [ ] **Step 2: Run the targeted suite to verify it fails**

Run:

```text
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/07-sales-rep.test.js','sales-rep'); process.exitCode=results.fail?1:0"
```

Expected: fail because the Sales Rep builder, app-specific suite loading, and CLI
target do not exist yet.

- [ ] **Step 3: Separate the pure engine from population parsing and add bundle composition**

Move `isExcludedPopulationOrga` and `parsePopulationCsv` from `src/js/01-engine.js`
to `src/js/04-population.js` without changing their behavior. Keep the existing
default script order so population loading still finds those global functions.
Confirm the current population suite continues to cover CSV parsing.

In `build.js`, add a Sales Rep HTML composer that reads the shared `head.html`,
replaces only its page title, appends `body-sales-rep.html`, and injects a script
made from `src/js/01-engine.js` followed by `src/js/sales-rep.js`. Do not include
`00-state.js`, `00-profile.js`, `04-population.js`, existing view markup, or
`06-app.js` in the Sales Rep script. Add `--app=sales-rep` to select this output, with default path
`dist/sales-rep/index.html`; preserve the existing default `index.html` output and
support `--out=...` and `--check` for both targets. Reject unknown `--app` values
with an explicit nonzero error. Export `buildSalesRepString()` for tests.

Create the initial `src/body-sales-rep.html` with a `<body>` containing a root
`id="sales-rep-app"` and an app-specific footer. Create `src/js/sales-rep.js` as the
Sales Rep script fragment; it must not execute any DOM initialization outside its
own `DOMContentLoaded` handler.

- [ ] **Step 4: Add harness support and integrate the suite**

Update `tests/harness.js` so app mode selects the script from `buildSalesRepString()`,
while default mode retains the existing `concatJs()` behavior. Set `h.htmlSrc` to
the matching generated HTML, expose `h.buildSalesRepString`, retain each Chart
instance in `globalThis.__chartInstances`, and record event handlers on mock
elements. Implement `h.input(id, value)` and `h.change(id, value)` to call the
corresponding saved handler with `{ target: element }`.

Update `tests/run.js` to invoke only `07-sales-rep.test.js` with
`runSuite(path, 'sales-rep')`; all other suites continue using the default app.
Invoke `tests/build-target.test.js` directly with Node, and exclude it from automatic
suite discovery. Keep the existing default bundle freshness and Apps Script syntax
checks intact.

- [ ] **Step 5: Run the targeted test and build checks**

Run:

```text
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/07-sales-rep.test.js','sales-rep'); process.exitCode=results.fail?1:0"
node tests/build-target.test.js
node build.js --app=sales-rep --out=dist/sales-rep/index.html
node build.js --app=sales-rep --out=dist/sales-rep/index.html --check
```

Expected: the suite passes; the Sales Rep output is generated at the distinct path;
the check passes; the root `index.html` is byte-for-byte unchanged by the app-target
build test.

## Task 2: Implement Pure Sales Rep Compensation Calculations

**Files:**
- Modify: `src/js/sales-rep.js`
- Modify: `tests/07-sales-rep.test.js`

**Interfaces:**
- `SALES_REP_KPIS` is a constant list with `{ key, label, weight }` entries for all four performance KPIs.
- `salesRepOldNominalE(inputs = salesRepState)` returns the active old nominal in euros.
- `salesRepBuildCurveContext(inputs = salesRepState)` returns the context from `Engine.hybridContext`.
- `calculateSalesRepPayout(inputs = salesRepState)` returns `{ context, kpiPayouts, performanceSubtotal, qualifierMultiplier, finalPayout }`; each `kpiPayouts` item contains `{ key, achievement, weight, curvePayout, weightedPayout }`.

- [ ] **Step 1: Add calculation tests for defaults and curve boundaries**

Extend the suite with an explicit input fixture and expected weighted payouts:

```js
const rep = {
  fixedSalary: 40000,
  oldNominalMode: 'fixed',
  oldNominalFixedE: 6000,
  oldNominalPercent: 15,
  minNominalE: 8000,
  achievements: { c2pTotal: 100, c2pPrice: 100, dev: 100, churn: 100 },
  qualifiers: { portfolio: 100, visits: 100 }
};
const result = calculateSalesRepPayout(rep);

assertClose('new nominal uses the €8,000 floor', result.context.newNomE, 8000);
assertClose('200% nominal is twice the new nominal', result.context.val200E, 16000);
assertClose('70% remains on the old curve below T1', Engine.hybridE(70, result.context), 4200);
assertClose('80% uses the old nominal curve', Engine.hybridE(80, result.context), 4800);
assertClose('90% interpolates halfway through the transition', Engine.hybridE(90, result.context), 6400);
assertClose('100% reaches the new nominal', Engine.hybridE(100, result.context), 8000);
assertClose('110% follows the new curve above T2', Engine.hybridE(110, result.context), 8800);
assertClose('200% reaches twice the new nominal', Engine.hybridE(200, result.context), 16000);
assertClose('weighted KPI results sum to €8,000 at 100%', result.performanceSubtotal, 8000);
assertClose('all qualifiers at 100% preserve the subtotal', result.finalPayout, 8000);

const salaryFloor = calculateSalesRepPayout({ ...rep, fixedSalary: 50000 });
assertClose('20% salary floor dominates at €50,000 salary', salaryFloor.context.newNomE, 10000);
const grandfathered = calculateSalesRepPayout({
...rep, oldNominalFixedE: 12000
});
assertClose('old nominal above the floors is retained', grandfathered.context.newNomE, 12000);
```

Also assert the default performance allocations are exactly `[0.5, 0.2, 0.2, 0.1]`,
that a KPI's weighted result is its hybrid curve result times its weight, and that
percent mode at 15% of €40,000 yields a €6,000 old nominal.

- [ ] **Step 2: Run the Sales Rep suite to verify calculation failures**

Run the targeted suite command from Task 1.

Expected: the new calculations fail because the state, nominal, and payout functions
have not been implemented.

- [ ] **Step 3: Implement named model constants and pure calculations**

In `src/js/sales-rep.js`, define the four KPI records and a `salesRepState` with the
approved defaults. Resolve old nominal in euros from the selected mode, then build
the curve context using these exact shared-engine parameters:

```js
Engine.hybridContext(oldNominalE, fixedSalary, 20, minNominalE, 0, 0, 80, 100, 200)
```

Implement `calculateSalesRepPayout` without DOM reads or writes. For each KPI,
evaluate `Engine.hybridE(achievement, context)`, multiply that euro result by the
KPI weight, sum those weighted values, cap Portfolio and Visits individually at
100%, compute their 50/50 average as a fraction, then multiply the subtotal by that
fraction. Keep the salary-to-euro nominal resolution separate from rendering so
tests can supply the input object without a DOM.

- [ ] **Step 4: Verify curve, allocation, and nominal-mode tests**

Run the targeted Sales Rep suite.

Expected: the €8,000 floor, €16,000 200% nominal, each weighted KPI line, and the
€8,000 subtotal pass. Confirm the existing default simulator suite still passes:

```text
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/01-model.test.js'); process.exitCode=results.fail?1:0"
```

## Task 3: Add Independent KPI Charts, Qualifiers, and Reactive Results

**Files:**
- Modify: `src/body-sales-rep.html`
- Modify: `src/js/sales-rep.js`
- Modify: `tests/07-sales-rep.test.js`
- Modify: `tests/harness.js` (only if chart/input test support needs adjustment)

**Interfaces:**
- `initializeSalesRepCalculator()` binds controls, creates the four charts once, and renders current state.
- `updateSalesRepCalculator()` reads valid state, calls `calculateSalesRepPayout`, updates result labels, and refreshes existing chart instances.
- Chart IDs are `sr-chart-c2p-total`, `sr-chart-c2p-price`, `sr-chart-dev`, and `sr-chart-churn`.
- KPI achievement input IDs are `sr-achievement-c2p-total`, `sr-achievement-c2p-price`, `sr-achievement-dev`, and `sr-achievement-churn`.
- Qualifier input IDs are `sr-qualifier-portfolio` and `sr-qualifier-visits`; result IDs are `sr-performance-subtotal`, `sr-qualifier-multiplier`, and `sr-final-payout`.
- Weighted KPI output IDs are `sr-payout-c2p-total`, `sr-payout-c2p-price`, `sr-payout-dev`, and `sr-payout-churn`.
- Validation and chart dependency messages use `sr-validation-message` and `sr-chart-status`.

- [ ] **Step 1: Add failing UI and interaction assertions**

Extend `tests/07-sales-rep.test.js` to invoke `__domReadyHandler()` and verify:

```js
const { check, els, assertClose, htmlSrc, buildSalesRepString } = __h;
const h = __h;
const uiReady = typeof __domReadyHandler === 'function';
check('Sales Rep app registers DOM initialization', uiReady);

if (uiReady) {
__domReadyHandler();
check('four KPI charts initialize independently', __chartInstances.length === 4);
check('salary and nominal controls use approved defaults',
  els['sr-fixed-salary'].value === '40000' &&
  els['sr-old-nominal-mode'].value === 'fixed' &&
  els['sr-old-nominal-fixed'].value === '6000' &&
  els['sr-old-nominal-percent'].value === '15' &&
  els['sr-min-nominal'].value === '8000');
check('four KPI sliders default to 100%',
  ['c2p-total', 'c2p-price', 'dev', 'churn'].every(key =>
    els[`sr-achievement-${key}`].value === '100'));
check('two qualifier sliders default to 100%',
  els['sr-qualifier-portfolio'].value === '100' &&
  els['sr-qualifier-visits'].value === '100');
check('KPI and qualifier slider bounds are present in markup',
  ['c2p-total', 'c2p-price', 'dev', 'churn'].every(key =>
    new RegExp(`type="range" id="sr-achievement-${key}" min="0" max="200"`).test(h.htmlSrc)) &&
  ['portfolio', 'visits'].every(key =>
    new RegExp(`type="range" id="sr-qualifier-${key}" min="0" max="100"`).test(h.htmlSrc)));
assertClose('C2P Total chart plots its weighted €4,000 at 100%',
  __chartInstances[0].data.datasets[0].data[100], 4000);

h.input('sr-fixed-salary', '50000');
h.input('sr-old-nominal-percent', '15');
h.change('sr-old-nominal-mode', 'percent');
assertClose('percentage mode derives old nominal from salary', salesRepOldNominalE(), 7500);
h.change('sr-old-nominal-mode', 'fixed');
h.input('sr-fixed-salary', '40000');

const initialFinalPayout = els['sr-final-payout'].innerText;
const initialC2PTotal = els['sr-payout-c2p-total'].innerText;
h.input('sr-achievement-c2p-total', '200');
check('changing one KPI updates its weighted line item and total',
  els['sr-payout-c2p-total'].innerText !== initialC2PTotal &&
  els['sr-final-payout'].innerText !== initialFinalPayout);
check('other KPI sliders remain independent',
  els['sr-achievement-c2p-price'].value === '100');

h.input('sr-qualifier-portfolio', '120');
h.input('sr-qualifier-visits', '80');
assertClose('qualifiers are individually capped before averaging',
  calculateSalesRepPayout().qualifierMultiplier, 0.9);
const finalBeforeInvalid = calculateSalesRepPayout().finalPayout;
h.input('sr-fixed-salary', '');
assertClose('empty salary preserves the last valid calculation',
  calculateSalesRepPayout().finalPayout, finalBeforeInvalid);
h.input('sr-fixed-salary', '-1');
assertClose('negative salary preserves the last valid calculation',
  calculateSalesRepPayout().finalPayout, finalBeforeInvalid);
check('invalid input displays an inline message',
  els['sr-validation-message'].innerText.length > 0);
}
```

The mode check distinguishes percentage mode from the default €6,000 fixed nominal.
Switch back to fixed mode and restore salary to €40,000 before capturing
`initialFinalPayout` and `initialC2PTotal`; the final assertions verify that both
empty and negative salary inputs preserve the last valid payout and show a message.

- [ ] **Step 2: Run the targeted suite to confirm UI failures**

Run the targeted Sales Rep suite.

Expected: the suite fails because the controls, chart instances, event updates, and
validation message have not been added.

- [ ] **Step 3: Add Sales Rep controls and outputs**

In `src/body-sales-rep.html`, add:

- Fixed salary input `sr-fixed-salary` defaulting to `40000`.
- Old nominal mode selector `sr-old-nominal-mode` with `fixed` and `percent` options;
  fixed nominal input `sr-old-nominal-fixed` defaulting to `6000`; percentage input
  `sr-old-nominal-percent` defaulting to `15`.
- Minimum nominal input `sr-min-nominal` defaulting to `8000`.
- One slider and one canvas for each KPI, with the IDs defined in the Interfaces
  section; label each chart with its KPI allocation.
- Portfolio and Visits sliders with 0–100 bounds, initial value 100, and visible
  50% weight labels.
- A line-item result for each weighted KPI, plus subtotal, qualifier multiplier,
  final payout, and `sr-validation-message` / `sr-chart-status` elements that are
  hidden until an error needs to be shown.

Reuse the project's shared `head.html` for Tailwind, fonts, and Chart.js; do not add
the existing simulator navigation, population panels, Matrix, or `google.script.run`
calls.

- [ ] **Step 4: Bind validated inputs and update the four charts**

In `src/js/sales-rep.js`, implement `initializeSalesRepCalculator()` and
`updateSalesRepCalculator()`. Register input/change handlers for salary, both old
nominal modes, minimum nominal, all KPI achievement sliders, and both qualifiers.
For numeric text inputs, accept only finite non-negative values; on empty or invalid
input, preserve the last valid state, mark the input invalid, and show the inline
message without changing the calculated amount.

Initialize one Chart.js line chart per KPI. For each chart, plot integer achievement
labels from 0 through 200 and `Engine.hybridE(x, context) * weight` as the weighted
euro curve; add a point dataset for the current slider achievement. Reuse each
instance on updates rather than creating charts repeatedly. When `Chart` is
unavailable, show an explicit chart-status error while still displaying calculated
amounts; do not substitute another curve.

Render all four weighted line items, the performance subtotal, the capped 50/50
qualifier multiplier, and the final payout after each valid input event. Do not
write scenario state to storage or call Apps Script.

- [ ] **Step 5: Verify UI, charts, and recalculation**

Run:

```text
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/07-sales-rep.test.js','sales-rep'); process.exitCode=results.fail?1:0"
```

Expected: four independent charts initialize once; controls have the approved
defaults and bounds; changing one KPI updates its weighted result without changing
the other KPI sliders; qualifier inputs above 100% are capped before averaging; and
invalid text input leaves the last valid total visible with an error message.

## Task 4: Change the Existing Hybrid T1 Default to 80%

**Files:**
- Modify: `src/js/03-advanced.js`
- Modify: `src/body-advanced.html`
- Modify: `tests/02-advanced-ui.test.js`

**Interfaces:**
- Existing `advState.t1` starts at `80`.
- Existing `adv-dual-t1` remains a `type="range"` input from 0 through 200 and starts at `80`.
- The initial T1 label and track segment represent 80% with the existing T2 = 100%.

- [ ] **Step 1: Add a failing default-value regression test**

At the start of `tests/02-advanced-ui.test.js`, after `setView('advanced')`, add:

```js
check('hybrid T1 defaults to 80% and remains editable',
  advState.t1 === 80 &&
  /type="range" id="adv-dual-t1" min="0" max="200" step="1" value="80"/.test(htmlSrc) &&
  /id="adv-val-t1"[^>]*>80%<\/span>/.test(htmlSrc) &&
  /id="adv-dual-track"[^>]*style="left:40%; width:10%"/.test(htmlSrc));
```

- [ ] **Step 2: Run the advanced suite to verify it fails**

Run:

```text
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/02-advanced-ui.test.js'); process.exitCode=results.fail?1:0"
```

Expected: the test fails while `advState.t1` and the slider markup still default to
85%.

- [ ] **Step 3: Change only the existing T1 defaults**

Set `advState.t1` to `80` in `src/js/03-advanced.js`. In `src/body-advanced.html`,
change the initial T1 display label and `adv-dual-t1` value to `80`, and update the
initial dual-slider track from left 42.5% / width 7.5% to left 40% / width 10%.
Keep the slider's `type`, 0–200 range, event binding, and T2 default unchanged.

- [ ] **Step 4: Run the advanced and model suites**

Run:

```text
node build.js
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/02-advanced-ui.test.js'); process.exitCode=results.fail?1:0"
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/01-model.test.js'); process.exitCode=results.fail?1:0"
```

Expected: the 80% default and editable markup assertion passes, and the existing
curve/interpolation behavior remains unchanged.

## Task 5: Document Deployment and Verify Both App Builds

**Files:**
- Modify: `README.md`
- Verify: `build.js`, `tests/run.js`, `index.html`, `dist/sales-rep/index.html`

- [ ] **Step 1: Document the new build and deployment**

Add a README section that documents `node build.js --app=sales-rep`, the output
`dist/sales-rep/index.html`, and how to copy that file into a separate Apps Script
project as HTML file `index`, configure the separate project's `Code.gs` using the
existing deployment/access-gate instructions, and deploy it as a distinct Web App.
State that the calculator has no population loading or scenario persistence. Keep
the existing deployment instructions unchanged.

- [ ] **Step 2: Rebuild and freshness-check both outputs**

Before writing either generated output, inspect the current `index.html` diff and any
existing `dist/sales-rep/index.html`; confirm the root file is the generated bundle
for the current split source, and preserve unrelated files in the pre-existing
untracked `dist/` tree. Then run:

```text
node build.js
node build.js --check
node build.js --app=sales-rep
node build.js --app=sales-rep --check
```

Expected: the root bundle remains the default simulator, the separate Sales Rep
bundle is written only to `dist/sales-rep/index.html`, and both freshness checks
pass.

- [ ] **Step 3: Run the full repository test suite**

Run:

```text
node tests/run.js
```

Expected: the default bundle freshness check, Apps Script syntax check, access
tests, existing UI/model suites, and new Sales Rep suite all pass.

- [ ] **Step 4: Review the final diff for scope and user-owned changes**

Inspect `git diff --` for each feature file and `git status --short`. Confirm the
Sales Rep bundle and source are separate from the existing default build, no
population loading or persistence was introduced, the only existing-app behavior
change is T1 defaulting to 80%, and unrelated worktree changes remain untouched.
