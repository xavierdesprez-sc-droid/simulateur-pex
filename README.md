# Variable Compensation & Sales PEX Simulator

Interactive tool for simulating sales variable compensation scenarios and their impact
on payroll (PEX). **100% local**: a single HTML file, no data ever leaves the
browser, no installation required.

## Getting Started

Open `index.html` in a browser (double-click is enough). The libraries (Tailwind, Chart.js,
KaTeX, Lucide) are loaded via CDN — an internet connection is needed on first load.

## Standard View

Population model: Gaussian distribution of achievement rates (configurable µ and σ).

- **Strategic sliders**: target increase (distribution shift), induced overperformance
- **Curves**: old one (linear 1:1) vs new one (editable breakpoints: flat 0 up to 40%,
  linear 0→100% payout between 40% and 100%, 100%→200% progressive, configurable cap)
- **Mass KPIs**: new vs current PEX, Δ payroll, additional corridor gain, net P&L balance
- **Individual simulator**: fixed salary, current bonus share, grandfathering (the new
  nominal = max(20%, grandfathered)) — sales reps at ≥ 20% keep their rate
- **Population breakdown** by achievement brackets with average impact per rep

## Advanced View — Hybrid scheme

A finer transition scenario simulator. **Standard View / Advanced View** toggle in the header.

### Scheme rules

- **New nominal** = max(20% target of the fixed salary, minimum nominal € entered, old nominal €)
- **Value at 200%** = max(2 × new nominal, minimum € amount entered)
- **Base curve**: linear from 0 to 100% up to the new nominal, then linear from 100% to 200%
- **Transition to the new curve** between T1 and T2 (double slider 0–200%): straight segment connecting
  the old curve (at T1) to the new one (at T2)
- **Trigger threshold**: below this achievement rate, 0 paid out (0 = disabled)
- **Target increase**: shifts the calibrated achievement of the tested rep (before/after points)

The old nominal is entered **in €**; the displayed curve is expressed as a % of the tested rep's
old nominal (each rep therefore has their own curve depending on their nominal ratio).

### Aggregate mass impact

Integration of the weighted curve (average nominal 11% → 20%) over the overall Gaussian.

## Real population (Google Sheet)

In the advanced view, the **"Load from the Google Sheet"** button replaces the single average with
the real nominals:

**Local mode:** when `index.html` is opened outside Apps Script, the button tries to fetch
`population_test.csv` from the same folder (place your CSV there, header on line 1, columns
A=Orga, B=Position, C=Country, D=ID, G=Base Salary, H=Amount). If the browser blocks the fetch
(`file://` in Chrome/Edge), a file picker opens instead — pick any CSV with the same columns.

- **Tab read**: `Data dynamic distributions` — header on **row 4**, columns
  `A=Orga, B=Position, C=Country, D=ID, E–F=(ignored), G=Base Salary, H=Amount`
- For each rep: E[paid] = ∫ their personal weighted curve × Gaussian density (global µ, σ)
- **Filters** Orga / Country / Position (dropdown menus "All" + distinct values, cumulative):
  recompute PEX cards, risk indicators and the table on the filtered subset
- **Outputs**: real current / hybrid / all-new PEX, number of losers, max loss, average loss,
  table sorted by colored € delta: green above +20 €, red below −20 €, gray otherwise
- **Matrix tab**: Salary × Performance matrix with a 2×2 / 3×3 switch (default 2×2).
  2×2 splits salary at the mean and performance at µ; 3×3 splits both in terciles
  (salary terciles of the population, performance terciles of the Gaussian mass).
  Each mode shows Expectations or Δ vs current per cell.
- **4:1 Nominal tab**: population scenario using the standard breakpoint curve. When a rep's
  nominal rises, the C2P objective rises by 4 € per additional nominal euro. The added objective
  is converted to achievement points using the configurable **Corridor C2P moyen** (600,000 € by
  default); this scenario does not use the global target-increase slider. Its synchronized
  superformance slider updates the Additional C2P Gain and P&L cards in real time. The matrix
  includes the corresponding 4:1 expectation or delta in every cell.

The card recomputes in real time when the curve parameters change. The data stays
in the browser.

## Google Apps Script Deployment

Two possible modes (`Code.gs` handles both):

**Sheet-bound** (simplest):
1. Open the Google Sheet → Extensions → Apps Script
2. Paste `Code.gs` into `Code.gs`, and the content of `index.html` into an HTML file named `index`
3. Deploy → New deployment → Web app

**Standalone** (a single web app, independent of the spreadsheet):
1. Create a project on script.google.com
2. Paste both files (HTML named `index`)
3. Fill in `SHEET_ID` at the top of `Code.gs` with the spreadsheet ID (the string in the URL between `/d/` and `/edit`)
4. Deploy → Web app — Google will ask for permission to access the spreadsheet on first launch

When opened outside Apps Script (local file), the loading button falls back to the local CSV
(`population_test.csv` or a picked file) — the rest of the tool works normally.

## Tests

The application itself has no local installation requirement. Node.js is only needed to run the test suite.

```
node tests/run.js
```

206 checks in 4 suites (simulated DOM, no dependencies):

- `01-model`: curves (breakpoints, linear base, hybrid), linear blend, € floors, 0 threshold,
  continuity at boundaries, equality with the reference model (8 configs × 201 points)
- `02-advanced-ui`: superimposable standard scenario, synchronized sliders, unified calibration
- `03-population`: mocked Sheet loading, 20% floor per rep, target increase,
  € floors, HTML escaping, return to the average model
- `04-standard-ui`: dynamic texts, archetype badges, average model, reset

## Architecture

- **Calculation engine** (`Engine`, dedicated section at the top of the script): pure and DOM-free —
  `integrate` (single Gaussian integration primitive), curves in € (`oldE`, `newBaseE`,
  `hybridE`), breakpoint curve driven by the editable table. The UI is just a
  display layer on top.
- `index.html` (client) + `Code.gs` (Apps Script backend) — Chart.js, Tailwind CSS, KaTeX, Lucide (CDN)
- Full git history; tags: `v1-sans-transition`, `v2-avec-transition`
