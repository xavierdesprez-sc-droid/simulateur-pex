# Split HTML maintenable avec déploiement Apps Script monofichier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Découper `index.html` (~3066 lignes / ~163 Ko actuels) en `src/` + `build.js` qui régénère un `index.html` byte-identique, sans changer le fonctionnel ni le workflow copier-coller Apps Script.

**Architecture:** Concat simple sans bundler ni modules ES : `src/*.html` + `src/js/*.js` (ordre numérique fixe) assemblés par `node build.js` en un seul `index.html` auto-porteur. `tests/harness.js` lit `src/js/` en dev avec fallback `index.html`, `tests/run.js` verrouille la fraîcheur via `build.js --check`.

**Tech Stack:** Node.js seul, zéro dépendance (comme `tests/`), UTF-8, globals navigateur (`state`, `Engine`, `onclick` inline), `HtmlService.createHtmlOutputFromFile('index')`.

## Global Constraints

- Maintenabilité uniquement, aucun changement fonctionnel (Engine, courbes, hybrid, grandfathering ≥ 20%, matrice 2×2/3×3, filtres Orga/Country/Position, vue 4:1).
- `Code.gs` inchangé (SHEET_ID, `getPopulation`, `doGet` vers fichier `index`).
- Copier-coller manuel conservé, pas de `clasp` imposé.
- Compatible `file://` local (pas de fetch inter-fichiers, pas de modules ES, CDN HTTPS inchangés).
- `index.html` reste commité, seul artefact déployé / ouvert en local / lu par les tests en fallback.
- `node tests/run.js` doit passer (actuel : 213 pass / 0 fail, la spec dit 180 — valeur périmée).
- Ordre JS fixe `00→06`, pas de timestamp dans le build (idempotent, déterministe).

---

### Task 1: `build.js` — concaténation déterministe + `--check`

**Files:**
- Create: `build.js`
- Modify: none
- Test: manuel via `node build.js` / `node build.js --check` (le test de non-régression byte-identique arrive en Task 2)

**Interfaces:**
- Consumes: `src/head.html`, `src/body-header.html`, `src/body-standard.html`, `src/body-advanced.html`, `src/body-matrix.html`, `src/body-four-to-one.html`, `src/body-footer.html`, `src/js/00-state.js`, `src/js/01-engine.js`, `src/js/02-standard.js`, `src/js/03-advanced.js`, `src/js/04-population.js`, `src/js/05-matrix.js`, `src/js/06-app.js`
- Produces: `index.html` régénéré (utilisé par Task 2 pour preuve byte-identique) ; `node build.js --check` exit 0/1 (utilisé par Task 3 comme gate)

- [ ] **Step 1: Écrire `build.js` minimal complet**

```js
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
```

- [ ] **Step 2: Vérifier la syntaxe du script (sans `src/` il doit échouer explicitement)**

Run: `node --check build.js && node build.js --check; echo exit=$?`
Expected: `node --check` silencieux (exit 0), puis `build.js --check` exit 1 avec `fichier manquant: src/head.html` (normal : `src/` créé en Task 2)

- [ ] **Step 3: Commit**

```bash
git add build.js
git commit -m "build: add src concat build.js with --check gate"
```

### Task 2: Split `src/` depuis `index.html` avec preuve byte-identique

**Files:**
- Create: `src/head.html`, `src/body-header.html`, `src/body-standard.html`, `src/body-advanced.html`, `src/body-matrix.html`, `src/body-four-to-one.html`, `src/body-footer.html`, `src/js/00-state.js`, `src/js/01-engine.js`, `src/js/02-standard.js`, `src/js/03-advanced.js`, `src/js/04-population.js`, `src/js/05-matrix.js`, `src/js/06-app.js`
- Modify: none (`index.html` doit être régénéré byte-identique, pas édité à la main)
- Test: `node build.js && git diff --stat index.html` (vide) + `node tests/run.js`

**Interfaces:**
- Consumes: `index.html` actuel (3066 lignes, 7 `<script>`, 4 `<main id="view-*">`), `build.js` (Task 1)
- Produces: fragments `src/**` (source de vérité dev lue par Task 3)

Découpage HTML par ancres commentaires existantes (robuste au drift 2794→3066 lignes de la spec) :
- `head.html` : `<!DOCTYPE html>` → `</head>` (inclut CDN tailwind/chart/lucide/katex/fonts + `tailwind.config` + `<style>`)
- `body-header.html` : `<body ...>` → juste avant `<main id="view-standard">` (header + tabs Standard/Advanced/Matrix/4:1 + presets)
- `body-standard.html` : `<main id="view-standard">` → juste avant `<!-- ===== ADVANCED VIEW`
- `body-advanced.html` : `<!-- ===== ADVANCED VIEW` → juste avant `<!-- ===== MATRIX VIEW`
- `body-matrix.html` : `<!-- ===== MATRIX VIEW` → juste avant `<!-- ===== 4:1 VIEW`
- `body-four-to-one.html` : `<!-- ===== 4:1 VIEW` → juste avant `<!-- Footer -->` (adaptation : la spec ne listait que 3 vues, la 4e vue `view-four-to-one` ajoutée depuis impose ce fichier)
- `body-footer.html` : `<!-- Footer -->` → `</footer>` uniquement (le wrapper `<!-- Application Logic JS -->` + `<script>` + `</script></body></html>` est ajouté par `build.js`, pas stocké)

Découpage JS (contenu entre `<script>` métier ligne ~1298 et `</script>` ligne ~3064, ordre numérique = dépendances implicites) :
- `00-state.js` : `const state = {...}` → `let mainChartInstance`, `renderMathSafely`
- `01-engine.js` : `const Engine = {...}` + `normalPdf`, `evalOldPayout`, `evalNewPayout`
- `02-standard.js` : `getCalibratedAchievement`, `calculateExpectedPayout`, `updateDashboard`, `updateIndividualRep`, `updateSegmentsTable`, `renderBreakpointsTable`, `updateBreakpoint`, `addBreakpointRow`, `removeBreakpointRow`, `initChart`, `updateChartData`, `toggleDataset`
- `03-advanced.js` : `advChartInstance`, `advState`, `fourToOneState`, `normalizeFourToOneCorridor`, `advNominals`, `evalOldE`, `evalNewBaseE`, `evalHybridE`, `evalHybridPayoutOldNominal`, `evalNewBasePayoutOldNominal`, `fourToOneNominals`, `evalFourToOnePayout`, `initAdvChart`, `updateAdvancedView` (la logique 4:1 calculatoire reste ici pour respecter le plan 00→06 de la spec, pas de nouveau `07-*.js`)
- `04-population.js` : `advPopulation`, `popAutoLoaded`, `setPopulationStatus`, `applyPopulationCsv`, `showCsvPicker`, `loadPopulationCsvFile`, `loadPopulationFromSheet`, `realAgg`, `popFilters`, `escapeHtmlStr`, `FILTER_KEYS`, `FILTER_SETS`, `populatePopFilters`, `readPopFilters`, `filteredPopulation`, `onPopFilterChange`, `onMatrixFilterChange`, `onFourToOneFilterChange`, `refreshPopulation`
- `05-matrix.js` : `matrixMode`, `matrixSize`, `popMatrix`, `halfInt`, `tercileCuts`, `bandInt`, `computeMatrix`, `setMatrixMode`, `setMatrixSize`, `renderMatrix`, `toggleDatasetAdv`
- `06-app.js` : `syncTargetSliders`, `syncMinInputs`, `setView` (4 vues), `applyPreset`, `resetDefaults`, `syncOverperfSliders`, `syncInputsFromState`, `setupEventListeners` + boot (`lucide.createIcons`, listeners initiaux)

- [ ] **Step 1: Extraire les fragments par script ponctuel (ne pas éditer à la main)**

Run:
```bash
python3 - <<'EOF'
import re, pathlib
s = pathlib.Path('index.html').read_text(encoding='utf-8')
# HTML head
head, rest = s.split('</head>', 1)
pathlib.Path('src/head.html').parent.mkdir(parents=True, exist_ok=True)
pathlib.Path('src/head.html').write_text(head + '</head>', encoding='utf-8')
# body fragments via anchors
body = rest  # starts after </head>
def cut(start_marker, end_marker, out):
    a = body.index(start_marker)
    b = body.index(end_marker)
    pathlib.Path(out).write_text(body[a:b].rstrip() + '\n', encoding='utf-8')
    return b
# body-header: <body...> up to <main id="view-standard">
a_body = body.index('<body')
b_std = body.index('<main id="view-standard"')
pathlib.Path('src/body-header.html').write_text(body[a_body:b_std].rstrip() + '\n', encoding='utf-8')
a_adv = body.index('<!-- ===== ADVANCED VIEW')
a_mat = body.index('<!-- ===== MATRIX VIEW')
a_41 = body.index('<!-- ===== 4:1 VIEW')
a_foot = body.index('<!-- Footer -->')
a_js = body.index('<!-- Application Logic JS -->')
pathlib.Path('src/body-standard.html').write_text(body[b_std:a_adv].rstrip() + '\n', encoding='utf-8')
pathlib.Path('src/body-advanced.html').write_text(body[a_adv:a_mat].rstrip() + '\n', encoding='utf-8')
pathlib.Path('src/body-matrix.html').write_text(body[a_mat:a_41].rstrip() + '\n', encoding='utf-8')
pathlib.Path('src/body-four-to-one.html').write_text(body[a_41:a_foot].rstrip() + '\n', encoding='utf-8')
foot_end = body.index('</footer>') + len('</footer>')
pathlib.Path('src/body-footer.html').write_text(body[a_foot:foot_end] + '\n', encoding='utf-8')
# JS: dernier <script> bare (même regex que harness)
scripts = list(re.finditer(r'<script>([\s\S]*?)</script>', s))
js = scripts[-1].group(1)
# split JS par marqueurs de fonctions (bornes ci-dessus) via recherche de définitions
bounds = ['const state =', 'const Engine =', 'function getCalibratedAchievement',
 'let advChartInstance', 'let advPopulation', 'let matrixMode', 'function syncTargetSliders']
idxs = [js.index(b) for b in bounds] + [len(js)]
names = ['00-state.js','01-engine.js','02-standard.js','03-advanced.js','04-population.js','05-matrix.js','06-app.js']
pathlib.Path('src/js').mkdir(parents=True, exist_ok=True)
for n, a, b in zip(names, idxs, idxs[1:]):
    pathlib.Path('src/js/'+n).write_text(js[a:b].strip() + '\n', encoding='utf-8')
print('split ok')
EOF
```
Expected: `split ok`, 7 HTML + 7 JS créés sous `src/`

- [ ] **Step 2: Prouver la régénération byte-identique (ajuster jointures `\n` jusqu'à diff vide)**

Run: `node build.js && git diff --stat index.html; echo diff_exit=$?`
Expected: aucune sortie de diff (fichier inchangé). Si diff non vide, ajuster uniquement `build.js` (jointures `\n`, wrapper script) ou les `\n` finaux des fragments — jamais `index.html` à la main — et recommencer jusqu'à diff vide.

- [ ] **Step 3: Lancer les 4 suites sur l'artefact régénéré**

Run: `node tests/run.js`
Expected: `TOTAL: 213 pass / 0 fail` (la spec dit 180 — périmé depuis les +26 checks population/4:1)

- [ ] **Step 4: Commit**

```bash
git add src build.js index.html
git commit -m "refactor: split index.html into src/ with byte-identical build"
```

### Task 3: `tests/harness.js` dual-mode + `tests/run.js` gate fraîcheur

**Files:**
- Modify: `tests/harness.js`, `tests/run.js`
- Test: `tests/01-model.test.js`, `tests/02-advanced-ui.test.js`, `tests/03-population.test.js`, `tests/04-standard-ui.test.js` (inchangés)

**Interfaces:**
- Consumes: `src/js/*.js` (Task 2), `node build.js --check` (Task 1)
- Produces: suites vertes en mode `src/` et en mode fallback `index.html`

- [ ] **Step 1: Patch `tests/harness.js` — charger `src/js/` si présent, sinon fallback dernier `<script>`**

```js
function loadPageScript() {
  const srcDir = path.join(__dirname, '..', 'src', 'js');
  if (fs.existsSync(srcDir)) {
    const order = ['00-state.js', '01-engine.js', '02-standard.js', '03-advanced.js', '04-population.js', '05-matrix.js', '06-app.js'];
    return order.map(f => {
      const p = path.join(srcDir, f);
      if (!fs.existsSync(p)) throw new Error(`harness: src/js manquant: ${f} — relance le split (Task 2)`);
      return fs.readFileSync(p, 'utf8');
    }).join('\n');
  }
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  return scripts[scripts.length - 1][1];
}
```

Remplacer dans `runSuite` la ligne `const page = extractPageScript(fs.readFileSync(HTML_PATH, 'utf8'));` par `const page = loadPageScript();` et garder `extractPageScript` pour le fallback. `htmlSrc` continue de lire `index.html` généré (assertions DOM/classes inchangées).

- [ ] **Step 2: Patch `tests/run.js` — gate `build.js --check` avant les suites**

```js
'use strict';
/** Runner: `node tests/run.js` — exit code 1 if at least one test fails. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runSuite, results } = require('./harness');

// Fraîcheur: si src/ existe, index.html doit être à jour
if (fs.existsSync(path.join(__dirname, '..', 'src', 'js'))) {
  try {
    execFileSync('node', [path.join(__dirname, '..', 'build.js'), '--check'], { stdio: 'inherit' });
  } catch {
    console.error('tests/run.js: index.html périmé — relance node build.js');
    process.exit(1);
  }
}

// Backend Apps Script syntax check
new Function(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'));
console.log('Code.gs: syntax OK');

const suites = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
for (const f of suites) {
  console.log(f);
  runSuite(path.join(__dirname, f));
}

console.log('-------------------------------------------');
console.log(`TOTAL: ${results.pass} pass / ${results.fail} fail`);
process.exit(results.fail ? 1 : 0);
```

- [ ] **Step 3: Vérifier les 3 comportements (frais, périmé, fallback)**

Run: `node build.js && node tests/run.js`
Expected: `build.js --check: index.html à jour` puis `TOTAL: 213 pass / 0 fail`

Run: `echo "// touch" >> src/js/06-app.js && node tests/run.js; echo exit=$?; git checkout -- src/js/06-app.js`
Expected: `index.html périmé — relance node build.js` exit 1 (puis restore du fichier)

Run: `mv src /tmp/src-backup && node tests/run.js; echo exit=$?; mv /tmp/src-backup src`
Expected: suites passent en fallback `index.html` (même total), prouvant la compatibilité sans `src/`

- [ ] **Step 4: Commit**

```bash
git add tests/harness.js tests/run.js
git commit -m "test: harness prefers src/js with index.html fallback, run.js checks build freshness"
```

### Task 4: Workflow, non-régression locale/Apps Script, clôture

**Files:**
- Modify: `README.md`
- Test: `node build.js --check`, `node tests/run.js`, ouverture locale `index.html`, contrôle `Code.gs`

**Interfaces:**
- Consumes: `build.js`, `src/**`, `index.html`, `tests/*` (Tasks 1-3)
- Produces: workflow documenté, preuve finale d'acceptation

- [ ] **Step 1: Documenter le workflow dans `README.md` (section Build)**

```markdown
## Build (split src/ -> index.html monofichier)

Éditer `src/**`, puis :

```
node build.js
node tests/run.js
```

`index.html` est généré et commité (artefact Apps Script + ouverture locale).
`node build.js --check` échoue si `index.html` est périmé (utilisé par `tests/run.js`).
Déploiement inchangé : copier-coller `index.html` vers le fichier `index` Apps Script (+ `Code.gs` si changé).
```

- [ ] **Step 2: Preuve d'acceptation complète**

Run: `node build.js && node build.js --check && node tests/run.js && ls -l index.html src/js`
Expected: `--check: index.html à jour`, `TOTAL: 213 pass / 0 fail`, `index.html` ≈ 163 Ko (± quelques %)

- [ ] **Step 3: Contrôles manuels (ne pas committer de changement fonctionnel)**

```bash
git diff --stat
git status --short
grep -c "createHtmlOutputFromFile('index')" Code.gs
```

Expected: seuls `build.js`, `src/**`, `tests/harness.js`, `tests/run.js`, `README.md` modifiés/créés ; `Code.gs` inchangé (1 occurrence) ; `index.html` inchangé depuis Task 2 (diff vide)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document src build workflow"
```
