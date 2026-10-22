# Design: SWE 2025 Data Source, Source Switch, and Correlation Dashboard

Date: 2026-10-09
Status: Sections approved in chat; awaiting user review of this written spec

## Objective

Connect the SWE simulator to a new 2025 population source, keep the previous source
selectable so the two can be compared, and provide a separate dashboard that relates
2025 achievement to salary, performance rating, seniority, and age. NCE is unchanged.

## Data

The new source is a tab in a separate spreadsheet:

- Spreadsheet ID: `1c2D9H4r6ZkWRchhNysoGjwnY0kn_m0tbpHQSlQVofRM`
- Tab: `Copie de Liste Sales`
- Header on row 1; data starts on row 2
- SWE only; all monetary values are in euros

Columns used (source key `swe2025`). Columns are read by header name, not by position.
Header names are matched after trimming, case-insensitively.

| Source column | Use |
| --- | --- |
| Country | country (simulator and dashboard filter) |
| Business Title | jobProfile |
| Annualized Base Pay | fixed salary (€) |
| Nominal | nominal bonus (€) |
| Achievement 2025 | achievement, a percentage (dashboard only) |
| Rating - Most Recent | rating (dashboard only) |
| In/Out | row inclusion |
| Market | market filter (dashboard only) |
| Category | category filter (dashboard only) |
| seniority years | seniority (dashboard only) |
| Age | age (dashboard only) |
| Business Line | not used |
| FTE % | not used in v1 |
| Nominal % | not used (redundant with Nominal, up to rounding) |

**Row inclusion.** A row is used only when In/Out equals `In` (trimmed, case-insensitive).
Rows marked `Out`, blank, or with any other value are ignored and counted. For the
simulator, a valid row also needs a non-empty country and job profile, a numeric
fixed salary greater than 0, and a numeric nominal of 0 or more.

**Legacy source.** `legacy` is the existing `Data dynamic distributions` tab of the
SWE spreadsheet. It is unchanged, including the existing `MG` exclusion on `Orga`.

## Decisions

- **Simulator source.** The SWE simulator reads `swe2025` by default. Assumption,
  to confirm: the user asked to replace the source with a switch to compare, but did
  not state the default explicitly.
- **Source switch.** The SWE advanced view's population controls get a source
  selector (`swe2025` / `legacy`). The browser sends only the source key. The server
  accepts only the keys in its allowlist; any other value is refused. The deployed
  profile stays fixed to SWE, so the browser never chooses a spreadsheet.
- **Dashboard is a separate app.** Build target `node build.js --app=dashboard`
  produces `dist/dashboard/index.html`, deployed as its own Apps Script project. It
  shares `ACCESS_LIST_SPREADSHEET_ID` with the SWE app, so the access lists are the same.
- **Dashboard access is full access only.** Users whose email is in the restricted
  list, or in both lists (restricted takes precedence, as today), are denied. Access
  is checked with the existing `canViewIndividualTables` rule.
- **Dashboard data.** The dashboard reads only `swe2025` and applies the same row inclusion.
- **Achievement 2025** is read directly from the `Achievement 2025` column, a
  percentage. It is not computed from payout and nominal. Rows with a non-numeric
  achievement are excluded from achievement statistics, and their count is shown.
  The cells display a `%` sign, so the value is read from the display text (`105%` → 105).
- **Rating levels.** The rating label is matched by substring, case-insensitive:
  `P5` (Outstanding performance), `P4` (Excellent performance), `P3`
  (Good/Solid Performance), `P2` (Performance Needing improvement), `P1` (label not
  provided). Ordinal order is P1 < P2 < P3 < P4 < P5. Assumption, to confirm: P1 is
  the lowest level. A label that matches none of these is shown as `Unclassified`
  and kept out of the ordering.
- **NCE is unchanged.** Its profile, its remote project, and its deployment do not change.
- **No real data in the repository.** The local CSV fixture for `swe2025` is synthetic,
  with the same headers.

## Architecture

### Build

- `build.js` gets an `--app=dashboard` target that outputs `dist/dashboard/index.html`.
  Its fragments are in a dedicated `src/dashboard/` folder. The SWE bundle and the
  Sales Rep bundle are unchanged.
- The statistics functions (achievement, rating level, Pearson, Spearman, bins) live
  in a pure, DOM-free module shared by the dashboard script and the tests.

### Apps Script backends

- **SWE `Code.gs`.** `POPULATION_SOURCES` is defined for the SWE profile with two
  entries, `legacy` and `swe2025`. `getPopulation(sourceKey)` takes the key, falls
  back to `swe2025` when no key is given, and refuses unknown keys. For `swe2025`, the
  header row is read and each column is found by name. A missing column raises an error
  that names it, and nothing is loaded partially.
- **Dashboard `Code.gs`.** Its own `doGet` serves the dashboard only after the
  full-access check. `getDashboardData()` returns the `swe2025` rows with the canonical
  fields listed above, after the row-inclusion rule. Statistics run in the browser,
  as in the existing app.
- **NCE.** Its remote `Code.js` is left alone. The repository's `Code.gs` changes only
  affect the SWE and dashboard projects.

### Simulator UI

- The source selector sits in the population loading controls of the advanced view.
  Changing it reloads the population. The status line shows the row count and the
  ignored count for the chosen source.

## Dashboard content (v1)

- **Filters** (cumulative): Country, Market, Category.
- **Scatter**: achievement against annualized base pay, with an OLS trend line, Pearson r,
  and Spearman ρ.
- **Rating**: mean achievement per rating level (P1 to P5, then Unclassified), with n.
- **Seniority and age**: mean achievement per 5-year bin (assumption, to confirm), with n.
- **Correlation table**: achievement against base pay, nominal, seniority, age, and rating
  level. Pearson and Spearman are shown; for the ordinal rating, Spearman is the
  relevant value. Every row shows n.
- **Small samples**: a correlation with fewer than 3 valid pairs shows `n/a`.
  Every group shows its n.

## Error handling

- Unknown source key: explicit error, no data returned.
- Missing column in `swe2025`: error naming the column, no partial load.
- Access denied: the existing denied page or error message.
- Filters leaving no rows: a "no data" message, never `NaN`.

## Testing

Tests use the existing Node harness, with no browser or Sheet access.

- In/Out filter: only `In` is kept; `Out`, blank, and other values are ignored and counted.
- Column mapping by header name: correct mapping, and a missing column is an error.
- Source key allowlist: `legacy` and `swe2025` accepted, anything else refused, default `swe2025`.
- Achievement: percentage parsing (with or without `%`), and exclusion of non-numeric values.
- Rating level: substring matching of P1 to P5, and `Unclassified` for unmatched labels.
- Pearson and Spearman: ties, and `n/a` below 3 pairs.
- Access rule for the dashboard: full-only, and restricted precedence when both lists match.
- Build: `node build.js --check` for the new target, `npm test`, and `npm run lint`.

## Out of scope

- Deployment. It runs only when explicitly requested, following the repository rules.
- Any NCE change.
- Dashboard access for restricted users.
- Causal modelling or regression.
- Saving filters or scenarios.

## Assumptions to confirm

1. P1 is the lowest rating level, and its exact label is unknown; matching uses the `P1` substring.
2. The SWE simulator defaults to `swe2025`.
3. Only rows with `In/Out = In` are used; other values are ignored.
4. Seniority and age use 5-year bins.
5. The local CSV fixture is synthetic.
6. Achievement cells show a `%` sign; values are read from the display text.
