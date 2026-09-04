'use strict';
/**
 * Build: concatène src/*.html + src/js/*.js -> index.html (monofichier Apps Script).
 * Les placeholders <!-- @@TOP-STRIP:<nom> --> sont expansés via src/top-strip.js
 * (bandeau haut ΔPEX + slider, source unique pour Hybrid / 4:1 / Matrix).
 * Usage: node build.js | node build.js --check
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

function buildString() {
  const html = HTML_PARTS.map(f => stripTrailingNewlines(readOrFail(path.join(ROOT, 'src', f)))).join('\n')
    .replace(/<!-- @@TOP-STRIP:([a-z0-9-]+) -->/g, (m, name) => stripTrailingNewlines(renderTopStrip(name)));
  const js = concatJs();
  return html + '\n\n  <!-- Application Logic JS -->\n  <script>\n' + js + '\n  </script>\n</body>\n</html>\n';
}

const OUT_PATH = path.join(ROOT, 'index.html');

function main() {
  const check = process.argv.includes('--check');
  const out = buildString();
  if (check) {
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== out) {
      console.error('build.js --check: index.html périmé — relance node build.js');
      process.exit(1);
    }
    console.log('build.js --check: index.html à jour');
  } else {
    fs.writeFileSync(OUT_PATH, out, 'utf8');
    console.log('build.js: index.html régénéré');
  }
}

if (require.main === module) main();

module.exports = { ROOT, HTML_PARTS, JS_PARTS, buildString, concatJs, readOrFail };
