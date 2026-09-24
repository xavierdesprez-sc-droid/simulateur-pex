'use strict';
/**
 * Build: concatène src/*.html + src/js/*.js -> index.html (monofichier Apps Script).
 * Les placeholders <!-- @@TOP-STRIP:<nom> --> sont expansés via src/top-strip.js
 * (bandeau haut ΔPEX + slider, source unique pour Hybrid / 4:1 / Matrix).
 * Usage: node build.js [--profile=SWE|NCE] [--app=sales-rep] [--out=path] | node build.js --check
 * Node seul, zéro dépendance, déterministe (pas de timestamp).
 */
const fs = require('fs');
const path = require('path');
const { renderTopStrip } = require('./src/top-strip');

const ROOT = __dirname;
const HTML_PARTS = [
  'head.html',
  'body-header.html',
  'body-standard.html',
  'body-four-to-one.html',
  'body-advanced.html',
  'body-matrix.html',
  'body-personae.html',
  'body-footer.html',
];
const JS_PARTS = [
  '00-profile.js',
  '00-state.js',
  '01-engine.js',
  '02-standard.js',
  '03-advanced.js',
  '04-population.js',
  '05-matrix.js',
  '06-app.js',
  '07-personae.js',
];
const CSV_FIXTURES = {
  SWE: 'population_test.csv',
  NCE: 'population_test_nce.csv'
};
const SALES_REP_JS_PARTS = [
  '01-engine.js',
  'sales-rep.js',
];

function readOrFail(p) {
  if (!fs.existsSync(p)) {
    console.error(`build.js: fichier manquant: ${path.relative(ROOT, p)}`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

// Convention src/ (voir .editorconfig) : chaque fragment se termine par
// exactement un '\n' (les éditeurs le garantissent). Les lignes vides de
// séparation appartiennent au DÉBUT du fragment suivant (les fins de fichier
// sont fragiles, les débuts ne bougent jamais). buildString est donc
// insensible à l'ajout/retrait d'un '\n' final par un éditeur.
const stripTrailingNewlines = s => s.replace(/\n+$/, '');

function concatJs(profile = 'SWE') {
  const profileLiteral = JSON.stringify(String(profile).toUpperCase());
  return `const BUILD_PROFILE = ${profileLiteral};\n` +
    JS_PARTS.map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', 'js', f)))).join('\n');
}

function buildString(profile = 'SWE') {
  const normalizedProfile = String(profile).toUpperCase();
  const htmlParts = HTML_PARTS.filter(f => normalizedProfile !== 'NCE' ||
    (f !== 'body-four-to-one.html' && f !== 'body-personae.html'));
  const html = htmlParts.map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', f)))).join('\n')
    .replace(/<!-- @@TOP-STRIP:([a-z0-9-]+) -->/g, (m, name) => stripTrailingNewlines(renderTopStrip(name, normalizedProfile)))
    .replace(/^[ \t]*<!-- @@FOUR-TO-ONE-TAB -->[ \t]*$/m, match => normalizedProfile === 'NCE'
      ? ''
      : match.replace('<!-- @@FOUR-TO-ONE-TAB -->',
        '<button id="tab-four-to-one" onclick="setView(\'four-to-one\')" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 transition-all">4:1 Scenario</button>'));
  const profileHtml = html.replace(/^[ \t]*<!-- @@PERSONAE-TAB -->[ \t]*$/m, match => normalizedProfile === 'NCE'
    ? ''
    : match.replace('<!-- @@PERSONAE-TAB -->',
      '<button id="tab-personae" onclick="setView(\'personae\')" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 transition-all">Personae</button>'));
  const js = concatJs(profile);
  return profileHtml + '\n\n  <!-- Application Logic JS -->\n  <script>\n' + js + '\n  </script>\n</body>\n</html>\n';
}

function concatSalesRepJs() {
  return SALES_REP_JS_PARTS
    .map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', 'js', f))))
    .join('\n');
}

function buildSalesRepString() {
  const head = stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', 'head.html')))
    .replace(/<title>[\s\S]*?<\/title>/,
      '<title>Sales Rep Variable Compensation Calculator</title>');
  const body = stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', 'body-sales-rep.html')));
  const js = concatSalesRepJs();
  return head + '\n' + body +
    '\n\n  <!-- Application Logic JS -->\n  <script>\n' + js + '\n  </script>\n</body>\n</html>\n';
}

const OUT_PATH = path.join(ROOT, 'index.html');
const SALES_REP_OUT_PATH = path.join(ROOT, 'dist', 'sales-rep', 'index.html');

function main() {
  const check = process.argv.includes('--check');
  const appArg = process.argv.find(arg => arg.startsWith('--app='));
  const app = appArg ? appArg.slice('--app='.length) : 'default';
  if (app !== 'default' && app !== 'sales-rep') {
    console.error('build.js: unknown app "' + app + '" (expected default or sales-rep)');
    process.exit(1);
  }
  const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
  const profile = profileArg ? profileArg.slice('--profile='.length) : 'SWE';
  const outArg = process.argv.find(arg => arg.startsWith('--out='));
  const outPath = outArg
    ? path.resolve(ROOT, outArg.slice('--out='.length))
    : (app === 'sales-rep' ? SALES_REP_OUT_PATH : OUT_PATH);
  const out = app === 'sales-rep' ? buildSalesRepString() : buildString(profile);
  if (check) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (current !== out) {
      console.error('build.js --check: bundle périmé — relance node build.js');
      process.exit(1);
    }
    console.log('build.js --check: ' + path.relative(ROOT, outPath) + ' à jour');
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, out, 'utf8');
    if (app === 'default') {
      const fixture = CSV_FIXTURES[String(profile).toUpperCase()];
      if (fixture) {
        const fixturePath = path.join(ROOT, fixture);
        if (fs.existsSync(fixturePath)) {
          fs.copyFileSync(fixturePath, path.join(path.dirname(outPath), fixture));
        }
      }
      console.log('build.js: ' + path.relative(ROOT, outPath) + ' régénéré (' + profile + ')');
    } else {
      console.log('build.js: ' + path.relative(ROOT, outPath) + ' régénéré (' + app + ')');
    }
  }
}

if (require.main === module) main();

module.exports = {
  ROOT, HTML_PARTS, JS_PARTS, SALES_REP_JS_PARTS, CSV_FIXTURES,
  buildString, buildSalesRepString, concatJs, concatSalesRepJs, readOrFail
};
