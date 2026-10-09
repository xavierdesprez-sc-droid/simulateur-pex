// Dashboard statistics: DOM-free. Shared by the dashboard bundle and tests/dashboard-stats.test.js.
// Row shape: { country, market, category, jobProfile, fixed, nominal, achievement, rating, seniority, age }
const RATING_LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'Unclassified'];
const DASHBOARD_REQUIRED_HEADERS = [
  'Country', 'Business Title', 'In/Out', 'Annualized Base Pay', 'Nominal',
  'Achievement 2025', 'Rating - Most Recent', 'Market', 'Category', 'seniority years', 'Age'
];

function parseAchievementPercent(text) {
  const cleaned = String(text == null ? '' : text)
    .replace(/[\s\u00a0]/g, '')
    .replace(/%$/, '')
    .replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function ratingLevel(label) {
  const match = /P([1-5])/i.exec(String(label || ''));
  return match ? 'P' + match[1] : 'Unclassified';
}

function binLabel(value, width = 5) {
  if (value === null || !Number.isFinite(value)) return null;
  const low = Math.floor(value / width) * width;
  return low + '-' + (low + width - 1);
}

function parseNumberOrNull(text) {
  const trimmed = String(text == null ? '' : text).trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

// Splits one CSV line: commas separate cells, double quotes group a cell, "" is a literal quote.
function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseSwe2025Csv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.replace(/[\s,"]/g, '') !== '');
  if (lines.length === 0) throw new Error('Missing header row');
  const headerCells = splitCsvLine(lines[0]);
  const columnOf = {};
  headerCells.forEach((name, index) => { columnOf[name.toLowerCase()] = index; });
  DASHBOARD_REQUIRED_HEADERS.forEach(name => {
    if (columnOf[name.toLowerCase()] === undefined) throw new Error('Missing column: ' + name);
  });
  const counts = { total: 0, notIn: 0, invalid: 0, achievementMissing: 0 };
  const rows = [];
  lines.slice(1).forEach(line => {
    counts.total++;
    const cells = splitCsvLine(line);
    if (cells.length > headerCells.length) {
      counts.invalid++;
      return;
    }
    while (cells.length < headerCells.length) cells.push('');
    const cell = name => cells[columnOf[name.toLowerCase()]] || '';
    if (cell('In/Out').toLowerCase() !== 'in') { counts.notIn++; return; }
    const fixed = parseNumberOrNull(cell('Annualized Base Pay'));
    const nominal = parseNumberOrNull(cell('Nominal'));
    const country = cell('Country');
    const jobProfile = cell('Business Title');
    if (!country || !jobProfile || fixed === null || !(fixed > 0) || nominal === null || nominal < 0) {
      counts.invalid++;
      return;
    }
    const achievement = parseAchievementPercent(cell('Achievement 2025'));
    if (achievement === null) counts.achievementMissing++;
    rows.push({
      country, jobProfile, fixed, nominal, achievement,
      market: cell('Market'),
      category: cell('Category'),
      rating: cell('Rating - Most Recent'),
      seniority: parseNumberOrNull(cell('seniority years')),
      age: parseNumberOrNull(cell('Age'))
    });
  });
  return { rows, counts };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function averageRanks(values) {
  const order = values.map((_, index) => index).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && values[order[end + 1]] === values[order[start]]) end++;
    const averageRank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[order[k]] = averageRank;
    start = end + 1;
  }
  return ranks;
}

function spearman(xs, ys) {
  if (xs.length < 3 || ys.length !== xs.length) return null;
  return pearson(averageRanks(xs), averageRanks(ys));
}

function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

function binnedMeans(items, binOf) {
  const groups = {};
  items.forEach(item => {
    const bin = binOf(item);
    if (bin === null) return;
    (groups[bin] = groups[bin] || []).push(item.achievement);
  });
  return Object.keys(groups)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map(bin => ({ bin, mean: mean(groups[bin]), n: groups[bin].length }));
}

const CORRELATION_VARIABLES = [
  { name: 'Annualized base pay', value: row => row.fixed },
  { name: 'Nominal', value: row => row.nominal },
  { name: 'Seniority', value: row => row.seniority },
  { name: 'Age', value: row => row.age },
  {
    name: 'Rating level',
    value: row => {
      const level = ratingLevel(row.rating);
      return level === 'Unclassified' ? null : Number(level.slice(1));
    }
  }
];

function aggregateDashboard(rows, filters) {
  const f = filters || {};
  const wanted = key => String(f[key] || '').trim();
  const filtered = rows.filter(row =>
    (!wanted('country') || row.country === wanted('country')) &&
    (!wanted('market') || row.market === wanted('market')) &&
    (!wanted('category') || row.category === wanted('category')));
  const withAchievement = filtered.filter(row => row.achievement !== null);
  const achievements = withAchievement.map(row => row.achievement);
  const xs = withAchievement.map(row => row.fixed);
  const scatter = withAchievement.map(row => ({ x: row.fixed, y: row.achievement }));
  return {
    rowCount: filtered.length,
    achievementCount: withAchievement.length,
    meanAchievement: achievements.length ? mean(achievements) : null,
    scatter,
    trend: scatter.length >= 3 ? (() => {
      const fit = linearFit(xs, achievements);
      return fit ? { slope: fit.slope, intercept: fit.intercept, x0: Math.min(...xs), x1: Math.max(...xs) } : null;
    })() : null,
    byRating: RATING_LEVELS.map(level => {
      const items = withAchievement.filter(row => ratingLevel(row.rating) === level);
      return {
        level,
        mean: items.length ? mean(items.map(row => row.achievement)) : null,
        n: items.length
      };
    }),
    bySeniority: binnedMeans(withAchievement, row => binLabel(row.seniority)),
    byAge: binnedMeans(withAchievement, row => binLabel(row.age)),
    correlations: CORRELATION_VARIABLES.map(variable => {
      const pairs = withAchievement
        .map(row => [variable.value(row), row.achievement])
        .filter(pair => Number.isFinite(pair[0]));
      const px = pairs.map(pair => pair[0]);
      const py = pairs.map(pair => pair[1]);
      return {
        variable: variable.name,
        pearson: pearson(px, py),
        spearman: spearman(px, py),
        n: pairs.length
      };
    })
  };
}
