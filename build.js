'use strict';
/**
 * Build: concatène src/*.html + src/js/*.js -> index.html (monofichier Apps Script).
 * Les placeholders <!-- @@TOP-STRIP:<nom> --> sont expansés via src/top-strip.js
 * (bandeau haut ΔPEX + slider, source unique pour Hybrid / 4:1 / Matrix).
 * Usage: node build.js [--app=sales-rep] [--out=path] | node build.js --check
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
  'body-footer.html',
];
const JS_PARTS = [
  '00-state.js',
  '01-engine.js',
  '02-standard.js',
  '03-advanced.js',
  '04-population.js',
  '05-matrix.js',
  '06-app.js',
];
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

function concatJs() {
  return JS_PARTS.map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', 'js', f)))).join('\n');
}

function concatSalesRepJs() {
  return SALES_REP_JS_PARTS
    .map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', 'js', f))))
    .join('\n');
}

function buildString() {
  const html = HTML_PARTS.map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', f)))).join('\n')
    .replace(/<!-- @@TOP-STRIP:([a-z0-9-]+) -->/g, (m, name) => stripTrailingNewlines(renderTopStrip(name)));
  const js = concatJs();
  return html + '\n\n  <!-- Application Logic JS -->\n  <script>\n' + js + '\n  </script>\n</body>\n</html>\n';
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
  const outArg = process.argv.find(arg => arg.startsWith('--out='));
  const outPath = outArg
    ? path.resolve(ROOT, outArg.slice('--out='.length))
    : (app === 'sales-rep' ? SALES_REP_OUT_PATH : OUT_PATH);
  const out = app === 'sales-rep' ? buildSalesRepString() : buildString();
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
    console.log('build.js: ' + path.relative(ROOT, outPath) + ' régénéré (' + app + ')');
  }
}

if (require.main === module) main();

module.exports = { ROOT, HTML_PARTS, JS_PARTS, SALES_REP_JS_PARTS, buildString, buildSalesRepString, concatJs, concatSalesRepJs, readOrFail };
