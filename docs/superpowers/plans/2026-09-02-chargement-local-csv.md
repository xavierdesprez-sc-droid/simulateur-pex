# Chargement local du CSV de population — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hors Apps Script, le bouton « Load from Google Sheet » charge `population_test.csv` (fetch, puis sélecteur de fichier en repli) dans `advPopulation`.

**Architecture:** Fonction pure `parsePopulationCsv(text)` (mapping identique à `Code.gs#getPopulation`) + trois helpers DOM (`applyPopulationCsv`, `showCsvPicker`, `loadPopulationCsvFile`) et une branche locale dans `loadPopulationFromSheet`. Un `<input type="file">` caché sert de repli au fetch bloqué par CORS en `file://`.

**Tech Stack:** Vanilla JS (page unique `index.html`), suite de tests maison (`node tests/run.js`, DOM simulé dans `tests/harness.js`).

## Global Constraints

- Mapping CSV strictement identique à `Code.gs` : A=Orga, B=Position, C=Country, D=ID, E–F ignorées, G=Base Salary, H=Amount ; filtre `fixed > 0 && nominal >= 0` ; fallback d'id `rep<i>` où `i` = index de la ligne de données (1-based, lignes invalides comprises).
- Le chemin Apps Script de `loadPopulationFromSheet` reste inchangé (les tests existants 03-population s'appuient dessus).
- Pas de nouvelle dépendance ; tout tient dans `index.html`.
- Langue de l'UI : anglais (messages statut existants en anglais).
- Commits en français, style du repo (phrase descriptive sans préfixe conventionnel).

---

### Task 1: Fonction pure `parsePopulationCsv`

**Files:**
- Modify: `index.html` (insérer juste après la fermeture de l'objet `const Engine = { … };`, ligne ~1215)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: rien (pure).
- Produces: `parsePopulationCsv(text) → { reps: [{ id, orga, position, country, fixed, nominal }], ignored: number }`. Utilisée par `applyPopulationCsv` / `loadPopulationCsvFile` (Task 2).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/03-population.test.js`, insérer avant la section `// ===== Reset → average model =====` (ligne ~174) :

```js
  // ===== Local CSV: parsePopulationCsv (pure) =====
  const csv1 = parsePopulationCsv(
    'Orga,Position,Country,ID,,,Base Salary,Amount\n' +
    'FR,AE,France,C1,,,50000,5000\n' +
    ',,,,,,60000,14000\n' +
    'DE,KAM,Germany,"C 3",,,40000,3000\n' +
    'FR,AE,Spain,C4,,,0,5000\n' +
    'FR,AE,Italy,C5\n'
  );
  check('parse: 3 valid reps', csv1.reps.length === 3);
  check('parse: 2 ignored rows', csv1.ignored === 2);
  check('parse: full mapping row 1', csv1.reps[0].id === 'C1' && csv1.reps[0].orga === 'FR' && csv1.reps[0].position === 'AE' && csv1.reps[0].country === 'France' && csv1.reps[0].fixed === 50000 && csv1.reps[0].nominal === 5000);
  check('parse: id fallback rep2', csv1.reps[1].id === 'rep2');
  check('parse: quoted field stripped', csv1.reps[2].id === 'C 3');
  check('parse: \r\n tolerated', parsePopulationCsv('H,H,H,H,,,H,H\r\nFR,AE,France,C9,,,50000,5000\r\n').reps.length === 1);
  check('parse: empty nominal kept as 0', parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,France,C6,,,40000,\n').reps[0].nominal === 0);
  check('parse: blank lines tolerated', parsePopulationCsv('\nH,H,H,H,,,H,H\n\nFR,AE,France,C7,,,45000,7000\n\n').reps.length === 1);
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node tests/run.js`
Expected: FAIL — `parse: 3 valid reps` (et les suivants) car `parsePopulationCsv` n'existe pas (`ReferenceError` ou échec de check).

- [ ] **Step 3: Implémenter**

Dans `index.html`, après le `};` de l'objet `Engine` (ligne ~1215), ajouter :

```js
    // Parses a population CSV (header line 1, cols A=Orga B=Position C=Country
    // D=ID E-F ignored G=Base Salary H=Amount) — same mapping as Code.gs.
    function parsePopulationCsv(text) {
      const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '');
      const reps = [];
      let ignored = 0;
      for (let i = 1; i < lines.length; i++) { // skip header
        const cells = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'));
        const cell = n => cells.length > n ? cells[n] : '';
        const fixed = Number(cell(6)) || 0;
        const nominal = Number(cell(7)) || 0;
        if (!(fixed > 0 && nominal >= 0)) { ignored++; continue; }
        reps.push({
          id: cell(3) || 'rep' + i,
          orga: cell(0), position: cell(1), country: cell(2),
          fixed, nominal
        });
      }
      return { reps, ignored };
    }
```

- [ ] **Step 4: Vérifier le passage**

Run: `node tests/run.js`
Expected: PASS — les 8 nouveaux checks passent, total 86 checks, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "parsePopulationCsv : parsing CSV de population (mapping Code.gs)"
```

---

### Task 2: Chargement local (fetch + repli picker + FileReader)

**Files:**
- Modify: `index.html:2059-2079` (`loadPopulationFromSheet` + nouveaux helpers juste avant)
- Modify: `index.html:996-1001` (`pop-input-zone` : ajout de l'input caché)
- Modify: `index.html:2510-2511` (`setupEventListeners` : écouteur `change` de l'input)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `parsePopulationCsv` (Task 1), `refreshPopulation` (existant).
- Produces: `applyPopulationCsv(res, sourceName)`, `showCsvPicker()`, `loadPopulationCsvFile(file)` (portée script, testables directement) ; élément DOM `pop-csv-input`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/03-population.test.js`, juste après les tests `parsePopulationCsv` ajoutés en Task 1 :

```js
  // ===== Local CSV: applyPopulationCsv (success path logic) =====
  popAutoLoaded = true;
  applyPopulationCsv(parsePopulationCsv(
    'Orga,Position,Country,ID,,,Base Salary,Amount\n' +
    'FR,AE,France,L1,,,50000,5000\n' +
    'DE,KAM,Germany,L2,,,60000,14000\n'
  ), 'population_test.csv');
  check('local apply: 2 reps in advPopulation', advPopulation.length === 2 && advPopulation[0].id === 'L1');
  check('local apply: status names the csv', els['pop-status'].innerText.indexOf('2 rep(s) loaded from population_test.csv') > -1);
  check('local apply: table refreshed', els['pop-table-body'].innerHTML.indexOf('L1') > -1);
  check('local apply: empty csv → message', (applyPopulationCsv(parsePopulationCsv('H,H,H,H,,,H,H\nFR,AE,X,C,,,0,0\n'), 'f.csv'), els['pop-status'].innerText.indexOf('No valid rows found in f.csv') > -1));

  // ===== Local CSV: fetch blocked → file picker fallback =====
  const savedGoogle = globalThis.google;
  globalThis.google = undefined; // force the local branch
  const savedFetch = globalThis.fetch;
  els['pop-csv-input'].clicked = false;
  els['pop-csv-input'].click = function () { els['pop-csv-input'].clicked = true; };
  globalThis.fetch = () => ({ then() { return this; }, catch(fn) { fn(new Error('blocked by CORS')); return this; } });
  loadPopulationFromSheet();
  check('fetch blocked: info status shown', els['pop-status'].innerText.indexOf('blocked by the browser') > -1);
  check('fetch blocked: picker opened', els['pop-csv-input'].clicked === true);
  globalThis.fetch = savedFetch;
  globalThis.google = savedGoogle;
  mock.sheetReps = [{ id: 'A1', fixed: 50000, nominal: 5000 }]; mock.sheetError = null;
  loadPopulationFromSheet(); // back on the mocked Sheet path (google restored)
  check('google restored: Sheet path still works', advPopulation.length === 1 && advPopulation[0].id === 'A1');

  // ===== Local CSV: FileReader path (chosen file) =====
  globalThis.FileReader = function () {};
  globalThis.FileReader.prototype.readAsText = function (file) { globalThis.__lastFR = this; };
  loadPopulationCsvFile({ name: 'my_pop.csv' });
  globalThis.__lastFR.result = 'Orga,Position,Country,ID,,,Base Salary,Amount\nFR,AE,France,F1,,,45000,7000\n';
  globalThis.__lastFR.onload();
  check('FileReader: rep loaded from chosen file', advPopulation.length === 1 && advPopulation[0].id === 'F1' && advPopulation[0].fixed === 45000);
  check('FileReader: status names the chosen file', els['pop-status'].innerText.indexOf('1 rep(s) loaded from my_pop.csv') > -1);
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node tests/run.js`
Expected: FAIL — `applyPopulationCsv`, `loadPopulationCsvFile` inconnues (`ReferenceError`), `fetch blocked: picker opened` échoue (branche locale inexistante).

- [ ] **Step 3: Implémenter la branche locale et les helpers**

Dans `index.html`, remplacer le bloc `// ===== REAL POPULATION (Google Sheet via Apps Script) =====` → fonction `loadPopulationFromSheet` (lignes ~2055-2079) par :

```js
    // ===== REAL POPULATION (Google Sheet via Apps Script, or local CSV) =====
    let advPopulation = []; // { id, orga, position, country, fixed, nominal }
    let popAutoLoaded = false;

    function applyPopulationCsv(res, sourceName) {
      advPopulation = res.reps;
      const st = document.getElementById('pop-status');
      st.innerText = advPopulation.length
        ? advPopulation.length + ' rep(s) loaded from ' + sourceName
        : 'No valid rows found in ' + sourceName;
      refreshPopulation();
    }

    function showCsvPicker() {
      const st = document.getElementById('pop-status');
      st.innerText = 'Automatic CSV loading blocked by the browser — choose the CSV file…';
      const input = document.getElementById('pop-csv-input');
      if (input.click) input.click();
    }

    function loadPopulationCsvFile(file) {
      const st = document.getElementById('pop-status');
      st.classList.remove('hidden');
      st.innerText = 'Loading ' + file.name + '…';
      const reader = new FileReader();
      reader.onload = () => applyPopulationCsv(parsePopulationCsv(reader.result), file.name);
      reader.onerror = () => { st.innerText = 'Reading error: ' + file.name; };
      reader.readAsText(file);
    }

    function loadPopulationFromSheet() {
      const st = document.getElementById('pop-status');
      st.classList.remove('hidden');
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        st.innerText = 'Loading from the Sheet…';
        google.script.run
          .withSuccessHandler(reps => {
            advPopulation = Array.isArray(reps) ? reps : [];
            st.innerText = advPopulation.length
              ? advPopulation.length + ' rep(s) loaded from the Sheet'
              : 'No valid rows found in the Sheet (check header row 4 and columns ID / Base Salary / Amount)';
            refreshPopulation();
          })
          .withFailureHandler(err => {
            st.innerText = 'Loading error: ' + (err && err.message ? err.message : err);
          })
          .getPopulation();
        return;
      }
      // Local mode: fetch the CSV sitting next to index.html, fall back to a picker
      st.innerText = 'Loading population_test.csv…';
      fetch('population_test.csv')
        .then(async r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          applyPopulationCsv(parsePopulationCsv(await r.text()), 'population_test.csv');
        })
        .catch(showCsvPicker);
    }
```

- [ ] **Step 4: Ajouter l'input fichier caché**

Dans `index.html`, dans `#pop-input-zone` (après le `</button>` ligne 999) :

```html
            <input type="file" id="pop-csv-input" accept=".csv,text/csv" class="hidden" />
```

Et mettre à jour la ligne d'aide (ligne 1000) en :

```html
            <p class="text-[10px] text-slate-400">Apps Script deployment: reads the connected Sheet (header row 4, columns ID, Base Salary, Amount). Local file: loads population_test.csv automatically, or lets you pick a CSV. Data stays in your browser.</p>
```

- [ ] **Step 5: Câbler l'input dans `setupEventListeners`**

Dans `index.html`, après la ligne `document.getElementById('pop-sheet-btn').addEventListener('click', loadPopulationFromSheet);` (ligne ~2511) :

```js
      const popCsvInput = document.getElementById('pop-csv-input');
      popCsvInput.addEventListener('change', () => {
        const file = popCsvInput.files && popCsvInput.files[0];
        if (file) loadPopulationCsvFile(file);
        popCsvInput.value = '';
      });
```

- [ ] **Step 6: Vérifier le passage**

Run: `node tests/run.js`
Expected: PASS — tous les checks passent (4 suites), 0 fail.

- [ ] **Step 7: Vérification manuelle navigateur**

Ouvrir `index.html` en double-cliquant (file://) → onglet Advanced → le chargement auto du Sheet déclenche la branche locale → Chrome bloque le fetch → le sélecteur s'ouvre → choisir `population_test.csv` → statut « 100 rep(s) loaded from population_test.csv », tableau et matrice peuplés. Puis servir en HTTP pour vérifier le fetch auto :

```bash
python3 -m http.server 8000
# http://localhost:8000 → Advanced → clic « Load from Google Sheet » → « 100 rep(s) loaded from population_test.csv » sans picker
```

- [ ] **Step 8: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "Chargement local du CSV de population : fetch automatique + repli sélecteur de fichier"
```

---

### Task 3: README + vérification finale

**Files:**
- Modify: `README.md:45-59` (section « Real population »)

**Interfaces:**
- Consumes: comportement implémenté en Task 2.
- Produces: documentation à jour.

- [ ] **Step 1: Mettre à jour le README**

Dans la section `## Real population (Google Sheet)`, après le premier paragraphe (« In the advanced view … replaces the single average »), ajouter :

```markdown
**Local mode:** when `index.html` is opened outside Apps Script, the button tries to fetch
`population_test.csv` from the same folder (place your CSV there, header on line 1, columns
A=Orga, B=Position, C=Country, D=ID, G=Base Salary, H=Amount). If the browser blocks the fetch
(`file://` in Chrome/Edge), a file picker opens instead — pick any CSV with the same columns.
```

Et remplacer le dernier paragraphe de la section (« When opened outside Apps Script … » se trouve dans « Google Apps Script Deployment ») par :

```markdown
When opened outside Apps Script (local file), the loading button falls back to the local CSV
(`population_test.csv` or a picked file) — the rest of the tool works normally.
```

- [ ] **Step 2: Lancer la suite complète**

Run: `node tests/run.js`
Expected: PASS — 0 fail (le compteur total augmente avec les nouveaux checks).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README : mode local du chargement de population (CSV auto + picker)"
```

---

## Self-review

- **Spec coverage:** comportement du bouton (3 branches) → Task 2 ; `parsePopulationCsv` (mapping, filtre, fallback id, \r\n, quotes) → Task 1 ; input caché + statuts + annulation (message info permanent) → Task 2 ; tests → Tasks 1-2 ; README → Task 3. ✓
- **Placeholders:** aucun — code complet dans chaque step. ✓
- **Type consistency:** `parsePopulationCsv(text) → {reps, ignored}` ; `applyPopulationCsv(res, sourceName)` consomme ce retour ; `loadPopulationCsvFile(file)` attend `{name}` (File object compatible). ✓
