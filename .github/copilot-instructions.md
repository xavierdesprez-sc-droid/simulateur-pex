# Copilot instructions

## Project overview

This is a browser-based variable-compensation / PEX simulator. The deployed client is
the single generated `index.html`; it can be opened locally or pasted into a Google Apps
Script HTML file. `Code.gs` is the optional Apps Script backend used to read population
data from a Google Sheet. The browser loads Tailwind, Chart.js, KaTeX, and Lucide from
CDNs, while the simulator calculations run locally in the page.

The source is split under `src/`:

- `src/*.html` contains the page fragments, in the order declared by `build.js`.
- `src/js/00-profile.js` selects the SWE/NCE population profile, then `00-state.js`
  defines shared state.
- `01-engine.js` is the DOM-free calculation layer: Gaussian integration, payout
  curves, hybrid curves, and breakpoint interpolation.
- `02-standard.js`, `03-advanced.js`, `04-population.js`, `05-matrix.js`, and
  `06-app.js` provide the standard, hybrid, real-population, salary/performance matrix,
  and application/navigation layers.
- `src/top-strip.js` generates the shared top-strip markup expanded by `build.js`.

The app has two population paths. Local mode reads a CSV (or opens a file picker);
Apps Script mode calls `google.script.run.getPopulation()`, which reads and filters the
configured Sheet in `Code.gs`. SWE and NCE share the client code but have different
CSV/Sheet column mappings and are selected at build time. The server-side
`DEPLOYED_PROFILE` remains fixed in each Apps Script deployment; the browser must not
choose the spreadsheet profile.

## Build and test commands

Run commands from the repository root with Node.js installed. There is no package
installation step and no separate lint configuration.

```text
# Rebuild the committed Apps Script/local bundle from src/
node build.js

# Build a profile-specific bundle
node build.js --profile=SWE --out=dist/SWE/index.html
node build.js --profile=NCE --out=dist/NCE/index.html

# Verify index.html matches the current split source
node build.js --check

# Run all tests (also checks bundle freshness and Code.gs syntax)
node tests/run.js
```

Tests are dependency-free Node scripts using a simulated DOM. To run one suite, invoke
the harness directly and replace the filename as needed:

```text
node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/01-model.test.js'); process.exitCode=results.fail?1:0"
```

Available suite files are `01-model.test.js`, `02-advanced-ui.test.js`,
`03-population.test.js`, `04-standard-ui.test.js`, and `05-cluster-profiles.test.js`.
The direct single-suite command does not perform the full runner's preliminary
freshness and Apps Script syntax checks; use `node tests/run.js` for those checks.

## Change workflow and repository conventions

- Edit `src/**`, not the generated `index.html`. Run `node build.js` after source
  changes; `index.html` is a committed deployment artifact and must remain current.
- Preserve the exact source order in `build.js`. HTML fragments are concatenated first,
  then JavaScript fragments are concatenated into the final page script. Top-strip
  placeholders use `<!-- @@TOP-STRIP:<name> -->` and are expanded through
  `renderTopStrip`.
- Keep the calculation engine pure and DOM-free. UI code should consume the engine
  rather than duplicating payout or integration formulas. Monetary curve calculations
  are in euros; percentage display/calibration is handled at the UI boundary.
- Shared state is intentionally page-global because the generated Apps Script page is
  a single script. Use the existing state objects and update/render functions so the
  standard, advanced, population, matrix, and 4:1 views stay synchronized.
- Population records use the normalized fields `jobProfile`, `country`, `fixed`, and
  `nominal`. Do not reintroduce IDs into rendered population tables. Keep the profile
  mappings in `00-profile.js` aligned with the corresponding `Code.gs` mappings and
  fixtures.
- When changing population loading, preserve both response shapes supported by the
  tests: the normalized `{ reps, ignored }` Apps Script response and the local/mock
  representative arrays. Filters are cumulative (country AND job profile).
- The test harness re-evaluates the page script in a fresh mocked DOM for each suite.
  Add assertions through the suite's `__h` helpers and mock `google.script.run`
  through `__h.mock`; do not require a real browser or Google Sheet for unit tests.
- Apps Script deployment expects the generated file to be named `index` and requires
  `Code.gs` alongside it. Keep `SHEET_ID` empty for a Sheet-bound deployment, or set
  it to the target spreadsheet ID for a standalone deployment. Use separate fixed
  deployments when SWE and NCE need different spreadsheets or permissions.
- `.clasp.json` targets the SWE Apps Script project. Keep `.claspignore` restricted to
  `Code.gs`, root `index.html`, and `appsscript.json`; never push `src/**` or test files.
  Before pushing, run `node build.js --check`, `node tests/run.js`, and inspect
  `clasp status --json`; `filesToPush` must contain exactly those three files. `clasp push`
  replaces the remote file set but does not publish a web app. Get the production ID from
  `clasp deployments`, then use `clasp redeploy <production-deployment-id>` to create a
  version and preserve the existing URL. Verify the result in an authenticated browser
  session.
