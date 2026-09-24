# Design: Sales Rep Variable Compensation Calculator

Date: 2026-09-24
Status: Approved by the user

## Objective

Create a separate, browser-based calculator for an individual sales representative
to see variable compensation as a function of fixed salary, old nominal, performance
on four KPIs, and two qualification KPIs. It will be deployed as its own Google Apps
Script web app with a distinct URL. The existing simulator remains a separate app;
its only requested behavior change is to use 80% as the default hybrid transition
T1 while keeping T1 editable.

The new calculator reuses the existing hybrid-curve calculation source, but has an
isolated page and UI. It does not load population data, persist inputs, or send the
rep's scenario inputs to a server.

## Decisions

- **Deployment and source:** Add a `sales-rep` build target that produces a dedicated
  `dist/sales-rep/index.html` from shared source and Sales Rep-specific page/script
  fragments. Deploy that HTML as `index` in a separate Apps Script project, giving
  the calculator its own URL. Keep the current build target and deployment intact.
- **Hybrid curve:** Use the existing hybrid curve implementation with zero threshold,
  T1 = 80%, T2 = 100%, and a 200% achievement cap. These settings are fixed in the
  Sales Rep app. In the existing Hybrid Scenario, change the T1 default from 85% to
  80% in both initial state and slider markup; the slider remains editable.
- **Salary and nominal inputs:** Fixed salary defaults to €40,000. The old nominal is
  editable in either fixed-euro or percent-of-salary mode; fixed-euro mode is the
  default at €6,000, and percent mode defaults to 15%. The new 100% nominal is
  `max(20% × fixed salary, minimum nominal, old nominal)`. The minimum nominal is
  an editable euro input defaulting to €8,000. The new curve pays twice that nominal
  at 200%.
- **Performance KPIs:** C2P Total (50%), C2P Price (20%), Dev (20%), and Churn (10%).
  Each has an independent achievement slider from 0% to 200%, defaulting to 100%,
  and its own curve chart. Each displayed KPI curve and payout result is already
  weighted by that KPI's share.
- **Qualifiers:** Portfolio (50%) and Visits (50%) are independent, unplotted inputs
  from 0% to 100%, each defaulting to 100%. Cap each input at 100% before computing
  their weighted average qualifier multiplier.
- **Total payout:** Sum the four weighted performance-KPI payouts, then multiply by
  the qualifier multiplier. Show individual weighted KPI payouts, the pre-qualifier
  subtotal, the qualifier multiplier, and the final payout.
- **Visual-companion mockups:** Declined; design and implementation proceed text-only.

## Architecture

### Build and source composition

- Extend `build.js` with an app selector (for example, `--app=sales-rep`). The
  existing invocation continues to generate the current `index.html`; the new
  selector generates `dist/sales-rep/index.html`.
- Compose the Sales Rep page from its own markup and application script, plus the
  shared shell/styles and the existing hybrid curve engine. Do not include the
  existing simulator's navigation, population UI, matrix, charts, or application
  initialization in the Sales Rep page.
- Keep the shared engine as the calculation source of truth. The Sales Rep UI builds
  a hybrid context from its own salary, nominal, and fixed curve settings, evaluates
  the same hybrid payout function for each achievement, and applies KPI weights at
  the UI/calculator boundary.
- The default build remains backward-compatible for the existing local page and
  Apps Script workflow. Building the Sales Rep target does not overwrite the
  committed root `index.html`.

### Sales Rep interface

- Provide a compact compensation-input area for fixed salary, old nominal mode/value,
  and minimum nominal.
- Provide four KPI cards. Each card identifies the KPI and allocation, shows its
  independent achievement slider and current percentage, and plots the weighted
  payout curve in euros with the selected achievement marked on the curve.
- Provide two qualifier controls without charts. Their values are constrained to
  0–100% and visibly communicate the 50/50 weighting and 100% cap.
- Provide a payout summary that updates immediately when any input changes. Show the
  four weighted line items, their subtotal, the averaged qualifier multiplier, and
  the final payout after qualification.
- Use the project's existing CDN-loaded Tailwind and Chart.js libraries. The page
  remains a self-contained generated HTML file suitable for Apps Script.

## Calculation and data flow

For each performance KPI `i`, use the existing hybrid engine to calculate its
unweighted euro payout `H_i(a_i)` at achievement `a_i`. Apply its allocation `w_i`
before display and aggregation:

```text
weightedPayout_i = H_i(a_i) × w_i
performanceSubtotal = sum(weightedPayout_i)
```

The allocations are C2P Total = 0.50, C2P Price = 0.20, Dev = 0.20, and
Churn = 0.10. The four allocations sum to 1.00.

Each qualifier is capped individually at 100%, then the 50/50 average is used as a
multiplier:

```text
portfolio = min(portfolioInput, 100%) / 100
visits = min(visitsInput, 100%) / 100
qualifierMultiplier = 0.50 × portfolio + 0.50 × visits
finalPayout = performanceSubtotal × qualifierMultiplier
```

The qualifier controls have a 0% lower bound, so no additional lower-bound behavior
is needed for normal UI input. If both qualifiers are at 100%, the final payout
equals the performance subtotal; if either is lower, its weighted share reduces the
multiplier.

The old nominal is interpreted as entered euros in fixed mode or as a fraction of
fixed salary in percentage mode. The €8,000 floor applies to the new nominal, not
the old nominal. With the target-share floor, the 100% nominal is:

```text
newNominal = max(fixedSalary × 20%, minimumNominal, oldNominalInEuros)
```

The same curve context is used by all four performance KPIs. Their achievement
sliders only change the point evaluated on that curve; their charts display the
corresponding weighted euro payout.

## Validation and error handling

- Numeric salary and nominal inputs must be finite and non-negative. Empty or
  temporarily invalid text input must not silently replace a valid calculation
  value; follow the project's established input handling pattern and keep the
  displayed calculation internally consistent.
- Slider ranges enforce 0–200% for performance and 0–100% for qualifiers.
- Keep KPI weights and the two qualifier weights as named constants so the displayed
  allocation and calculation cannot drift apart.
- Do not fall back to another curve or present a success-shaped payout if the shared
  engine or chart dependency is unavailable. The calculator values must remain
  explicit, and chart initialization failures must be surfaced according to the
  existing page's error-reporting conventions.
- No scenario values are transmitted to Apps Script. Apps Script serves the static
  page and may enforce access using the current deployment's allow-list pattern.

## Tests and acceptance criteria

- Add calculation tests that verify the new nominal floor (`max(20% salary, floor,
  old nominal)`), the doubled 200% nominal, and hybrid payout at key points below,
  at, and above the 80%/100% transition.
- Verify each performance KPI's result includes its configured weight, and that the
  four weighted results sum to the performance subtotal.
- Verify each qualifier is capped individually before the 50/50 average and final
  multiplier are calculated.
- Add Sales Rep UI tests for default salary and nominal inputs, fixed/percentage
  nominal modes, independent sliders, charts/weighted result labels, qualifier
  controls, and reactive final payout.
- Verify the new build target generates a separate bundle and does not overwrite the
  root `index.html`; verify the default build still matches the current source.
- Verify the existing Hybrid Scenario starts with T1 = 80% while retaining its
  editable T1 control.
- Run `node tests/run.js` after building the relevant bundle(s).

## Deployment

1. Run the Sales Rep build target and copy `dist/sales-rep/index.html` into a
   separate Apps Script project as an HTML file named `index`.
2. Configure that project's `Code.gs` as a separate web-app entry point, reusing the
   existing access-gate pattern if access restrictions are required.
3. Deploy the project as a Web App. The Sales Rep calculator has its own deployment
   URL; the existing simulator deployment is unchanged.

## Out of scope

- Loading, filtering, or displaying the real sales-rep population.
- Saving, sharing, or server-side processing of an individual rep's scenario.
- Editing the Sales Rep app's hybrid threshold or T1/T2 curve settings.
- Adding the Sales Rep experience as a tab in the existing app.
- Changing any existing simulator behavior other than the editable hybrid T1
  default moving from 85% to 80%.
