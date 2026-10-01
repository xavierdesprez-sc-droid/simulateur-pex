# Variable Compensation & Sales PEX Simulator

Interactive tool for simulating sales variable compensation scenarios and their impact
on payroll (PEX). The local mode runs from a single HTML file and keeps CSV data in the
browser; the Apps Script deployment reads authorized population data from Google Sheets.
No installation is required for either mode.

## Getting Started

Open `index.html` in a browser (double-click is enough). Tailwind, Chart.js, KaTeX,
and Lucide load from version-pinned CDNs, so an internet connection is needed.
Chart.js, KaTeX, and Lucide use integrity checks; Tailwind's Play CDN does not
send CORS headers, so a cross-origin integrity check would block its styles.

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

## Personae View (SWE only)

The **Personae** tab reads aggregate segment data from the `Courbe %/€` tab in the
configured Personae spreadsheet. Columns A/B supply country and seniority; headers are
in C2:H2 and data starts on row 3. The expected headers are `Effectif`, `Âge Moyen`,
`Salaire Fixe Moyen (€)`, `Bonus Cible Moyen (€)`, `Bonus Cible Moyen (%)`, and
`Segment ("Persona")`. The Apps Script `getPersonae()` endpoint validates this layout
and is protected by the same access list as the rest of the app. Open the Apps Script
deployment to load this data; the local-file mode does not have a Personae CSV fallback.

Country is a multi-select filter and combines with the seniority filter. Portugal
(`PT` or `Portugal` in the country column) is unselected by default but can be selected;
persona labels are not used for country filtering. Every persona can also be included or
excluded individually. The view overlays all included curves and marks where the new
plan first pays more in the **Courbe %/€** mode. That mode defaults to a 20-point
objective increase and an €8,000 nominal floor; the hybrid pays from 40% achievement
and begins accelerating at 80%, reaching the new curve at 100%. The x-axis is labeled
as achievement before the objective increase.

The **Courbe %/%** mode does not apply an objective increase. It displays the old common
reference `y = x` and each hybrid curve as a percentage of that persona's new nominal.
In **Courbe %/€**, the old payout is based on the current target bonus in euros, while
the hybrid curve uses the larger of that bonus, 20% of average fixed salary, and the
configured nominal floor.

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
3. Set `DEPLOYED_PROFILE` in `Code.gs` to `SWE` or `NCE`; `SHEET_ID` selects that profile's configured spreadsheet ID
4. Deploy → Web app and authorize access to the configured spreadsheets when prompted

### Per-person access for the web app

The deployment's **Who has access** setting is organization-wide, so keep it set to
**Anyone within AIR LIQUIDE** and let the server enforce the individual allowlist:

1. Create a separate spreadsheet that is not shared with simulator users. Add a tab named
   `Access`, put the contact email in `D2`, and list full-access emails in `A2:A`.
   List restricted-access emails in `B2:B`; don't repeat emails across columns. Column A
   users see the individual tables, while column B users see aggregate views only. Enter
   A/B emails as plain text, not Google Sheets people chips. If an email is accidentally
   in both columns, restricted access takes precedence.
2. `ACCESS_LIST_SPREADSHEET_ID` in `Code.gs` points to the private Access spreadsheet.
   Copy the same `Code.gs` to both Apps Script projects. The A/B access lists are shared:
   an email's permission applies equally to both apps; there are no separate SWE and NCE
   access lists. No Script Property is required.
3. Deploy the web app as **Execute as: Me**. `Code.gs` checks the signed-in user's email
   before serving the simulator and again before returning population data. Unlisted users
   see a request-access message with the contact email from `Access!D2`.
4. Test with an ordinary user account in the organization. If Apps Script cannot identify
   that user's email, access is denied. After code changes, edit the deployment and publish
   a new version.

The A/B distinction only controls table visibility in the UI. The browser still receives
the individual population values for calculations, so restricted users could inspect them
with developer tools. Local/manual CSV mode remains unchanged.

When opened outside Apps Script (local file), the loading button falls back to the local CSV
(`population_test.csv` or a picked file) — the rest of the tool works normally.

### Cluster profiles

The source code is shared by SWE and NCE. The generated bundle selects the profile, while
each Apps Script project fixes its server-side profile in `Code.gs`:

```js
const DEPLOYED_PROFILE = 'SWE'; // set to 'NCE' in the NCE project
// POPULATION_SPREADSHEET_IDS and ACCESS_LIST_SPREADSHEET_ID are configured in Code.gs.
const SHEET_ID = POPULATION_SPREADSHEET_IDS[DEPLOYED_PROFILE];
```

Use separate Apps Script projects for the SWE and NCE deployments. Copy the common `Code.gs`
to both projects, then set `DEPLOYED_PROFILE` to `SWE` or `NCE`. `SHEET_ID` selects the
corresponding configured population spreadsheet. The same `ACCESS_LIST_SPREADSHEET_ID` is
used by both projects, so the same full/restricted access lists apply to SWE and NCE. The
browser does not choose the data profile, so an SWE deployment cannot request the NCE
spreadsheet.

The generated bundles are built with:

```text
node build.js --profile=SWE --out=dist/SWE/index.html
node build.js --profile=NCE --out=dist/NCE/index.html
```

SWE maps `Position` to the common UI label `Job Profile` and reads base salary/nominal from
columns G/H. NCE reads `Job Profile`, `Country`, `Annual Base Pay 2026 Revised`, and
`Nominal Bonus 2026 Revised` from columns A/B/D/E. The ID column is ignored in both profiles.
Both profiles expose only `Country` and `Job Profile` filters on the first page and calculate
Current PEX Paid, headcount, and Avg. Current Var. Share from the filtered Sheet data.

### Deploying SWE, NCE, or Sales Rep

From the repository root in PowerShell, name the target explicitly:

```powershell
.\scripts\deploy.ps1 -Target SWE -DryRun
.\scripts\deploy.ps1 -Target SWE
.\scripts\deploy.ps1 -Target NCE
.\scripts\deploy.ps1 -Target SalesRep
.\scripts\deploy.ps1 -Target All
```

The script requires Node.js, the `clasp` CLI, and an authenticated Apps Script
account. It runs the bundle freshness check, lint, and tests, then preflights **all**
selected projects before any remote write. Projects are matched by their unique exact
names. It verifies the intended bundle, Apps Script file inventory, backend profile,
and exactly one existing versioned production deployment. `-DryRun` performs those
checks without pushing or redeploying. A real run asks for an exact typed confirmation
(for example, `DEPLOY All` is not accepted; use `DEPLOY ALL`). Redirected/noninteractive
runs are refused.

SWE is repository-managed: `.clasp.json` selects SWE, `Code.gs` fixes the server profile,
and `.claspignore` allows only `Code.gs`, `appsscript.json`, and root `index.html`.
NCE and Sales Rep use separate remote projects. The script clones each into a unique
temporary directory outside the repository, keeps its remote `Code.js` and
`appsscript.json` unchanged, and stages only the generated `index.html`. This is why
the backends differ: the SWE backend is maintained in this repository, NCE has a
profile-fixed copy, and Sales Rep has a smaller calculator-specific access gate.

After confirmation, each selected project is pushed without force, given a new immutable
version, and redeployed through its existing production deployment ID to preserve its
URL. The script then pulls that version and verifies its HTML and backend/manifest
against the staged files. Deployment is sequential and non-atomic: on failure it stops
and reports which targets were redeployed and which were pushed but not redeployed;
it does not attempt the remaining targets.
Temporary files created by that invocation are cleaned up. Verify access and rendering
in an authenticated browser after deployment; an unauthenticated request redirects to
Google sign-in.

Creating or testing the script does not deploy anything. Production changes happen
only when an operator explicitly runs the script without `-DryRun` and confirms.

The Sales Rep bundle can also be built separately with `node build.js --app=sales-rep`;
the output is `dist/sales-rep/index.html`.

The Sales Rep calculator runs entirely in the browser. It does not load population data,
persist scenarios, or send scenario inputs to a server.

## Build (split src/ -> index.html monofichier)

Éditer `src/**`, puis :

```
node build.js
node tests/run.js
```

`index.html` est généré et commité (artefact Apps Script + ouverture locale).
`node build.js --check` échoue si `index.html` est périmé (utilisé par `tests/run.js`).
Déploiement inchangé : copier-coller `index.html` vers le fichier `index` Apps Script (+ `Code.gs` si changé).

## Development checks

The app and build remain dependency-free. For linting and tests, install the pinned
development tools with `npm ci`, then run:

```text
npm run lint
npm test
```

GitHub Actions runs both checks for pushes and pull requests.

## Tests

The application itself has no local installation requirement. Node.js is needed to build
and run the tests; npm is needed to install the linting development tools.

```
node tests/run.js
```

The runner checks the generated bundle, Apps Script syntax, backend authorization, and the
simulated-DOM UI suites. The test harness uses Node.js built-ins; ESLint is a development-only dependency.

- `01-model`: curves (breakpoints, linear base, hybrid), linear blend, € floors, 0 threshold,
  continuity at boundaries, equality with the reference model (8 configs × 201 points)
- `02-advanced-ui`: superimposable standard scenario, synchronized sliders, unified calibration
- `03-population`: mocked Sheet loading, 20% floor per rep, target increase,
  € floors, HTML escaping, return to the average model
- `04-standard-ui`: dynamic texts, archetype badges, average model, reset
- `05-cluster-profiles`: profile-specific fields, filters, and CSV mappings
- `06-detail-visibility`: role-controlled visibility for the two per-person tables
- `auth.test.js`: Apps Script allowlist checks and full/restricted access lists

## Architecture

- **Calculation engine** (`Engine`, dedicated section at the top of the script): pure and DOM-free —
  `integrate` (single Gaussian integration primitive), curves in € (`oldE`, `newBaseE`,
  `hybridE`), breakpoint curve driven by the editable table. The UI is just a
  display layer on top.
- `index.html` (client) + `Code.gs` (Apps Script backend) — Chart.js, Tailwind CSS, KaTeX, Lucide (CDN)
- Full git history; tags: `v1-sans-transition`, `v2-avec-transition`
