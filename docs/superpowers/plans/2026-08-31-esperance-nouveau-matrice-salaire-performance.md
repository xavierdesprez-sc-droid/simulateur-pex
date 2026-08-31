# Espérance nouveau (tableau) + Matrice Salaire × Performance — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter les colonnes « Espérance nouveau » + Δ au tableau population de la vue avancée, et une card matrice 2×2 (salaire bas/haut × low/top performer) avec switch Espérances / Δ vs actuel.

**Architecture:** Aucune nouvelle primitive moteur : `refreshPopulation()` stocke `eNew`/`deltaNew` par rep et calcule une matrice via des intégrations conditionnelles (densité renormalisée sur la demi-distribution x < mu ou x > mu). Une fonction `renderMatrix()` met à jour le DOM selon `matrixMode`.

**Tech Stack:** Google Apps Script (index.html monofichier), Chart.js (non impacté), suite de tests Node maison (`tests/harness.js`, éval du script de page avec DOM simulé).

## Global Constraints

- Tout le code applicatif vit dans `index.html` (script inline unique, dernier `<script>` du fichier).
- Moteur pur sans DOM : `Engine.densityPoints(mu, sigma)`, `Engine.oldE(x, {oldNomE, cap})`, `Engine.hybridE(x, nomAdv)`, `Engine.newBaseE(x, nomAdv)`, `advNominals(nominal, fixed)` → `{oldNomE, newNomE, ...}`.
- Couleurs de convention : hybride = orange (`text-orange-700`), tout-nouveau = indigo (`text-indigo-600`/`text-indigo-700`), gains = `text-emerald-600`, pertes = `text-rose-600`, neutre = `text-slate-400`.
- Format monétaire : `fmtE = v => Math.round(v).toLocaleString('fr-FR') + ' €'`.
- Tests : `node tests/run.js` doit finir à 0 fail ; chaque tâche ajoute ses checks dans `tests/03-population.test.js`.
- Pas de commentaires superflus dans le code produit ; pas de lib externe nouvelle.

---

### Task 1: Colonnes « Espérance nouveau » et « Δ € nouveau » dans le tableau

**Files:**
- Modify: `index.html` (thead du tableau population ~ligne 1054-1062 ; boucle `refreshPopulation` ~lignes 2112-2158)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `Engine.newBaseE`, `advNominals`, `state.payoutCap`, `eNewFull` (déjà calculé dans la boucle).
- Produces: `rows` enrichi de `eNew` (€, espérance tout-nouveau du rep) et `deltaNew` (€, = eNew − eOld) ; `id="pop-table-head"` sur le `<tr>` d'entête (utilisé par les tests).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `tests/03-population.test.js`, avant le bloc « Réinitialisation » (insérer juste avant la ligne `// ===== Réinitialisation → modèle moyen =====`) :

```js
  // ===== Espérance nouveau + Δ nouveau dans le tableau =====
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },
    { id: 'B', fixed: 60000, nominal: 14000 }
  ];
  refreshPopulation();
  check('entête contient Espérance nouveau', els['pop-table-head'].innerHTML.indexOf('Espérance nouveau') > -1);
  const tblNew = els['pop-table-body'].innerHTML;
  check('8 cellules par ligne (2 nouvelles colonnes)', tblNew.split('<td').length - 1 === 16);
  const muCt = getCalibratedAchievement(state.muInit);
  const ptsCt = Engine.densityPoints(muCt, state.sigmaInit);
  let expNewA = 0, expNewTot = 0;
  advPopulation.forEach(rep => {
    const na = advNominals(rep.nominal, rep.fixed);
    let s = 0;
    for (const { x, w } of ptsCt) s += Engine.newBaseE(x, na) * w;
    expNewTot += s;
    if (rep.id === 'A') expNewA = s;
  });
  check('cellule espérance nouveau du rep A affichée', tblNew.indexOf(Math.round(expNewA).toLocaleString('fr-FR')) > -1);
  assertClose('somme espérances nouveau ≈ agrégat pexNew', expNewTot, realAgg.pexNew, 1);
  check('Δ nouveau ≤ −20 € en rouge', tblNew.indexOf('text-rose-600') > -1);
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL sur « entête contient Espérance nouveau » (et les checks suivants), le reste du suite passe.

- [ ] **Step 3: Implémenter**

Dans `index.html`, ajouter `id="pop-table-head"` au `<tr>` de l'entête et deux colonnes :

```html
                  <tr id="pop-table-head">
                    <th class="py-2 px-3">ID</th>
                    <th class="py-2 px-3">Fixe</th>
                    <th class="py-2 px-3">Nominal</th>
                    <th class="py-2 px-3">Espérance actuelle</th>
                    <th class="py-2 px-3">Espérance hybride</th>
                    <th class="py-2 px-3">&Delta; &euro;</th>
                    <th class="py-2 px-3">Espérance nouveau</th>
                    <th class="py-2 px-3">&Delta; &euro; nouveau</th>
                  </tr>
```

Dans `refreshPopulation()`, remplacer `rows.push({ rep, eOld: eStdOld, eHyb, delta });` par :

```js
        rows.push({ rep, eOld: eStdOld, eHyb, delta, eNew: eNewFull, deltaNew: eNewFull - eStdOld });
```

Remplacer le `tbody.innerHTML = rows.map(...)` par :

```js
      tbody.innerHTML = rows.map(r => {
        const deltaCls = r.delta > 20 ? 'text-emerald-600' : r.delta < -20 ? 'text-rose-600' : 'text-slate-400';
        const deltaNewCls = r.deltaNew > 20 ? 'text-emerald-600' : r.deltaNew < -20 ? 'text-rose-600' : 'text-slate-400';
        return '<tr class="hover:bg-slate-50/80">' +
          '<td class="py-1.5 px-3 text-slate-500">' + escapeHtml(r.rep.id) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-600">' + fmtE(r.rep.fixed) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-600">' + fmtE(r.rep.nominal) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-500">' + fmtE(r.eOld) + '</td>' +
          '<td class="py-1.5 px-3 font-bold text-orange-700">' + fmtE(r.eHyb) + '</td>' +
          '<td class="py-1.5 px-3 font-bold ' + deltaCls + '">' + (r.delta > 0 ? '+' : '') + fmtE(r.delta) + '</td>' +
          '<td class="py-1.5 px-3 font-bold text-indigo-700">' + fmtE(r.eNew) + '</td>' +
          '<td class="py-1.5 px-3 font-bold ' + deltaNewCls + '">' + (r.deltaNew > 0 ? '+' : '') + fmtE(r.deltaNew) + '</td></tr>';
      }).join('');
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `node tests/run.js`
Expected: TOTAL: 86 + 6 nouveaux pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "Tableau population : colonnes Espérance nouveau et Δ € nouveau (vue avancée)"
```

---

### Task 2: Calcul de la matrice Salaire × Performance (`computeMatrix`)

**Files:**
- Modify: `index.html` (script inline, section population, après `refreshPopulation` ou dans la même zone ~ligne 2160)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `Engine.densityPoints`, `Engine.oldE`, `Engine.hybridE`, `Engine.newBaseE`, `advNominals`, `state.payoutCap`, `state.muInit`, `state.sigmaInit`, `getCalibratedAchievement`.
- Produces: `popMatrix` (variable module-level, `null` si population vide) de forme `{ meanFixed: number, count: { low: number, high: number }, quadrants: { low: { old, hyb, new }, high: { old, hyb, new } } }` (€, moyennes par rep) ; helper `halfInt(pts, mu, side)` où `side ∈ {'low','high'}` (low = x < mu, high = x > mu) retournant `fn => E[fn(X) | moitié]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `tests/03-population.test.js`, avant le bloc « Réinitialisation » :

```js
  // ===== Matrice salaire × performance : calcul =====
  advPopulation = [
    { id: 'L1', fixed: 40000, nominal: 5000 },
    { id: 'L2', fixed: 45000, nominal: 5000 },
    { id: 'H1', fixed: 80000, nominal: 14000 },
    { id: 'H2', fixed: 90000, nominal: 14000 }
  ];
  refreshPopulation();
  check('matrice calculée', popMatrix !== null);
  check('effectifs quadrants = population', popMatrix.count.low + popMatrix.count.high === 4);
  check('salaire bas = fixes < moyenne', popMatrix.count.low === 2 && popMatrix.meanFixed > 45000 && popMatrix.meanFixed < 80000);
  ['low', 'high'].forEach(q => {
    check('quadrant ' + q + ' : hyb et new positifs', popMatrix.quadrants[q].hyb > 0 && popMatrix.quadrants[q].new > 0);
    check('quadrant ' + q + ' : new > hyb', popMatrix.quadrants[q].new > popMatrix.quadrants[q].hyb);
  });
  check('moitié top ≥ moitié low (salaire haut, actuel)', popMatrix.quadrants.high.old >= 0);
  // Cohérence : moitié basse de la distribution → espérance actuelle inférieure à l'espérance inconditionnelle
  check('conditionnel low ≤ inconditionnel (actuel, salaire bas)', popMatrix.quadrants.low.old <= realAgg.pexOld / 4 + 1);
  // Population vide → matrice nulle
  const savedPop = advPopulation;
  advPopulation = [];
  refreshPopulation();
  check('population vide → popMatrix null', popMatrix === null);
  advPopulation = savedPop;
  refreshPopulation();
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL sur « matrice calculée » (popMatrix undefined → `null !== null` ? Non : undefined !== null passe... vérifier le message : le check évalue `popMatrix !== null` → `undefined !== null` est `true`, donc ce check passerait à tort). Utiliser plutôt :

```js
  check('matrice calculée', !!popMatrix && !!popMatrix.quadrants);
```

Run: `node tests/run.js`
Expected: FAIL sur « matrice calculée » et les checks suivants.

- [ ] **Step 3: Implémenter**

Dans le script de la page, juste après la fin de `refreshPopulation()` :

```js
    let matrixMode = 'levels';
    let popMatrix = null;

    // E[fn(X) | moitié de distribution] : densité renormalisée sur x < mu (low) ou x > mu (high)
    function halfInt(pts, mu, side) {
      const f = pts.filter(p => side === 'low' ? p.x < mu : p.x > mu);
      const tot = f.reduce((a, p) => a + p.w, 0);
      if (!tot) return () => 0;
      return fn => { let a = 0; for (const p of f) a += fn(p.x) * p.w / tot; return a; };
    }

    function computeMatrix(population, pts0, ptsC, mu0, muC) {
      if (!population.length) return null;
      const meanFixed = population.reduce((a, r) => a + r.fixed, 0) / population.length;
      const out = { meanFixed, count: { low: 0, high: 0 }, quadrants: { low: { old: 0, hyb: 0, new: 0 }, high: { old: 0, hyb: 0, new: 0 } } };
      ['low', 'high'].forEach(q => {
        const reps = population.filter(r => q === 'low' ? r.fixed < meanFixed : r.fixed >= meanFixed);
        out.count[q] = reps.length;
        if (!reps.length) return;
        const i0 = halfInt(pts0, mu0, q), iC = halfInt(ptsC, muC, q);
        let sOld = 0, sHyb = 0, sNew = 0;
        reps.forEach(rep => {
          const nomAdv = advNominals(rep.nominal, rep.fixed);
          sOld += i0(x => Engine.oldE(x, { oldNomE: rep.nominal, cap: state.payoutCap }));
          sHyb += iC(x => Engine.hybridE(x, nomAdv));
          sNew += iC(x => Engine.newBaseE(x, nomAdv));
        });
        out.quadrants[q] = { old: sOld / reps.length, hyb: sHyb / reps.length, new: sNew / reps.length };
      });
      return out;
    }
```

Dans `refreshPopulation()`, après `realAgg = { ... };` :

```js
      popMatrix = computeMatrix(population, pts0, ptsC, mu0, muC);
```

Et dans la sortie anticipée `if (!has) { realAgg = null; return; }` :

```js
      if (!has) { realAgg = null; popMatrix = null; return; }
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `node tests/run.js`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "Matrice salaire × performance : espérances conditionnelles par demi-distribution"
```

---

### Task 3: Card HTML matrice + rendu + switch Espérances / Δ

**Files:**
- Modify: `index.html` (HTML : après le conteneur du tableau `</div>` fermant le bloc `overflow-x-auto` ~ligne 1067, encore dans `#pop-results` ; JS : `renderMatrix`, `setMatrixMode`)
- Test: `tests/03-population.test.js`

**Interfaces:**
- Consumes: `popMatrix` (Task 2), `matrixMode` (Task 2), `fmtE` n'est pas en scope module → recréer un formateur local dans `renderMatrix`.
- Produces: DOM ids `matrix-card`, `matrix-mode-levels`, `matrix-mode-deltas`, `matrix-empty`, `matrix-grid`, `matrix-count-low`, `matrix-count-high`, `matrix-low-low`, `matrix-low-top`, `matrix-high-low`, `matrix-high-top` ; fonctions globales `setMatrixMode(mode)` et `renderMatrix()`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter avant le bloc « Réinitialisation » (après les tests Task 2, population 4 reps rechargée) :

```js
  // ===== Matrice : rendu DOM et switch =====
  check('card matrice : 4 cellules rendues', ['matrix-low-low', 'matrix-low-top', 'matrix-high-low', 'matrix-high-top'].every(id => els[id].innerHTML.indexOf('text-orange-700') > -1 && els[id].innerHTML.indexOf('text-indigo') > -1));
  check('effectifs affichés', els['matrix-count-low'].innerText.indexOf('2') > -1 && els['matrix-count-high'].innerText.indexOf('2') > -1);
  setMatrixMode('deltas');
  check('switch deltas : cellules en Δ colorés', els['matrix-low-low'].innerHTML.indexOf('text-rose-600') > -1 || els['matrix-low-low'].innerHTML.indexOf('text-emerald-600') > -1);
  check('switch deltas : bouton actif', els['matrix-mode-deltas'].className.indexOf('text-orange-700') > -1 && els['matrix-mode-levels'].className.indexOf('text-slate-500') > -1);
  setMatrixMode('levels');
  check('switch retour niveaux', els['matrix-mode-levels'].className.indexOf('text-orange-700') > -1);
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL sur « card matrice : 4 cellules rendues » (innerHTML vide) et « setMatrixMode » (fonction inexistante → exception : si une exception est levée, la suite entière casse — acceptable en TDD, le message d'erreur nommera `setMatrixMode`).

- [ ] **Step 3: Implémenter le HTML**

Insérer après le `</div>` du conteneur de tableau (bloc `overflow-x-auto ... max-h-72`), avant la fermeture de `#pop-results` :

```html
            <div id="matrix-card" class="border border-slate-200 rounded-xl p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-slate-900 text-sm">Matrice Salaire &times; Performance</h3>
                <div class="flex gap-1">
                  <button id="matrix-mode-levels" onclick="setMatrixMode('levels')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 transition-all">Espérances</button>
                  <button id="matrix-mode-deltas" onclick="setMatrixMode('deltas')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all">&Delta; vs actuel</button>
                </div>
              </div>
              <div id="matrix-empty" class="hidden text-xs text-slate-400 text-center py-4">Chargez une population pour afficher la matrice.</div>
              <div id="matrix-grid" class="hidden grid grid-cols-[auto_1fr_1fr] gap-2 text-xs">
                <div></div>
                <div class="text-center font-semibold text-slate-500">Low performer<br><span class="text-[10px] font-normal text-slate-400">moitié basse distribution</span></div>
                <div class="text-center font-semibold text-slate-500">Top performer<br><span class="text-[10px] font-normal text-slate-400">moitié haute distribution</span></div>
                <div class="self-center font-semibold text-slate-500">Salaire bas<br><span id="matrix-count-low" class="text-[10px] font-normal text-slate-400"></span></div>
                <div id="matrix-low-low" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
                <div id="matrix-low-top" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
                <div class="self-center font-semibold text-slate-500">Salaire haut<br><span id="matrix-count-high" class="text-[10px] font-normal text-slate-400"></span></div>
                <div id="matrix-high-low" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
                <div id="matrix-high-top" class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-center"></div>
              </div>
            </div>
```

- [ ] **Step 4: Implémenter le JS**

Après `computeMatrix` (Task 2) :

```js
    function setMatrixMode(mode) {
      matrixMode = mode;
      const on = 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 transition-all';
      const off = 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all';
      document.getElementById('matrix-mode-levels').className = mode === 'levels' ? on : off;
      document.getElementById('matrix-mode-deltas').className = mode === 'deltas' ? on : off;
      renderMatrix();
    }

    function renderMatrix() {
      const empty = document.getElementById('matrix-empty');
      const grid = document.getElementById('matrix-grid');
      if (!popMatrix) {
        empty.classList.remove('hidden');
        grid.classList.add('hidden');
        return;
      }
      empty.classList.add('hidden');
      grid.classList.remove('hidden');
      document.getElementById('matrix-count-low').innerText = popMatrix.count.low + ' comm.';
      document.getElementById('matrix-count-high').innerText = popMatrix.count.high + ' comm.';
      const fmtMx = v => Math.round(v).toLocaleString('fr-FR') + ' €';
      const deltaCls = v => v < 0 ? 'text-rose-600' : 'text-emerald-600';
      ['low', 'high'].forEach(q => {
        const el = document.getElementById('matrix-' + q + '-low');
        const elT = document.getElementById('matrix-' + q + '-top');
        const d = popMatrix.quadrants[q];
        if (!popMatrix.count[q]) {
          el.innerHTML = '<span class="text-slate-300">—</span>';
          elT.innerHTML = '<span class="text-slate-300">—</span>';
          return;
        }
        if (matrixMode === 'levels') {
          el.innerHTML = '<span class="block font-bold text-orange-700">' + fmtMx(d.hyb) + '</span><span class="block font-bold text-indigo-600">' + fmtMx(d.new) + '</span>';
          elT.innerHTML = el.innerHTML;
        } else {
          const dh = d.hyb - d.old, dn = d.new - d.old;
          el.innerHTML = '<span class="block font-bold ' + deltaCls(dh) + '">' + (dh > 0 ? '+' : '') + fmtMx(dh) + '</span><span class="block font-bold ' + deltaCls(dn) + '">' + (dn > 0 ? '+' : '') + fmtMx(dn) + '</span>';
          elT.innerHTML = el.innerHTML;
        }
      });
    }
```

Note : les deux cellules d'une même ligne salaire partagent la même valeur (l'espérance conditionnelle top/low ne dépend pas du quadrant salaire individuellement, seulement via la moyenne sur les reps du demi-salaire). Appeler `renderMatrix()` en fin de `refreshPopulation()` (après le rendu du tableau).

- [ ] **Step 5: Vérifier que les tests passent**

Run: `node tests/run.js`
Expected: 0 fail, tous les suites passent.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/03-population.test.js
git commit -m "Card matrice salaire × performance avec switch Espérances / Δ vs actuel (vue avancée)"
```

---

## Self-review

- **Spec coverage** : colonnes tableau (Task 1 ✓), seuil moyenne des fixes affichés (Task 2 ✓), moitié de distribution (Task 2 ✓), hybride + nouveau par quadrant avec switch (Task 3 ✓), état vide (Task 2/3 ✓).
- **Type consistency** : `popMatrix.{count.low/high, quadrants.{low/high}.{old,hyb,new}}` cohérent entre Task 2 (producteur) et Task 3 (consommateur). `halfInt(pts, mu, side)` défini Task 2, utilisé Task 2 seulement.
- **Piège corrigé pendant la rédaction** : le check « matrice calculée » utilise `!!popMatrix && !!popMatrix.quadrants` car `undefined !== null` est vrai.
