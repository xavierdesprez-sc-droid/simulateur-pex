# Design: Sales Rep quarterly payout tracking

Date: 2026-10-21
Status: Draft, awaiting user approval

## Objective

Extend the Sales Rep Variable Compensation Calculator so a sales rep can record
results quarter by quarter during the year and see what is paid each quarter.
Q1, Q2, and Q3 each pay one quarter of the annual payout, computed from that
quarter's results. Q4 is a year-end catch-up: the full-year results are used to
compute the annual payout, and the Q4 payment is that amount minus what Q1–Q3
already paid, floored at zero.

This feature extends the existing standalone Sales Rep calculator
(`docs/superpowers/specs/2026-09-24-sales-rep-calculator-design.md`). It does not
load population data, call the server, or change the existing simulator.

## Decisions from the user

- **Layout:** one tab per quarter (Q1, Q2, Q3, Q4). Each tab shows its results and
  payout, and a recap of what has already been paid on the other quarters.
- **Q1, Q2, Q3 inputs:** the KPI achievements and qualifiers of that quarter only.
  They are not cumulative.
- **Q4 inputs:** the KPI achievements and qualifiers for the full year, not the Q4
  quarter alone.
- **Negative catch-up:** if `annual payout − (Q1 + Q2 + Q3)` is negative, the Q4
  payment is 0. No clawback.
- **Persistence:** inputs are saved automatically in the browser's `localStorage`
  and restored on reload.

## Calculation

The shared hybrid engine and KPI weights from the existing calculator are unchanged.
For a given set of achievements `a_i` and qualifiers:

```text
performanceSubtotal = Σ H_i(a_i) × w_i        (H_i = existing hybrid curve, w_i = KPI weight)
qualifierMultiplier = 0.5 × min(portfolio, 100%) + 0.5 × min(visits, 100%)
annualPayout(inputs) = performanceSubtotal × qualifierMultiplier
```

Quarter payouts (Q1, Q2, Q3):

```text
quarterPayment(q) = annualPayout(inputs of quarter q) / 4
```

Q4 catch-up:

```text
annualPayoutFY = annualPayout(full-year inputs)
q4Payment      = max(0, annualPayoutFY − (Q1 payment + Q2 payment + Q3 payment))
```

When the full-year result is at least the amount already paid, the total paid over
the year equals `annualPayoutFY`. When it is lower, the total paid is the amount
already paid (Q1–Q3), and Q4 pays 0.

## Architecture

- **Engine:** no change to `01-engine.js`. The Sales Rep calculation in
  `src/js/sales-rep.js` gains helpers for a quarter payout and the Q4 catch-up.
  The existing `calculateSalesRepPayout` stays as the building block.
- **State:** the shared compensation inputs (fixed salary, old nominal mode and
  values, minimum nominal) stay global, as today. Achievement and qualifier values
  are stored per period, with four periods: Q1, Q2, Q3, and FY (used by Q4).
- **Tabs:** four tabs in the Sales Rep page. Q1–Q3 each show the KPI cards and
  qualifiers for that quarter, its payment, and a recap table. Q4 shows the full-year
  inputs, the annual payout, the amount already paid, and the Q4 payment.
- **Persistence:** one `localStorage` entry, versioned, containing the periods and
  the shared compensation inputs. It is written after each input change and read at
  startup. If the stored value is missing or unparseable, the defaults are used.
  If `localStorage` is unavailable (for example, blocked by the browser), the page
  shows a message and keeps working in memory.
- **Build:** the existing `sales-rep` target is regenerated. The root `index.html` and
  `dist/` simulator bundles are not changed.
- **Apps Script:** the page remains a static, self-contained HTML file. No data is
  sent to the server.

## Interface

- Per quarter tab (Q1, Q2, Q3):
  - four KPI cards with achievement sliders (0–200%) and their charts, as today;
  - two qualifier sliders (0–100%), as today;
  - quarter payment (annual payout ÷ 4);
  - recap table: each quarter's payment and whether it has been entered, with
    the total paid so far.
- Q4 tab:
  - the same KPI cards and qualifier sliders, labelled as full-year results;
  - annual payout;
  - total already paid (Q1–Q3);
  - Q4 payment, after the zero floor;
  - total for the year.
- A **Réinitialiser ce quarter** button in each tab resets that tab's inputs to
  defaults. (My call, see below.)

## My calls (to check)

1. The shared compensation inputs (salary, old nominal, minimum nominal) apply to
   all quarters. They are not per quarter.
2. Each quarter's qualifiers are entered separately. Q4 uses its own full-year
   qualifiers.
3. Charts keep showing the annual curve. The quarter tab marks the quarter's
   achievement on it. Euro values displayed for a quarter are the quarter payment
   (annual curve ÷ 4), so the chart's y-axis is not divided. The label says
   "payout annuel" to avoid confusion.
4. A reset button per tab. It is the only way to clear saved data inside the page.
   Removing it is a one-line change if not wanted.
5. Achievement values are saved as typed, with the same validation as today.
6. Default values: all tabs start at 100% achievement and qualifiers, the same as
   the current calculator.
7. A quarter counts as **entered** once one of its values has been changed by the
   user. Until then its payment shows "—" and counts as 0 in the total already
   paid, so untouched defaults never reduce the Q4 payment. Entry status is saved
   with the other inputs.

## Acceptance criteria

- Q1–Q3 payments equal `annualPayout(quarter inputs) / 4`, with qualifiers applied
  per quarter.
- Q4 payment equals `max(0, annualPayout(FY) − (Q1+Q2+Q3))`. Tests cover a positive
  case, an exact-zero case, and a negative case that is floored to 0.
- Total paid over the year equals `annualPayout(FY)` whenever the Q4 payment is
  not floored.
- Changing an input updates its tab, the recap, and the Q4 payment immediately.
- Saved inputs are restored after a reload. A corrupt or missing entry falls back
  to defaults without an error.
- If `localStorage` is blocked, the page still calculates and shows a message.
- `node build.js --check` passes after the sales-rep bundle is regenerated, and the
  root `index.html` is unchanged.
- Existing Sales Rep tests are updated for the tab structure. `node tests/run.js`
  passes.

## Out of scope

- Server storage, multi-device sync, or sharing.
- Exporting or importing a file.
- Real population data or manager views.
- Changing the hybrid curve settings or the KPI weights.
- Clawback of amounts already paid.
