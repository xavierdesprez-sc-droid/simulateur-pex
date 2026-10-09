'use strict';
/** Pure statistics for the SWE 2025 dashboard (no DOM, no Apps Script). Run: node tests/dashboard-stats.test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'dashboard', 'js', 'stats.js'), 'utf8');
const api = new Function(`${source}
return { parseAchievementPercent, ratingLevel, RATING_LEVELS, binLabel, parseSwe2025Csv,
  pearson, spearman, linearFit, aggregateDashboard };`)();
const fixture = fs.readFileSync(path.join(root, 'population_test_swe2025.csv'), 'utf8');

let failures = 0;
function test(name, run) {
  try {
    run();
    console.log(`  PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}
const NO_FILTER = { country: '', market: '', category: '' };

test('achievement percent is read from display text', () => {
  assert.equal(api.parseAchievementPercent('105%'), 105);
  assert.equal(api.parseAchievementPercent(' 99,5 % '), 99.5);
  assert.equal(api.parseAchievementPercent('n/a'), null);
  assert.equal(api.parseAchievementPercent(''), null);
});

test('rating label maps by P1-P5 substring, unknown labels to Unclassified', () => {
  assert.equal(api.ratingLevel('P1 - Below expectations'), 'P1');
  assert.equal(api.ratingLevel('p5 outstanding'), 'P5');
  assert.equal(api.ratingLevel(''), 'Unclassified');
  assert.equal(api.ratingLevel('Unrated'), 'Unclassified');
  assert.deepEqual(api.RATING_LEVELS, ['P1', 'P2', 'P3', 'P4', 'P5', 'Unclassified']);
});

test('5-year bins', () => {
  assert.equal(api.binLabel(3), '0-4');
  assert.equal(api.binLabel(9), '5-9');
  assert.equal(api.binLabel(null), null);
});

test('fixture: In/Out, validity and achievement counts', () => {
  const parsed = api.parseSwe2025Csv(fixture);
  assert.deepEqual(parsed.counts, { total: 12, notIn: 2, invalid: 1, achievementMissing: 2 });
  assert.equal(parsed.rows.length, 9);
});

test('missing required header raises an error naming the column', () => {
  assert.throws(
    () => api.parseSwe2025Csv(fixture.replace('Achievement 2025', 'Achievement')),
    /Achievement 2025/
  );
});

test('pearson and spearman, ties and minimum pairs', () => {
  assert.ok(Math.abs(api.pearson([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
  assert.ok(Math.abs(api.spearman([1, 2, 3, 4], [10, 30, 20, 40]) - 0.8) < 1e-9);
  assert.ok(Math.abs(api.spearman([1, 1, 2], [1, 2, 3]) - Math.sqrt(3) / 2) < 1e-9);
  assert.equal(api.pearson([1, 2], [2, 4]), null);
  assert.equal(api.pearson([1, 2, NaN], [2, 4, 6]), null);
  assert.equal(api.spearman([1, 2, NaN], [2, 4, 6]), null);
});

test('linear fit', () => {
  assert.deepEqual(api.linearFit([1, 2, 3], [2, 4, 6]), { slope: 2, intercept: 0 });
});

test('aggregate on the fixture: row count, achievement mean, rating counts', () => {
  const rows = api.parseSwe2025Csv(fixture).rows;
  const model = api.aggregateDashboard(rows, NO_FILTER);
  assert.equal(model.rowCount, 9);
  assert.equal(model.achievementCount, 7);
  assert.ok(Math.abs(model.meanAchievement - 696 / 7) < 1e-9);
  assert.deepEqual(
    model.byRating.map(entry => [entry.level, entry.n]),
    [['P1', 1], ['P2', 1], ['P3', 2], ['P4', 1], ['P5', 1], ['Unclassified', 1]]
  );
  assert.equal(JSON.stringify(model).includes('NaN'), false);
});

test('France filter leaves 2 rows and correlations stay n/a', () => {
  const rows = api.parseSwe2025Csv(fixture).rows;
  const model = api.aggregateDashboard(rows, { country: 'France', market: '', category: '' });
  assert.equal(model.rowCount, 2);
  assert.equal(model.scatter.length, 2);
  assert.equal(model.trend, null);
  for (const row of model.correlations) {
    assert.equal(row.n, 2);
    assert.equal(row.pearson, null);
    assert.equal(row.spearman, null);
  }
});

test('blank rows made only of commas are not counted (matches the Sheet path)', () => {
  const base = api.parseSwe2025Csv(fixture);
  assert.deepEqual(api.parseSwe2025Csv(fixture + ',,,,,,,,,,,,,\n').counts, base.counts);
});

test('quoted fields keep commas inside values and quoted In/Out values', () => {
  const line = 'France,Sales,"Account Executive, Senior",France,Sales,"In",3,34,100%,52000,13%,6760,104%,P4 - Excellent performance';
  const parsed = api.parseSwe2025Csv(fixture + line + '\n');
  assert.equal(parsed.counts.total, 13);
  assert.equal(parsed.rows.length, 10);
  assert.equal(parsed.rows[9].jobProfile, 'Account Executive, Senior');
});

test('a row with more fields than headers is ignored and counted as invalid', () => {
  const line = 'France,Sales,Account Executive,France,Sales,In,3,34,100%,52000,13%,6760,104%,P4 - Excellent performance,extra';
  const parsed = api.parseSwe2025Csv(fixture + line + '\n');
  assert.equal(parsed.counts.total, 13);
  assert.equal(parsed.counts.invalid, 2);
  assert.equal(parsed.rows.length, 9);
});

test('In/Out is trimmed; zero salary is invalid', () => {
  const kept = 'France,Sales,Account Executive,France,Sales, In ,3,34,100%,52000,13%,6760,104%,P4 - Excellent performance';
  const zeroSalary = 'France,Sales,Account Executive,France,Sales,In,3,34,100%,0,13%,6760,104%,P4 - Excellent performance';
  const parsed = api.parseSwe2025Csv(fixture + kept + '\n' + zeroSalary + '\n');
  assert.equal(parsed.rows.length, 10);
  assert.equal(parsed.counts.invalid, 2);
});

test('aggregate excludes undefined and NaN achievements from counts and correlations', () => {
  const rows = [
    { country: 'A', market: 'M', category: 'C', fixed: 40000, nominal: 4000, achievement: 80, rating: 'P2', seniority: 2, age: 30 },
    { country: 'B', market: 'M', category: 'C', fixed: 50000, nominal: 5000, achievement: 100, rating: 'P3', seniority: 4, age: 35 },
    { country: 'C', market: 'M', category: 'C', fixed: 60000, nominal: 6000, achievement: 120, rating: 'P4', seniority: 6, age: 40 },
    { country: 'D', market: 'M', category: 'C', fixed: 70000, nominal: 7000, achievement: undefined, rating: 'P5', seniority: 8, age: 45 },
    { country: 'E', market: 'M', category: 'C', fixed: 80000, nominal: 8000, achievement: NaN, rating: 'P1', seniority: 10, age: 50 }
  ];
  const model = api.aggregateDashboard(rows, NO_FILTER);
  assert.equal(model.rowCount, 5);
  assert.equal(model.achievementCount, 3);
  assert.equal(model.meanAchievement, 100);
  assert.equal(model.scatter.length, 3);
  for (const row of model.correlations) {
    assert.equal(row.n, 3);
    assert.ok(Number.isFinite(row.pearson), `${row.variable} Pearson must be finite`);
    assert.ok(Number.isFinite(row.spearman), `${row.variable} Spearman must be finite`);
  }
});

if (failures) {
  console.error(`dashboard-stats.test.js: ${failures} failing`);
  process.exitCode = 1;
} else {
  console.log('dashboard-stats.test.js: all checks pass');
}
