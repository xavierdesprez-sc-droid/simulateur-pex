# Sales Rep Quarterly Payout Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Sales Rep calculator into a quarterly tracker: Q1–Q3 each pay a quarter of the annual payout computed from that quarter's results, and a Q4 year-end tab computes the annual payout from full-year results and pays the remainder (floored at 0), with automatic browser persistence.

**Architecture:** The calculation stays in `src/js/sales-rep.js` on top of the existing hybrid engine (`01-engine.js`). Each period (`q1`, `q2`, `q3`, `fy`) holds its own achievements, qualifiers and an `entered` flag. One set of KPI and qualifier controls is re-bound to the active tab, so the markup keeps its existing IDs. A versioned `localStorage` entry saves the full state. Persistence functions take an injected storage object so they can be tested without a browser.

**Tech Stack:** Vanilla JavaScript in the generated single-file page, Tailwind and Chart.js from CDN, Node built-in test harness (`tests/harness.js`, simulated DOM), ESLint via `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-10-21-sales-rep-quarterly-design.md` (decisions, and the calls the user approved). Its predecessor is `docs/superpowers/specs/2026-09-24-sales-rep-calculator-design.md`. Where the predecessor said the Sales Rep page "does not persist inputs", the quarterly spec supersedes it.

## Global Constraints

- Hybrid curve: threshold 0 (`SALES_REP_PERFORMANCE_THRESHOLD = 40` as today), T1 = 80, T2 = 100, cap 200. Unchanged.
- KPI weights exactly: C2P Total 0.5, C2P Price 0.2, Dev 0.2, Churn 0.1 (`SALES_REP_KPIS`). Unchanged.
- Qualifiers: Portfolio and Visits, each capped at 100 individually, averaged 50/50. Unchanged.
- Annual payout: `performanceSubtotal × qualifierMultiplier` (existing `calculateSalesRepPayout(...).finalPayout`).
- Q1, Q2, Q3 payment: `annualPayout(period inputs) / 4`.
- Q4 payment: `max(0, annualPayout(fy inputs) − (Q1 payment + Q2 payment + Q3 payment))`, where a period not entered counts as 0 in the sum.
- A period is **entered** once one of its values has been changed by the user. Until then its payment shows `—`. Untouched defaults never count toward the paid total.
- Persistence key: `sales-rep-quarterly-v1`. Stored JSON contains `version: 1`.
- The page's UI copy stays in English, like the existing Sales Rep page. (Ruling: the spec's French labels were a planning shorthand; the page is English.)
- Sales Rep page must not call `google.script.run`, use `sessionStorage`, or parse population CSVs. `localStorage` is now allowed, and only for the quarterly state.
- Edit only `src/**` and `tests/**`. Do not hand-edit `index.html` or `dist/`.

## Review Focus

1. An empty or invalid numeric input keeps the last valid value and does not mark the period as entered. (Owned by Task 4.)
2. Q4 with a full-year payout below the amount already paid pays exactly 0, never a negative number. (Owned by Task 1.)
3. An untouched Q1–Q3 period does not reduce the Q4 payment. (Owned by Task 1 and Task 4.)
4. A missing, corrupt, or wrong-version stored value loads the defaults without throwing. (Owned by Task 2.)
5. `localStorage` that throws on read or write leaves the calculator working and shows a message. (Owned by Task 2 and Task 4.)
6. Switching tabs does not leak values between periods. (Owned by Task 4.)

---

## File Structure

- Modify: `src/js/sales-rep.js` — period state, quarter/Q4 calculation helpers, persistence helpers, tab controller, recap rendering.
- Modify: `src/body-sales-rep.html` — tab bar, active-period label, reset button, recap table, Q4 summary block, storage message element.
- Modify: `tests/harness.js` — expose an in-memory `window.localStorage` mock for the sales-rep suite, with a switch to make it throw.
- Modify: `tests/07-sales-rep.test.js` — update the existing assertions for the new state shape, add tests for each task.
- Modify: `.gitignore` — add `.superpowers/`.

No new source files. The single script file keeps the existing build order (`SALES_REP_JS_PARTS` in `build.js` is unchanged).

---

### Task 1: Period state and quarterly calculation helpers

**Files:**
- Modify: `src/js/sales-rep.js` (lines 11–27 state, 59–85 calculation remain as building blocks)
- Modify: `tests/07-sales-rep.test.js`

**Interfaces:**
- Consumes: existing `calculateSalesRepPayout(inputs)`, `salesRepNonNegative`, `salesRepOldNominalE`, `SALES_REP_KPIS`.
- Produces:
  - `const SALES_REP_PERIODS = ['q1', 'q2', 'q3', 'fy'];`
  - `function salesRepDefaultPeriod() → { entered: false, achievements: { c2pTotal: 100, c2pPrice: 100, dev: 100, churn: 100 }, qualifiers: { portfolio: 100, visits: 100 } }`
  - `salesRepState` keeps the compensation fields (`fixedSalary`, `oldNominalMode`, `oldNominalFixedE`, `oldNominalPercent`, `minNominalE`) and replaces top-level `achievements`/`qualifiers` with `periods: { q1, q2, q3, fy }`, each from `salesRepDefaultPeriod()`.
  - `function salesRepAnnualPayout(period, shared = salesRepState) → number` — `calculateSalesRepPayout({ ...shared, achievements: period.achievements, qualifiers: period.qualifiers }).finalPayout`.
  - `function salesRepQuarterPayment(period, shared = salesRepState) → number` — `period.entered ? salesRepAnnualPayout(period, shared) / 4 : 0`. Callers that display an unentered period show `—` instead; this function returns 0 for an unentered period.
  - `function salesRepPaidBeforeQ4(state = salesRepState) → number` — sum of `salesRepQuarterPayment` over `q1`, `q2`, `q3`.
  - `function salesRepQ4Payment(state = salesRepState) → number` — `0` if `state.periods.fy.entered` is false; otherwise `Math.max(0, salesRepAnnualPayout(state.periods.fy, state) − salesRepPaidBeforeQ4(state))`.
  - `calculateSalesRepPayout(inputs)` keeps its signature. Its `inputs.achievements` and `inputs.qualifiers` are unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `tests/07-sales-rep.test.js` (before the `uiReady` block). Adjust the existing defaults assertion (line 80–87) to read `salesRepState.periods`.

Write these checks with literal expected values, and verify each expected value against the engine before trusting it:

- `rep` (defaults: salary 40,000, old nominal 6,000, floor 8,000). A full-year period at 100% on all KPIs with qualifiers 100/100 gives an annual payout of 8,000, so a Q1 at 100% pays 2,000.
- Q4 with Q1, Q2, Q3 all entered at 100% and FY at 100% pays `8000 − 3×2000 = 2000`.
- Q1 and Q2 entered at 100%, Q3 untouched, FY at 100%: Q4 pays `8000 − 2×2000 = 4000`. The untouched Q3 adds 0.
- Q1 entered at 200% on all KPIs (annual 16,000, quarter 4,000), Q2 and Q3 untouched, FY at 100% (annual 8,000): Q4 pays `max(0, 8000 − 4000) = 4000`.
- Same Q1 as above, FY qualifiers `{ portfolio: 0, visits: 0 }` (annual 0): Q4 pays `max(0, 0 − 4000) = 0`. This is the zero-floor case.
- Q1 entered, FY untouched: Q4 pays 0.

Each scenario is an explicit `check(...)` or `assertClose(...)` with its literal expected number.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/07-sales-rep.test.js','sales-rep'); process.exitCode=results.fail?1:0"`
Expected: FAIL — `salesRepAnnualPayout is not defined` (or similar ReferenceError), because the helpers do not exist yet.

- [ ] **Step 3: Implement the helpers in `src/js/sales-rep.js`**

Replace the top-level `achievements` and `qualifiers` in `salesRepState` with `periods`, using `salesRepDefaultPeriod()`. Add the helpers listed under Interfaces, directly after `calculateSalesRepPayout`. Do not change `calculateSalesRepPayout`'s body.

The existing UI still reads `salesRepState.achievements` and `salesRepState.qualifiers` (`updateSalesRepCalculator`, `salesRepBindSlider`, `initializeSalesRepCalculator`). Point those at the active period in Task 4. For Task 1, keep the page working by defaulting the UI to `salesRepState.periods.q1`: change those references to `salesRepState.periods.q1.achievements` and `.qualifiers`, and make `updateSalesRepCalculator` call `calculateSalesRepPayout({ ...salesRepState, ...salesRepState.periods.q1 })`. Task 4 replaces this temporary wiring.

- [ ] **Step 4: Run the suite to verify it passes**

Run: the same command as Step 2.
Expected: PASS, with all checks from the previous suite still green, after updating the defaults assertion to `salesRepState.periods`.

- [ ] **Step 5: Commit**

```bash
git add src/js/sales-rep.js tests/07-sales-rep.test.js
git commit -m "feat(sales-rep): add quarterly period state and payout helpers"
```

---

### Task 2: Versioned persistence

**Files:**
- Modify: `src/js/sales-rep.js`
- Modify: `tests/harness.js`
- Modify: `tests/07-sales-rep.test.js`

**Interfaces:**
- Consumes: `salesRepState`, `salesRepDefaultPeriod`, `SALES_REP_PERIODS` from Task 1.
- Produces:
  - `const SALES_REP_STORAGE_KEY = 'sales-rep-quarterly-v1';`
  - `function salesRepSerialize(state = salesRepState) → string` — JSON with `version: 1`, the five compensation fields, and `periods` (each period's `entered`, `achievements`, `qualifiers`).
  - `function salesRepDeserialize(text) → object | null` — returns a fully sanitized state, or `null` when the text is not JSON, `version !== 1`, or `periods` is missing. Per-field rules: a non-finite or negative number falls back to the default for that field; achievements are clamped to 0–200; qualifiers are clamped to 0–100; `entered` must be a boolean, else `false`. A missing period falls back to `salesRepDefaultPeriod()`.
  - `function salesRepSaveState(storage, state = salesRepState) → boolean` — `storage.setItem(SALES_REP_STORAGE_KEY, salesRepSerialize(state))`, wrapped in try/catch; returns `false` on error.
  - `function salesRepLoadState(storage) → object | null` — `storage.getItem(...)` then `salesRepDeserialize`, wrapped in try/catch; returns `null` on error.
  - In the harness: `window.localStorage` is an in-memory object with `getItem`, `setItem`, `removeItem`, and a `__fail` flag. When `__fail` is true, reads and writes throw. Suites reach it as `__h.storage`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/07-sales-rep.test.js`. Use `__h.storage` (added in Step 3).

```js
const stored = salesRepSerialize({ ...salesRepState });
check('serialized state carries version 1 and the storage key is versioned',
  JSON.parse(stored).version === 1 && SALES_REP_STORAGE_KEY === 'sales-rep-quarterly-v1');
check('round-trip restores periods, entry flags and compensation inputs',
  (() => {
    const back = salesRepDeserialize(stored);
    return back && back.fixedSalary === salesRepState.fixedSalary &&
      back.periods.q1.entered === false &&
      back.periods.fy.achievements.c2pTotal === 100;
  })());
check('corrupt JSON loads as null without throwing', salesRepDeserialize('{not json') === null);
check('wrong version loads as null', salesRepDeserialize(JSON.stringify({ version: 2, periods: {} })) === null);
check('out-of-range achievements are clamped to 0–200',
  salesRepDeserialize(JSON.stringify({ version: 1, periods: { q1: { entered: true, achievements: { c2pTotal: 999 }, qualifiers: { portfolio: 500 } } } })).periods.q1.achievements.c2pTotal === 200);
check('a non-boolean entered flag becomes false',
  salesRepDeserialize(JSON.stringify({ version: 1, periods: { q1: { entered: 'yes' } } })).periods.q1.entered === false);
check('a save that throws returns false instead of crashing',
  (() => { __h.storage.__fail = true; const ok = salesRepSaveState(__h.storage); __h.storage.__fail = false; return ok === false; })());
check('a load that throws returns null instead of crashing',
  (() => { __h.storage.__fail = true; const v = salesRepLoadState(__h.storage); __h.storage.__fail = false; return v === null; })());
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/07-sales-rep.test.js','sales-rep'); process.exitCode=results.fail?1:0"`
Expected: FAIL — `salesRepSerialize is not defined`, and `__h.storage` is undefined.

- [ ] **Step 3: Implement**

In `tests/harness.js`, inside `runSuite`, before `const h = {`: create `const storage = { __fail: false, __data: {}, getItem(k) { if (this.__fail) throw new Error('storage blocked'); return k in this.__data ? this.__data[k] : null; }, setItem(k, v) { if (this.__fail) throw new Error('storage blocked'); this.__data[k] = String(v); }, removeItem(k) { delete this.__data[k]; } };`. Set `global.window.localStorage = storage;`. Add `storage` to `h`.

In `src/js/sales-rep.js`, add the functions listed under Interfaces. Use `JSON.parse` in `salesRepDeserialize` inside a try/catch that returns `null`. Use the existing `salesRepNonNegative` for numbers and `Math.min`/`Math.max` for clamping.

Do not reference `localStorage` as a bare global. Persistence receives `storage` as a parameter; the page passes `window.localStorage` in Task 4.

- [ ] **Step 4: Run the suite to verify it passes**

Run: the same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/sales-rep.js tests/harness.js tests/07-sales-rep.test.js
git commit -m "feat(sales-rep): add versioned local persistence helpers"
```

---

### Task 3: Quarterly markup

**Files:**
- Modify: `src/body-sales-rep.html`
- Modify: `tests/07-sales-rep.test.js`

**Interfaces:**
- Consumes: existing IDs (`sr-fixed-salary`, `sr-achievement-*`, `sr-qualifier-*`, `sr-payout-*`, `sr-summary-*`, `sr-chart-*`, `sr-performance-subtotal`, `sr-qualifier-multiplier`, `sr-final-payout`, `sr-final-payout-percent`, `sr-validation-message`, `sr-chart-status`).
- Produces (new IDs; each appears exactly once in the page):
  - Tab buttons `sr-tab-q1`, `sr-tab-q2`, `sr-tab-q3`, `sr-tab-fy`, each with `data-period="q1"` / `q2` / `q3` / `fy`, inside an element with `role="tablist"`.
  - `sr-period-label`: text naming the active period (e.g. "Q2 results" or "Full-year results (Q4 catch-up)").
  - `sr-reset-period`: a `<button type="button">` labelled "Reset this quarter".
  - `sr-storage-status`: a hidden `role="status"` paragraph for the storage message, same pattern as `sr-chart-status`.
  - Recap table `sr-recap` with rows having cells `sr-recap-q1-payment`, `sr-recap-q2-payment`, `sr-recap-q3-payment`, `sr-recap-q4-payment` and `sr-recap-q1-status`…`sr-recap-q4-status` (text `Entered` or `Not entered`), and `sr-recap-total` (sum of the entered payments).
  - Q4 summary block: `sr-q4-annual-payout`, `sr-q4-already-paid`, `sr-q4-payment`, `sr-year-total`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/07-sales-rep.test.js` near the markup checks at the top (after the `Sales Rep bundle excludes existing simulator views` check). Use `salesRepHtml`. Also update the persistence assertion (line 12–13): `localStorage` is now allowed, so replace it with `!/parsePopulationCsv|google\.script\.run|sessionStorage/`.

```js
const requiredIds = ['sr-tab-q1', 'sr-tab-q2', 'sr-tab-q3', 'sr-tab-fy', 'sr-period-label', 'sr-reset-period',
  'sr-storage-status', 'sr-recap', 'sr-recap-q1-payment', 'sr-recap-q2-payment', 'sr-recap-q3-payment',
  'sr-recap-q4-payment', 'sr-recap-q1-status', 'sr-recap-q2-status', 'sr-recap-q3-status', 'sr-recap-q4-status',
  'sr-recap-total', 'sr-q4-annual-payout', 'sr-q4-already-paid', 'sr-q4-payment', 'sr-year-total'];
check('quarterly markup declares every new id exactly once',
  requiredIds.every(id => (salesRepHtml.match(new RegExp(`id="${id}"`, 'g')) || []).length === 1));
check('tab buttons carry their period and sit in a tablist',
  ['q1', 'q2', 'q3', 'fy'].every(p => new RegExp(`id="sr-tab-${p}"[^>]*data-period="${p}"`).test(salesRepHtml)) &&
  /role="tablist"/.test(salesRepHtml));
check('no existing KPI or qualifier id is duplicated',
  ['c2p-total', 'c2p-price', 'dev', 'churn'].every(k => (salesRepHtml.match(new RegExp(`id="sr-achievement-${k}"`, 'g')) || []).length === 1));
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: the same command as before. Expected: FAIL on the new markup checks.

- [ ] **Step 3: Implement the markup in `src/body-sales-rep.html`**

- Insert after the page header (`</header>`) a `<nav>` with `role="tablist"`, four `<button>` elements (labels `Q1`, `Q2`, `Q3`, `Q4 year-end`), each with `id="sr-tab-<p>"`, `data-period="<p>"`, `role="tab"`, and `aria-selected="false"` (the controller sets it). Use Tailwind classes consistent with the page's indigo accents.
- Insert under the tab bar a line with `<p id="sr-period-label">`, and the `sr-reset-period` button beside it.
- Keep every existing KPI card and qualifier control unchanged. They now apply to the active period.
- Add `<p id="sr-storage-status" class="mt-3 hidden text-sm text-red-600" role="status"></p>` after the validation message.
- Add a new `<section>` after the existing payout summary with the recap table (`sr-recap`, one row per quarter with `sr-recap-q<n>-status`, `sr-recap-q<n>-payment`, a total row with `sr-recap-total`) and the Q4 block (`sr-q4-annual-payout`, `sr-q4-already-paid`, `sr-q4-payment`, `sr-year-total`). Hide the Q4 block except on the Q4 tab, or leave it visible; the controller decides. The markup only declares the IDs.
- Rename the existing `Payout summary` heading text's helper paragraph to say it reflects the active period, and rename `Percentage of new nominal` to `Percentage of annual new nominal`. Update the existing test at line 196–198 to match.

- [ ] **Step 4: Run the suite to verify it passes**

Run: the same command as before. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/body-sales-rep.html tests/07-sales-rep.test.js
git commit -m "feat(sales-rep): add quarterly tabs, recap and Q4 markup"
```

---

### Task 4: Tab controller, entry tracking, recap and autosave

**Files:**
- Modify: `src/js/sales-rep.js`
- Modify: `tests/07-sales-rep.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–3, plus `window.localStorage` (passed as `storage`).
- Produces:
  - `let salesRepActivePeriod = 'q1';`
  - `function salesRepSelectPeriod(key)` — sets `salesRepActivePeriod`, writes the active period's values into the KPI and qualifier controls and their output labels, updates `sr-period-label`, the `aria-selected` attribute on the tab buttons, and calls `updateSalesRepCalculator()`.
  - `function salesRepMarkEntered()` — sets `salesRepState.periods[salesRepActivePeriod].entered = true`, called by every control handler.
  - `function salesRepResetPeriod()` — replaces the active period with `salesRepDefaultPeriod()`, re-applies it to the controls, saves, and recalculates.
  - `function salesRepPersist()` — calls `salesRepSaveState(window.localStorage, salesRepState)` through a try/catch-free wrapper; if it returns `false`, shows `sr-storage-status` with `Changes are not saved in this browser.`; otherwise hides it.
  - `updateSalesRepCalculator()` — computes the active period's result as `calculateSalesRepPayout({ ...salesRepState, ...period })`. Displays:
    - KPI weighted payouts and summary lines: the annual weighted value, divided by 4 for `q1`–`q3`. Show `—` when the active period is not entered.
    - `sr-final-payout`: the quarter payment for `q1`–`q3`, `—` if not entered; the Q4 payment for `fy`, `—` if not entered.
    - `sr-final-payout-percent`: annual payout ÷ `newNomE`, as today. Show `—` when `newNomE` is 0.
    - Recap: `sr-recap-q<n>-payment`, `sr-recap-q<n>-status`, `sr-recap-total` (sum of entered quarter payments), using `salesRepQuarterPayment` and `salesRepQ4Payment`.
    - Q4 block: `sr-q4-annual-payout` (annual payout of `fy`, `—` if not entered), `sr-q4-already-paid` (`salesRepPaidBeforeQ4`), `sr-q4-payment` (`salesRepQ4Payment`), `sr-year-total` (`max(paid, annual)` when fy is entered, else paid).
  - Charts stay on the annual curve; the point is the active period's achievement.
  - Initialization: `initializeSalesRepCalculator` loads state with `salesRepLoadState(window.localStorage)` (try/catch; `null` means defaults), replaces `salesRepState` fields with the loaded ones, then selects `q1`. If `window.localStorage` access throws, show the storage message.
  - Existing validation keeps its behaviour. A rejected numeric value does not call `salesRepMarkEntered` or persist.

- [ ] **Step 1: Write the failing tests**

Add to `tests/07-sales-rep.test.js` inside the `if (uiReady)` block. Add the new checks after the existing ones; the existing scenario sequence is unchanged in order, so keep the reset of inputs before new checks.

Add a helper at the top of the `if (uiReady)` block: `const clickTab = p => els[`sr-tab-${p}`].__handlers.click({ target: els[`sr-tab-${p}`] });`. The tab buttons are bound with `click` listeners in `initializeSalesRepCalculator`, so the DOM mock dispatches them through `__handlers.click`.

The DOM mock supports `addEventListener` with `__handlers`. Tabs are bound in `initializeSalesRepCalculator` with `click` listeners. Trigger them with `els['sr-tab-q2'].__handlers.click({ target: els['sr-tab-q2'] })`. Add a helper in the suite: `const clickTab = p => els[`sr-tab-${p}`].__handlers.click({ target: els[`sr-tab-${p}`] });`.

Checks to add (each as `check(...)` with explicit numbers):

```js
clickTab('q2');
check('switching to Q2 shows Q2 defaults and no value leaks from Q1', els['sr-achievement-c2p-total'].value === '100' && salesRepState.periods.q2.achievements.c2pTotal === 100);
check('Q2 is not entered until the user changes it', salesRepState.periods.q2.entered === false && els['sr-recap-q2-status'].innerText === 'Not entered');
h.input('sr-achievement-c2p-total', '120');
check('changing a value marks the active period entered', salesRepState.periods.q2.entered === true);
check('the Q2 recap shows its quarter payment', els['sr-recap-q2-payment'].innerText !== '—');
clickTab('q1');
check('returning to Q1 restores its own values', salesRepState.periods.q1.achievements.c2pTotal === 100 && els['sr-achievement-c2p-total'].value === '100');
```

Add the Q4 cases (switch to `fy`, enter values; check `sr-q4-payment`):

```js
clickTab('fy');
h.input('sr-qualifier-visits', '0');  // full-year qualifier at 0 drives annual payout to 0
check('Q4 payment is floored at zero when the year is below the amount already paid', els['sr-q4-payment'].innerText === '€0');
```

Also: reset button clears entry; storage failure shows message:

```js
clickTab('q2');
els['sr-reset-period'].__handlers.click({ target: els['sr-reset-period'] });
check('reset returns the period to defaults and not entered', salesRepState.periods.q2.entered === false && salesRepState.periods.q2.achievements.c2pTotal === 100);
__h.storage.__fail = true;
h.input('sr-achievement-dev', '90');
check('a blocked storage shows a message and the calculator keeps working', els['sr-storage-status'].innerText.length > 0 && els['sr-final-payout'].innerText !== '');
__h.storage.__fail = false;
```

Also a persistence reload check: in a separate fresh page (the harness re-evaluates the script per suite), use `__h.storage.__data` after a change: `JSON.parse(__h.storage.__data['sales-rep-quarterly-v1']).periods.q2.entered === true`. The test should reuse the same storage object; since the page is loaded once per suite, the reload check is done by calling `initializeSalesRepCalculator()` again, which must read the stored state. Assert that `salesRepState.periods.q2.achievements.dev === 90` after `initializeSalesRepCalculator()` re-runs with storage holding that value. Reset `__h.storage.__data` after.

- [ ] **Step 2: Run the suite to verify it fails**

Run: the same command as before. Expected: FAIL on the new tab, recap, Q4 and storage checks.

- [ ] **Step 3: Implement the controller in `src/js/sales-rep.js`**

- Replace the temporary Task 1 wiring: `updateSalesRepCalculator` reads the active period, and the slider and qualifier handlers write into `salesRepState.periods[salesRepActivePeriod]`, then call `salesRepMarkEntered()`, `updateSalesRepCalculator()`, and `salesRepPersist()`.
- Compensation input handlers (`salesRepBindNumber`, mode change) also call `salesRepPersist()` after a valid value. Invalid values do not persist.
- Bind tab buttons with `addEventListener('click', ...)` calling `salesRepSelectPeriod(button.dataset.period)`. Bind `sr-reset-period` to `salesRepResetPeriod`.
- Keep `salesRepRefreshCharts` as it is, except that it receives the result of the active period and reads the achievement from `salesRepState.periods[salesRepActivePeriod]`.
- Keep the display formatting helper `salesRepFormatE` and the `—` convention.

- [ ] **Step 4: Run the suite to verify it passes**

Run: the same command as before. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/sales-rep.js tests/07-sales-rep.test.js tests/harness.js
git commit -m "feat(sales-rep): wire quarterly tabs, recap and autosave"
```

---

### Task 5: Build verification and housekeeping

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the finished Sales Rep page from Tasks 1–4.
- Produces: a green Sales Rep suite, lint, and a regenerated `dist/sales-rep/index.html` (ignored by git; not committed).

- [ ] **Step 1: Add the ignore entry**

Append `.superpowers/` to `.gitignore` (one line, matching the existing style of the file).

- [ ] **Step 2: Run the Sales Rep suite**

Run: `node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/07-sales-rep.test.js','sales-rep'); process.exitCode=results.fail?1:0"`
Expected: exit code 0, no `FAIL:` lines.

- [ ] **Step 3: Build and check the Sales Rep bundle**

Run: `node build.js --app=sales-rep` then `node build.js --app=sales-rep --check`.
Expected: `build.js --check: … à jour`. The root `index.html` must not change: run `git status --short index.html dist/dashboard`, expected empty.

- [ ] **Step 4: Run lint**

Run: `npm run lint`. Expected: exit code 0.

- [ ] **Step 5: Record the pre-existing failures**

Run: `node tests/run.js`. Expected pre-existing failures, unrelated to this plan: `build.js --check` fails on the root `index.html` (committed sources are ahead of the committed bundle), and `backend-swe-2025.test.js` reports 2 failures about the dashboard shared blocks in `Code.gs`. Record the exact output in the ledger. Do not fix them in this branch.

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore local brainstorm session files"
```
