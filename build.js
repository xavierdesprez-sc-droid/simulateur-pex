'use strict';
/**
 * Build: concatène src/*.html + src/js/*.js -> index.html (monofichier Apps Script).
 * Usage: node build.js | node build.js --check
 * Node seul, zéro dépendance, déterministe (pas de timestamp).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML_PARTS = [
  'head.html',
  'body-header.html',
  'body-standard.html',
  'body-advanced.html',
  'body-matrix.html',
  'body-four-to-one.html',
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

function buildString() {
  const html = HTML_PARTS.map(f => readOrFail(path.join(ROOT, 'src', f))).join('\n');
  const js = JS_PARTS.map(f => readOrFail(path.join(ROOT, 'src', 'js', f))).join('\n');
  return html + '\n  <!-- Application Logic JS -->\n  <script>\n' + js + '\n  </script>\n</body>\n</html>\n';
}

const check = process.argv.includes('--check');
const out = buildString();
const OUT_PATH = path.join(ROOT, 'index.html');
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
