# Repository guidance

- `src/**` is the editable application source; `index.html` and `dist/**` bundles are generated deployment artifacts. After source changes, run `node build.js` and commit the regenerated artifact(s). Use `node build.js --check` to verify freshness.
- Client bundles are concatenated in the explicit order in `build.js`. SWE/NCE are build-time profiles (`node build.js --profile=NCE --out=dist/NCE/index.html`); keep the Apps Script `DEPLOYED_PROFILE` fixed per deployment rather than selecting a spreadsheet in the browser.
- Install development tools with `npm ci`. Run `npm run lint` and `npm test`; `npm test` checks the root bundle freshness and `Code.gs` syntax. For a focused unit suite, use `node -e "const {runSuite,results}=require('./tests/harness'); runSuite('./tests/01-model.test.js'); process.exitCode=results.fail?1:0"` (replace the suite path as needed).
- Browser checks: install Chromium with `npx playwright install chromium`, then run `npm run test:browser`. Browser tests use synthetic data and need internet access for CDN assets; screenshot baseline updates are Windows-specific (`npx playwright test --update-snapshots`).
- Do not deploy as part of ordinary development. `scripts/deploy.ps1` accepts `-Target SWE|NCE|SalesRep|All`; `-DryRun` preflights without remote writes, while a production deployment requires explicit confirmation. See `README.md` for deployment details.
- See `.github/copilot-instructions.md` for verified architecture, source ordering, test harness conventions, and Apps Script workflow details.
