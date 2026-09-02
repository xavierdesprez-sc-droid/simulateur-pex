# Tab Matrix dédiée — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Déplacer la matrice Salaire × Performance dans une 3e tab principale « Matrix » avec contrôles synchronisés (target increase, min100/min200, filtres), mode par défaut « Δ vs current », chips d'identification Hyb/New, et couleur amber pour les valeurs « Hybrid expected value ».

**Architecture:** Trois `<main>` togglés par `setView` (pattern existant). Contrôles dupliqués synchronisés sur un état unique (`state.targetIncrease`, `advState.min100E/min200E`, `popFilters`), même pattern que `syncTargetSliders`. La matrice est recalculée par `refreshPopulation()` déjà appelé par tous les chemins de mise à jour.

**Tech Stack:** HTML/JS mono-fichier (`index.html`), Tailwind CDN, tests Node sans framework (`tests/run.js`, harness DOM simulé — `classList.toggle` est un no-op, les listeners `addEventListener` ne sont JAMAIS attachés en test : les suites appellent les fonctions directement).

**Spec:** `docs/superpowers/specs/2026-09-02-tab-matrix-dediee-design.md`

## Global Constraints

- Mono-fichier : tout le code applicatif vit dans `index.html` (script inline unique).
- Aucun changement de calcul (`Engine.*`, `computeMatrix`, quadrants).
- Couleurs : hybrid = `text-amber-600`, new = `text-indigo-600`, deltas = rose/émeraude (inchangé).
- Tests : `node tests/run.js` doit finir à `TOTAL: N pass / 0 fail` à chaque commit.
- Harness de test : `document.getElementById` auto-crée les éléments manquants (Proxy) — les sélecteurs des nouvelles vues fonctionnent en test sans DOM réel.
- Ne pas casser les patterns existants : guarded `if (el)` dans les fonctions de sync.

---

### Task 1: Couleur amber pour « Hybrid expected value »

**Files:**
- Modify: `index.html` (fonction `refreshPopulation`, ligne de la cellule `eHyb` du tableau population, actuellement ~ligne 2242)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Produces: rien de nouveau ; change uniquement une classe CSS de la cellule `eHyb`.

- [ ] **Step 1: Write the failing test**

Dans `tests/03-population.test.js`, juste après le bloc `check('new Δ ≤ −20 € in red', ...)` (~ligne 139), ajouter :

```js
  check('hybrid expected value cell in amber (not orange/red)', tblNew.indexOf('text-amber-600') > -1 && tblNew.indexOf('text-orange-700') === -1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run.js`
Expected: FAIL avec `hybrid expected value cell in amber (not orange/red)` (la cellule est encore `text-orange-700`).

- [ ] **Step 3: Write minimal implementation**

Dans `index.html`, fonction `refreshPopulation`, remplacer :

```js
          '<td class="py-1.5 px-3 font-bold text-orange-700">' + fmtE(r.eHyb) + '</td>' +
```

par :

```js
          '<td class="py-1.5 px-3 font-bold text-amber-600">' + fmtE(r.eHyb) + '</td>' +
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/run.js`
Expected: PASS sur tous les tests (`0 fail`).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "ui: hybrid expected value in amber instead of red-ish orange"
```

---

### Task 2: 3e tab « Matrix » — bouton, vue vide, setView

**Files:**
- Modify: `index.html` (header ~lignes 106-114 : boutons de tab ; fonction `setView` ~ligne 2353 ; insertion d'un `<main id="view-matrix">` vide après le `</main>` de `view-advanced`, ligne ~1098)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Produces: `setView('matrix')` fonctionnel ; `<main id="view-matrix">` présent (les tâches 3-5 le remplissent).

- [ ] **Step 1: Write the failing test**

Dans `tests/03-population.test.js`, après le check `switch back to levels` (~ligne 172), ajouter :

```js
  // ===== Third tab: Matrix =====
  setView('matrix');
  check('tab-matrix active on setView(matrix)', els['tab-matrix'].className.indexOf('shadow-sm') > -1);
  check('tab-standard inactive on setView(matrix)', els['tab-standard'].className.indexOf('shadow-sm') === -1);
  check('tab-advanced inactive on setView(matrix)', els['tab-advanced'].className.indexOf('shadow-sm') === -1);
  check('view-matrix main exists', !!els['view-matrix']);
  setView('standard');
  check('tab-standard active on setView(standard)', els['tab-standard'].className.indexOf('shadow-sm') > -1);
  check('tab-matrix inactive on setView(standard)', els['tab-matrix'].className.indexOf('shadow-sm') === -1);
  setView('advanced');
  check('tab-advanced active on setView(advanced)', els['tab-advanced'].className.indexOf('shadow-sm') > -1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run.js`
Expected: FAIL sur `tab-matrix active on setView(matrix)` (le bouton n'existe pas / className ne change pas).

- [ ] **Step 3: Implement — bouton header**

Dans `index.html` header, après le bouton `tab-advanced` (ligne ~111-113), ajouter :

```html
          <button id="tab-matrix" onclick="setView('matrix')" class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 transition-all">
            Matrix
          </button>
```

- [ ] **Step 4: Implement — vue vide**

Après le `</main>` de `view-advanced` (ligne ~1098, juste avant `<!-- Footer -->`), insérer :

```html
  <!-- ===== MATRIX VIEW: SALARY × PERFORMANCE ===== -->
  <main id="view-matrix" class="hidden flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
  </main>
```

- [ ] **Step 5: Implement — setView 3 vues**

Remplacer toute la fonction `setView` existante par :

```js
    function setView(view) {
      const isAdv = view === 'advanced';
      const isMatrix = view === 'matrix';
      document.getElementById('view-standard').classList.toggle('hidden', isAdv || isMatrix);
      document.getElementById('view-advanced').classList.toggle('hidden', !isAdv);
      document.getElementById('view-matrix').classList.toggle('hidden', !isMatrix);
      const active = 'px-3 py-1.5 rounded-lg bg-white shadow-sm ';
      const inactive = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 transition-all';
      document.getElementById('tab-standard').className = (view === 'standard') ? active + 'text-indigo-600' : inactive;
      document.getElementById('tab-advanced').className = isAdv ? active + 'text-orange-600' : inactive;
      document.getElementById('tab-matrix').className = isMatrix ? active + 'text-emerald-600' : inactive;
      if (isAdv) {
        // Lazy init: Chart.js needs a visible container to size correctly
        if (!advChartInstance) initAdvChart();
        updateAdvancedView();
        // Auto-load the Sheet population on first visit to the advanced view
        if (!popAutoLoaded) {
          popAutoLoaded = true;
          loadPopulationFromSheet();
        }
      }
      if (isMatrix) renderMatrix();
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node tests/run.js`
Expected: PASS sur tous les tests (`0 fail`).

- [ ] **Step 7: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "ui: add third Matrix tab with 3-way setView"
```

---

### Task 3: Déplacer la matrice + filtres dupliqués synchronisés

**Files:**
- Modify: `index.html` :
  - Supprimer le bloc `<div id="matrix-card">…</div>` de la carte Population de la vue Advanced (actuellement lignes 1072-1092).
  - Insérer ce bloc (enrichi de la carte contrôles + filtres) dans `<main id="view-matrix">`.
  - Fonctions `populatePopFilters` (~2149) et `onPopFilterChange` (~2166) : gérer les deux jeux de selects.
  - `refreshPopulation` (~2173) : toggle de `matrix-filter-zone`.
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `setView('matrix')` (Task 2), `popFilters`, `refreshPopulation`.
- Produces: `readPopFilters(prefix)` (prefix `'pop'` ou `'matrix'`), `onMatrixFilterChange()` ; ids `matrix-filter-orga/country/position`, `matrix-filter-zone` ; la carte matrice (ids `matrix-card`, `matrix-empty`, `matrix-grid`, `matrix-count-low/high`, `matrix-low-low`, `matrix-low-top`, `matrix-high-low`, `matrix-high-top`, `matrix-mode-levels`, `matrix-mode-deltas`) vit dans `view-matrix`.

- [ ] **Step 1: Write the failing test**

Dans `tests/03-population.test.js`, dans le bloc « Third tab: Matrix » ajouté en Task 2 (entre `setView('matrix')` et `setView('standard')`), ajouter après le check `view-matrix main exists` :

```js
  refreshPopulation();
  check('matrix card moved: matrix-card inside view-matrix', htmlSrc.indexOf('id="view-matrix"') < htmlSrc.indexOf('id="matrix-card"'));
  check('matrix card removed from advanced population card', htmlSrc.indexOf('id="pop-table-body"') < htmlSrc.indexOf('id="matrix-card"') && htmlSrc.indexOf('id="pop-results"') < htmlSrc.indexOf('id="view-matrix"'));
  // Seed a population containing the filter values (populatePopFilters resets
  // selections not present in the loaded population)
  advPopulation = [
    { id: 'M1', orga: 'EMEA Direct', country: 'France', position: 'AE', fixed: 50000, nominal: 5000 },
    { id: 'M2', orga: 'EMEA Direct', country: 'Spain', position: 'KAM', fixed: 60000, nominal: 14000 }
  ];
  refreshPopulation();
  els['matrix-filter-orga'].value = 'EMEA Direct';
  onMatrixFilterChange();
  check('matrix filter syncs to pop filter', els['pop-filter-orga'].value === 'EMEA Direct' && popFilters.orga === 'EMEA Direct');
  els['pop-filter-country'].value = 'France';
  onPopFilterChange();
  check('pop filter syncs to matrix filter', els['matrix-filter-country'].value === 'France' && popFilters.country === 'France');
  els['matrix-filter-orga'].value = ''; els['matrix-filter-country'].value = '';
  onMatrixFilterChange();
  check('matrix filters reset', popFilters.orga === '' && popFilters.country === '' && els['pop-filter-orga'].value === '');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run.js`
Expected: FAIL sur `matrix card moved: matrix-card inside view-matrix` et `onMatrixFilterChange is not defined`.

- [ ] **Step 3: Implement — déplacer le DOM**

3a. Dans la carte Population de la vue Advanced, **supprimer** tout le bloc :

```html
            <div id="matrix-card" class="border border-slate-200 rounded-xl p-4 space-y-3">
              … (jusqu'au </div> fermant matrix-grid et matrix-card)
            </div>
```

3b. **Remplacer** le contenu de `<main id="view-matrix">` (Task 2) par :

```html
    <!-- Controls: synced sliders & minimums & filters -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
      <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
        <div class="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><i data-lucide="grid-3x3" class="w-4 h-4"></i></div>
        <h2 class="font-bold text-slate-900 text-sm">Scenario Controls</h2>
        <span class="text-[10px] text-slate-400">synced with Standard &amp; Advanced views</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="matrix-controls-zone">
        <!-- Target increase (filled in Task 4) -->
        <div id="matrix-ctrl-target"></div>
        <!-- Min nominal & min 200% (filled in Task 4) -->
        <div id="matrix-ctrl-mins" class="md:col-span-2"></div>
      </div>
      <div id="matrix-filter-zone" class="hidden grid grid-cols-3 gap-3">
        <div>
          <label class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold block mb-1">Orga</label>
          <select id="matrix-filter-orga" onchange="onMatrixFilterChange()" class="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">All</option></select>
        </div>
        <div>
          <label class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold block mb-1">Country</label>
          <select id="matrix-filter-country" onchange="onMatrixFilterChange()" class="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">All</option></select>
        </div>
        <div>
          <label class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold block mb-1">Position</label>
          <select id="matrix-filter-position" onchange="onMatrixFilterChange()" class="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">All</option></select>
        </div>
      </div>
    </div>

    <!-- Salary × Performance Matrix -->
    <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
      <div id="matrix-card" class="border border-slate-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-sm">Salary &times; Performance Matrix</h3>
          <div class="flex gap-1">
            <button id="matrix-mode-levels" onclick="setMatrixMode('levels')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 transition-all">Expectations</button>
            <button id="matrix-mode-deltas" onclick="setMatrixMode('deltas')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all">&Delta; vs current</button>
          </div>
        </div>
        <div id="matrix-empty" class="hidden text-xs text-slate-400 text-center py-4">Load a population to display the matrix.</div>
        <div id="matrix-grid" class="hidden grid grid-cols-[auto_1fr_1fr] gap-2 text-xs">
          <div></div>
          <div class="text-center font-semibold text-slate-500">Low performer<br><span class="text-[10px] font-normal text-slate-400">lower half of distribution</span></div>
          <div class="text-center font-semibold text-slate-500">Top performer<br><span class="text-[10px] font-normal text-slate-400">upper half of distribution</span></div>
          <div class="self-center font-semibold text-slate-500">Low Salary<br><span id="matrix-count-low" class="text-[10px] font-normal text-slate-400"></span></div>
          <div id="matrix-low-low" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
          <div id="matrix-low-top" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
          <div class="self-center font-semibold text-slate-500">High Salary<br><span id="matrix-count-high" class="text-[10px] font-normal text-slate-400"></span></div>
          <div id="matrix-high-low" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
          <div id="matrix-high-top" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 4: Implement — sync des filtres**

Remplacer `populatePopFilters` et `onPopFilterChange` par :

```js
    // Repopulates filter options from the loaded population,
    // keeping the current selection if it still exists (otherwise "All").
    // Both filter sets (Advanced view + Matrix tab) stay in sync.
    const FILTER_KEYS = ['orga', 'country', 'position'];
    const FILTER_SETS = ['pop', 'matrix'];

    function populatePopFilters() {
      FILTER_KEYS.forEach(key => {
        const vals = [...new Set(advPopulation.map(r => String(r[key] || '').trim()).filter(Boolean))].sort();
        if (vals.indexOf(popFilters[key]) === -1) popFilters[key] = '';
        FILTER_SETS.forEach(prefix => {
          const sel = document.getElementById(prefix + '-filter-' + key);
          sel.innerHTML = '<option value="">All</option>' + vals.map(v => '<option value="' + escapeHtmlStr(v) + '">' + escapeHtmlStr(v) + '</option>').join('');
          sel.value = popFilters[key];
        });
      });
    }

    function readPopFilters(prefix) {
      FILTER_KEYS.forEach(key => {
        popFilters[key] = document.getElementById(prefix + '-filter-' + key).value || '';
      });
      FILTER_SETS.forEach(p => {
        FILTER_KEYS.forEach(key => {
          const sel = document.getElementById(p + '-filter-' + key);
          if (sel) sel.value = popFilters[key];
        });
      });
    }

    function onPopFilterChange() {
      readPopFilters('pop');
      refreshPopulation();
    }

    function onMatrixFilterChange() {
      readPopFilters('matrix');
      refreshPopulation();
    }
```

Dans `refreshPopulation`, ajouter juste après la ligne `document.getElementById('pop-input-zone').classList.toggle('hidden', has);` :

```js
      document.getElementById('matrix-filter-zone').classList.toggle('hidden', !has);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/run.js`
Expected: PASS sur tous les tests (`0 fail`).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "ui: move Salary x Performance matrix to dedicated Matrix tab with synced filters"
```

---

### Task 4: Contrôles synchronisés — Target Increase + Min100/Min200

**Files:**
- Modify: `index.html` :
  - Remplir les placeholders `matrix-ctrl-target` / `matrix-ctrl-mins` (Task 3).
  - `syncTargetSliders` (~2340) : 3e slider.
  - Nouvelle fonction `syncMinInputs()` + listeners dans `setupEventListeners` (~2453) : remplacer les listeners `adv-min-100`/`adv-min-200`, ajouter `matrix-target-increase`, `matrix-min-100`, `matrix-min-200`.
  - Appel initial `syncMinInputs()` dans `window.addEventListener('DOMContentLoaded', ...)` (~2594).
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `matrix-ctrl-target`/`matrix-ctrl-mins` (Task 3), `advState.min100E/min200E`, `state.targetIncrease`, `syncTargetSliders`, `refreshPopulation`, `updateDashboard`, `updateAdvancedView`.
- Produces: `syncMinInputs()` ; ids `matrix-target-increase`, `matrix-val-target-increase`, `matrix-min-100`, `matrix-min-200`.

- [ ] **Step 1: Write the failing test**

Dans `tests/03-population.test.js`, dans le bloc « Third tab: Matrix » (après le check `matrix filters reset`), ajouter :

```js
  // Sync target increase & minimums
  syncTargetSliders();
  check('matrix target slider synced', els['matrix-target-increase'].value == state.targetIncrease && els['matrix-val-target-increase'].innerText.indexOf('%') > -1);
  state.targetIncrease = 15;
  syncTargetSliders();
  check('matrix target slider follows state', els['matrix-target-increase'].value == 15);
  state.targetIncrease = 0;
  syncTargetSliders();
  advState.min100E = 12000;
  syncMinInputs();
  check('matrix min100 synced from state', els['matrix-min-100'].value == 12000 && els['adv-min-100'].value == 12000);
  const hybBefore = realAgg.pexHyb;
  advState.min100E = 0;
  syncMinInputs();
  refreshPopulation();
  check('matrix min inputs exist in view', htmlSrc.indexOf('id="matrix-min-100"') > -1 && htmlSrc.indexOf('id="matrix-min-200"') > -1 && htmlSrc.indexOf('id="matrix-target-increase"') > -1);
  check('min100=0 restores baseline', realAgg.pexHyb === hybBefore);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run.js`
Expected: FAIL sur `matrix target slider synced` (éléments/ids inexistants) et `syncMinInputs is not defined`.

- [ ] **Step 3: Implement — contrôles HTML**

3a. Remplacer `<div id="matrix-ctrl-target"></div>` par :

```html
        <div class="space-y-2">
          <div class="flex justify-between items-center text-xs">
            <label for="matrix-target-increase" class="font-semibold text-slate-700">Target Increase</label>
            <span id="matrix-val-target-increase" class="font-mono font-bold text-indigo-600 text-sm bg-indigo-50 px-2 py-0.5 rounded-md">+0.0%</span>
          </div>
          <input type="range" id="matrix-target-increase" min="0" max="60" step="0.5" value="0" class="w-full cursor-pointer accent-indigo-600">
        </div>
```

3b. Remplacer `<div id="matrix-ctrl-mins" class="md:col-span-2"></div>` par :

```html
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">Min. Nominal (at 100%)</label>
            <div class="relative">
              <input type="number" id="matrix-min-100" value="0" step="500" min="0" class="w-full text-xs font-mono font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500">
              <span class="absolute right-2.5 top-1.5 text-xs text-slate-400">€</span>
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">Min. Amount at 200%</label>
            <div class="relative">
              <input type="number" id="matrix-min-200" value="0" step="500" min="0" class="w-full text-xs font-mono font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500">
              <span class="absolute right-2.5 top-1.5 text-xs text-slate-400">€</span>
            </div>
          </div>
        </div>
```

- [ ] **Step 4: Implement — fonctions de sync**

4a. Dans `syncTargetSliders`, ajouter après les lignes gérant `l2` :

```js
      const s3 = document.getElementById('matrix-target-increase');
      if (s3) s3.value = v;
      const l3 = document.getElementById('matrix-val-target-increase');
      if (l3) l3.innerText = label;
```

4b. Ajouter la nouvelle fonction juste après `syncTargetSliders` :

```js
    // Keeps the 4 min inputs (Advanced view + Matrix tab) in sync with advState
    function syncMinInputs() {
      const pairs = [['adv-min-100', advState.min100E], ['adv-min-200', advState.min200E], ['matrix-min-100', advState.min100E], ['matrix-min-200', advState.min200E]];
      pairs.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      });
    }
```

4c. Dans `setupEventListeners`, **remplacer** les deux listeners existants `adv-min-100` et `adv-min-200` par :

```js
      document.getElementById('adv-min-100').addEventListener('input', (e) => {
        advState.min100E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      document.getElementById('adv-min-200').addEventListener('input', (e) => {
        advState.min200E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      document.getElementById('matrix-target-increase').addEventListener('input', (e) => {
        state.targetIncrease = parseFloat(e.target.value);
        syncTargetSliders();
        updateDashboard();
        updateAdvancedView();
      });

      document.getElementById('matrix-min-100').addEventListener('input', (e) => {
        advState.min100E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      document.getElementById('matrix-min-200').addEventListener('input', (e) => {
        advState.min200E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });
```

4d. Dans `window.addEventListener('DOMContentLoaded', ...)`, ajouter `syncMinInputs();` juste après `syncInputsFromState();`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/run.js`
Expected: PASS sur tous les tests (`0 fail`).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "ui: synced target increase slider and min nominal/min 200% controls in Matrix tab"
```

---

### Task 5: Mode par défaut « Δ vs current » + chips Hyb/New

**Files:**
- Modify: `index.html` :
  - `let matrixMode = 'deltas';` (~ligne 2255).
  - Classes initiales des boutons dans le bloc `matrix-card` (HTML déplacé en Task 3) : inverser l'état actif.
  - `renderMatrix` (~2296) : cell avec chips explicites.
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `matrix-card` HTML (Task 3), `renderMatrix`, `popMatrix.quadrants[q][p]` = `{ old, hyb, new }`.
- Produces: rien de nouveau.

- [ ] **Step 1: Write the failing test**

Dans `tests/03-population.test.js`, remplacer le check existant `matrix card: 4 cells rendered` (bloc « Matrix: DOM rendering and switch ») et ajouter les nouveaux checks. Le bloc devient :

```js
  // ===== Matrix: DOM rendering and switch =====
  check('default mode is deltas', els['matrix-mode-deltas'].className.indexOf('text-orange-700') > -1 && els['matrix-mode-levels'].className.indexOf('text-slate-500') > -1);
  check('cells identified: Δ Hyb and Δ New chips', ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('&Delta; Hyb') > -1 && els[id].innerHTML.indexOf('&Delta; New') > -1));
  check('cells colored: amber and indigo present in levels', setMatrixMode('levels') === undefined && ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('text-amber-600') > -1 && els[id].innerHTML.indexOf('text-indigo-600') > -1));
  check('levels cells identified: Hyb and New chips', ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('Hyb</span>') > -1 && els[id].innerHTML.indexOf('New</span>') > -1));
  setMatrixMode('deltas');
  check('headcounts shown', els['matrix-count-low'].innerText.indexOf('2') > -1 && els['matrix-count-high'].innerText.indexOf('2') > -1);
  check('deltas switch: cells colored as Δ', els['matrix-low-low'].innerHTML.indexOf('text-rose-600') > -1 || els['matrix-low-low'].innerHTML.indexOf('text-emerald-600') > -1);
  check('deltas switch: active button', els['matrix-mode-deltas'].className.indexOf('text-orange-700') > -1 && els['matrix-mode-levels'].className.indexOf('text-slate-500') > -1);
  check('switch back to levels', els['matrix-mode-levels'].className.indexOf('text-orange-700') > -1);
  setMatrixMode('deltas');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run.js`
Expected: FAIL sur `default mode is deltas` (mode actuel : levels) et sur les chips.

- [ ] **Step 3: Implement — mode par défaut**

3a. Remplacer `let matrixMode = 'levels';` par :

```js
    let matrixMode = 'deltas';
```

3b. Dans le HTML de `matrix-card` (Task 3), inverser les classes des deux boutons :

```html
            <button id="matrix-mode-levels" onclick="setMatrixMode('levels')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all">Expectations</button>
            <button id="matrix-mode-deltas" onclick="setMatrixMode('deltas')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 transition-all">&Delta; vs current</button>
```

- [ ] **Step 4: Implement — chips dans renderMatrix**

Remplacer la fonction fléchée `cell` dans `renderMatrix` par :

```js
        const chip = txt => '<span class="text-[9px] font-semibold uppercase tracking-wide bg-white border border-slate-200 rounded px-1 mr-1">' + txt + '</span>';
        const cell = d => {
          if (matrixMode === 'levels') {
            return '<span class="block font-bold text-amber-600">' + chip('Hyb') + fmtMx(d.hyb) + '</span>'
                 + '<span class="block font-bold text-indigo-600">' + chip('New') + fmtMx(d.new) + '</span>';
          }
          const dh = d.hyb - d.old, dn = d.new - d.old;
          return '<span class="block font-bold ' + deltaCls(dh) + '">' + chip('&Delta; Hyb') + (dh > 0 ? '+' : '') + fmtMx(dh) + '</span>'
               + '<span class="block font-bold ' + deltaCls(dn) + '">' + chip('&Delta; New') + (dn > 0 ? '+' : '') + fmtMx(dn) + '</span>';
        };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/run.js`
Expected: PASS sur tous les tests (`0 fail`). Si l'ancien check `matrix card: 4 cells rendered` a été conservé, il doit avoir été remplacé par les nouveaux checks du Step 1.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "ui: matrix defaults to deltas mode with explicit Hyb/New chips"
```

---

### Task 6: Vérification finale

**Files:**
- Aucun fichier modifié attendu.

- [ ] **Step 1: Run full test suite**

Run: `node tests/run.js`
Expected: `TOTAL: N pass / 0 fail` (N ≥ 133 + nouveaux checks).

- [ ] **Step 2: Vérification manuelle navigateur**

Run: `python3 -m http.server 8080` (ou ouvrir `index.html` directement), charger `population_test.csv` via l'onglet Population de la vue Advanced, puis vérifier :
- La tab « Matrix » affiche la matrice + contrôles + filtres.
- Le slider Target Increase de la tab Matrix bouge le slider de la Standard et de l'Advanced (et réciproquement).
- Min. Nominal / Min. Amount éditables des deux côtés, valeurs synchronisées.
- Les cellules affichent `Δ Hyb` / `Δ New` par défaut (mode Δ vs current actif au chargement).
- Le tableau population : colonne Hybrid expected value en amber, pertes toujours en rose.

- [ ] **Step 3: Commit (si ajustements)**

```bash
git add -A
git commit -m "fix: final adjustments for Matrix tab"
```
