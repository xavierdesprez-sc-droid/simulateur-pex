# Fourchettes IC 95% sur les impacts globaux — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher une fourchette IC 95% sur le total masse salariale de l'équipe dans les cards d'impact global (4 cards Vue Standard + agrégat et population réelle Vue Avancée), avec corrélation inter-commerciaux ρ paramétrable.

**Architecture:** Moteur pur `Engine.totalQuantiles` (décomposition facteur commun Z + aléa individuel ε, quantiles par CDF sur grille gaussienne discrétisée — aucun tirage aléatoire, 100% déterministe). Branches d'affichage : modèle moyen (N = `state.headcount`, PEX actuel constant) vs population réelle (nominaux par rép, même tirage de perf brute pour ancien/nouveau). Spans HTML ajoutés sous chaque valeur concernée.

**Tech Stack:** Vanilla JS single-file (`index.html`), harnais de tests Node maison (`tests/`), runner `node tests/run.js`.

**Spec:** `docs/superpowers/specs/2026-08-31-fourchettes-95-impacts-globaux-design.md`

## Global Constraints

- Tout le code applicatif vit dans `index.html` (HTML + JS inline) — pas de nouveaux fichiers applicatifs.
- Le moteur de calcul (`Engine`, lignes ~1146-1206) est pur : aucune référence DOM.
- Conventions du codebase : commentaires en français, style existant respecté, `Engine.densityPoints` / `Engine.integrate` comme primitives d'intégration.
- Tests : suites dans `tests/*.test.js`, exécutées via `node tests/run.js` (exit 1 si échec). Chaque suite reçoit une page fraîche et accède directement aux symboles du script (`state`, `Engine`, `refreshPopulation`, ...).
- État actuel des tests : **78 pass / 0 fail**. Chaque tâche doit finir avec 0 fail.
- Fourchette affichée au format : `IC 95% : [x – y] M€` (2 décimales, tiret demi-cadratin ` – `).
- ρ ∈ [0, 1], défaut `0.3`, bornes clampées.
- `Engine.densityPoints` tronque à x ≥ 0 (`Math.max(0, mu - 4.5*sigma)`) : la grille z de `totalQuantiles` est donc construite inline (non tronquée), PAS via `densityPoints(0, 1)`.

---

### Task 1: Moteur — `Engine.totalQuantiles` + suite de tests 05

**Files:**
- Modify: `index.html` (méthode ajoutée dans l'objet `Engine`, juste après la méthode `paliers` qui se termine ligne 1205, avant la fermeture `};` ligne 1206)
- Create: `tests/05-ci.test.js`

**Interfaces:**
- Produces: `Engine.totalQuantiles(fn, mus, sigmas, rho, alpha = 0.05)` → `{ lo, hi }` en €.
  - `fn(x, i)` : valeur € du rép `i` au taux d'atteinte `x` (courbes croissantes attendues).
  - `mus`, `sigmas` : tableaux par rép (même longueur).
  - `rho` : corrélation inter-commerciaux [0,1] ; `alpha` : 0.05 par défaut.
- Produces: suite de tests `tests/05-ci.test.js` (auto-découverte par `tests/run.js` via `readdirSync`) — les tâches suivants y ajoutent leurs tests UI.

- [ ] **Step 1: Écrire les tests (échouent d'abord)**

Créer `tests/05-ci.test.js` :

```js
'use strict';
/** Engine.totalQuantiles : fourchettes IC 95% (facteur commun + aléa individuel). */
module.exports = function suite(__h) {
  const { check, assertClose } = __h;
  state.targetIncrease = 0; state.overperf = 0;
  const fPal = x => Engine.paliers(Math.max(0, x), state.breakpoints, state.payoutCap);

  // ===== Validation gaussienne : ρ=1, f=identité, N=1 → quantiles de N(0,1) =====
  {
    const q = Engine.totalQuantiles(x => x, [0], [1], 1);
    assertClose('Q975(Z) ≈ +1.96', q.hi, 1.96, 0.15);
    assertClose('Q025(Z) ≈ -1.96', q.lo, -1.96, 0.15);
  }

  // ===== ρ=0 : CLT pur, centré sur la moyenne, demi-largeur 1.96σ =====
  {
    const q = Engine.totalQuantiles(x => x, [110], [30], 0);
    assertClose('ρ=0 identité : centre = µ', (q.lo + q.hi) / 2, 110, 0.5);
    assertClose('ρ=0 identité : demi-largeur = 1.96×σ', (q.hi - q.lo) / 2, 1.959964 * 30, 0.5);
  }

  // ===== ρ=1 : fourchette individuelle (σ_idio = 0) =====
  {
    const f = x => Math.min(Math.max(x, 0), 200);
    const mu = 110, sigma = 30;
    const q = Engine.totalQuantiles(f, [mu], [sigma], 1);
    assertClose('ρ=1 : Q975 ≈ f(µ+1.96σ)', q.hi, f(mu + 1.959964 * sigma), 3);
    assertClose('ρ=1 : Q025 ≈ f(µ−1.96σ)', q.lo, f(mu - 1.959964 * sigma), 3);
  }

  // ===== Monotonie : la largeur du total croît avec ρ (N=10 rép) =====
  {
    const w = rho => { const q = Engine.totalQuantiles(fPal, new Array(10).fill(110), new Array(10).fill(30), rho); return q.hi - q.lo; };
    check('largeur croissante en ρ (0 < 0.5 < 0.95)', w(0) < w(0.5) && w(0.5) < w(0.95));
  }

  // ===== N rép indépendants (ρ=0) : largeur relative plus étroite =====
  {
    const one = Engine.totalQuantiles(fPal, [110], [30], 0);
    const hundred = Engine.totalQuantiles(fPal, new Array(100).fill(110), new Array(100).fill(30), 0);
    check('N=100 indép. : largeur relative réduite',
      (hundred.hi - hundred.lo) / hundred.hi < (one.hi - one.lo) / one.hi);
  }

  // ===== Ordre : lo < hi =====
  {
    const q = Engine.totalQuantiles(fPal, [110], [30], 0.3);
    check('lo < hi', q.lo < q.hi);
  }
};
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL — `Engine.totalQuantiles is not a function` (TypeError dans la suite 05), suites 01-04 passent toujours.

- [ ] **Step 3: Implémenter `Engine.totalQuantiles`**

Dans `index.html`, insérer entre la fin de `paliers` (ligne 1205, `}` de la méthode) et la fermeture de l'objet `Engine` (ligne 1206, `};`) :

```js

      // ===== Fourchettes IC (facteur commun + aléa individuel indépendant) =====
      // Modèle : X_i = µ_i + σ_i·(√ρ·Z + √(1−ρ)·ε_i), Z et ε_i ~ N(0,1)
      // fn(x, i) = valeur € du rep i au taux d'atteinte x (courbes croissantes attendues)
      // Q_α(Total) ≈ Q_α(Σ f_i(µ_i + σ_i·√ρ·Z)) + z_α·√(Σ Var[f_i(µ_i + σ_i·√(1−ρ)·ε)])
      // NB : grille z construite inline (densityPoints tronque à x ≥ 0, inutilisable pour z)
      totalQuantiles(fn, mus, sigmas, rho, alpha = 0.05) {
        const zCI = 1.959964; // z_{1-α/2} pour α = 0.05
        const r = Math.sqrt(Math.max(0, Math.min(1, rho)));
        const s = Math.sqrt(1 - Math.max(0, Math.min(1, rho)));
        const pts = []; let tot = 0;
        for (let z = -4.5; z <= 4.5; z += 0.125) { const d = normalPdf(z, 0, 1) * 0.125; pts.push({ x: z, d }); tot += d; }
        const grid = pts.map(p => ({ x: p.x, w: p.d / tot }));

        // Partie commune : C(z) = Σ f_i(µ_i + σ_i·r·z), CDF par tri des valeurs
        const common = grid.map(p => {
          let c = 0;
          for (let i = 0; i < mus.length; i++) c += fn(mus[i] + sigmas[i] * r * p.x, i);
          return { v: c, w: p.w };
        }).sort((a, b) => a.v - b.v);
        const qCommon = q => {
          let acc = 0;
          for (let k = 0; k < common.length; k++) {
            const next = acc + common[k].w;
            if (next >= q) {
              if (k === 0) return common[k].v;
              const t = (q - acc) / (next - acc); // interpolation entre les 2 points de grille encadrants
              return common[k - 1].v + t * (common[k].v - common[k - 1].v);
            }
            acc = next;
          }
          return common[common.length - 1].v;
        };

        // Partie indépendante : Var[f_i(µ_i + σ_i·s·ε)] cumulée sur les rép
        let varIdio = 0;
        for (let i = 0; i < mus.length; i++) {
          let e1 = 0, e2 = 0;
          for (const p of grid) {
            const v = fn(mus[i] + sigmas[i] * s * p.x, i);
            e1 += v * p.w; e2 += v * v * p.w;
          }
          varIdio += Math.max(0, e2 - e1 * e1);
        }
        const sdIdio = Math.sqrt(varIdio);

        return { lo: qCommon(alpha / 2) - zCI * sdIdio, hi: qCommon(1 - alpha / 2) + zCI * sdIdio };
      }
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `node tests/run.js`
Expected: `TOTAL: 87 pass / 0 fail` (78 existants + 9 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/05-ci.test.js
git commit -m "Moteur : Engine.totalQuantiles (IC 95% facteur commun + aléa individuel, déterministe)"
```

---

### Task 2: État et entrées — `state.rho` + inputs dans les deux vues

**Files:**
- Modify: `index.html` — state (ligne ~1111), sidebar standard (lignes ~342-356), panneau avancé (lignes ~886-893), `syncInputsFromState` (ligne ~2280), `setupEventListeners` (après ligne 2353)

**Interfaces:**
- Produces: `state.rho` (number, défaut 0.3) — consommé par toutes les tâches suivantes.
- Produces: inputs `#input-rho` (Vue Standard) et `#adv-input-rho` (Vue Avancée), synchronisés entre eux, mettant à jour `state.rho` avec clamp [0, 1].

- [ ] **Step 1: Ajouter `rho` au state**

Dans l'objet `state`, après la ligne `headcount: 350,        // reps` (ligne 1111) :

```js
      rho: 0.3,              // corrélation inter-commerciaux (0 = indép., 1 = aléa commun)
```

- [ ] **Step 2: Input ρ dans la Vue Standard**

Après la fermeture du grid `Effectif & Base C2P` / `Corridor` (ligne 356, `</div>` fermant le grid ouvert ligne 342) et avant `</div>` ligne 358, insérer :

```html

            <!-- Corrélation inter-commerciaux (fourchettes IC 95%) -->
            <div class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">Corrélation Inter-Commerciaux (&rho;)</label>
                <input type="number" id="input-rho" value="0.3" step="0.05" min="0" max="1" class="w-full font-mono font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500">
              </div>
              <div class="flex items-end">
                <p class="text-[10px] text-slate-400 leading-tight">0 = perf. indépendantes, 1 = aléa de marché commun. Pilote la largeur des IC 95%.</p>
              </div>
            </div>
```

- [ ] **Step 3: Input ρ dans la Vue Avancée**

Après le bloc « Nominal nouveau » (lignes 887-892, se termine par `</div>` ligne 892) et avant `</div>` ligne 893 (fin de la card de paramètres), insérer :

```html

          <!-- Corrélation inter-commerciaux (fourchettes IC 95%) -->
          <div class="pt-1">
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">Corrélation Inter-Commerciaux (&rho;)</label>
            <input type="number" id="adv-input-rho" value="0.3" step="0.05" min="0" max="1" class="w-full text-xs font-mono font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500">
            <p class="text-[10px] text-slate-400 mt-1">0 = perf. indépendantes, 1 = aléa de marché commun. Pilote la largeur des IC 95%.</p>
          </div>
```

- [ ] **Step 4: Synchronisation et binding**

Dans `syncInputsFromState`, après la ligne `document.getElementById('input-headcount').value = state.headcount;` (ligne 2280) :

```js
      document.getElementById('input-rho').value = state.rho;
      document.getElementById('adv-input-rho').value = state.rho;
```

Dans `setupEventListeners`, après le dernier appel `bindNumberInput(...)` (ligne 2353) :

```js

      // Corrélation inter-commerciaux : les deux inputs restent synchronisés
      const bindRho = (id, otherId, after) => {
        document.getElementById(id).addEventListener('input', (e) => {
          const raw = parseFloat(e.target.value);
          if (isFinite(raw)) state.rho = Math.min(1, Math.max(0, raw));
          document.getElementById(otherId).value = state.rho;
          after();
        });
      };
      bindRho('input-rho', 'adv-input-rho', updateDashboard);
      bindRho('adv-input-rho', 'input-rho', updateAdvancedView);
```

- [ ] **Step 5: Vérifier la non-régression**

Run: `node tests/run.js`
Expected: `TOTAL: 87 pass / 0 fail` (aucun nouveau test ; le harnais n'exécute pas les listeners, mais la syntaxe de la page doit rester valide).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Paramètre rho (corrélation inter-commerciaux) : state + inputs synchronisés dans les deux vues"
```

---

### Task 3: Vue Standard — formatCI, spans HTML, branchement `updateDashboard` (modèle moyen)

**Files:**
- Modify: `index.html` — helper `formatCI` (après `calculateExpectedPayout`, ligne ~1246), cards HTML (lignes ~139-198), `updateDashboard` (après ligne 1284 et après ligne 1314)
- Modify: `tests/05-ci.test.js` (ajout de tests UI)

**Interfaces:**
- Consumes: `Engine.totalQuantiles` (Task 1), `state.rho` (Task 2).
- Produces: `formatCI(ci)` → string `IC 95% : [x – y] M€` (ci en €) — réutilisée par Tasks 4 et 5.
- Produces: spans `#kpi-pex-new-ci`, `#kpi-pex-savings-ci`, `#kpi-net-gain-ci` — remplis à chaque `updateDashboard()`. La branche `realAgg && realAgg.ciStdNew` est déjà écrite mais inerte jusqu'à la Task 4.
- Card 3 (Gain C2P) : PAS de span — quantité déterministe (spec).

- [ ] **Step 1: Écrire les tests (échouent d'abord)**

Ajouter à la FIN de la fonction suite dans `tests/05-ci.test.js` (avant la dernière `};` du module) :

```js

  // ===== UI : cards standard (modèle moyen) =====
  const parseBounds = txt => {
    const m = txt.match(/\[(-?[\d.]+) – (-?[\d.]+)\]/);
    return m ? { lo: parseFloat(m[1]), hi: parseFloat(m[2]) } : null;
  };
  const relTol = (v, pct) => Math.abs(v) * pct + 0.005;

  setView('standard');
  state.targetIncrease = 0; state.overperf = 0; state.rho = 0.3;
  advPopulation = []; refreshPopulation();
  updateDashboard();

  check('card 1 : ligne IC 95% remplie', els['kpi-pex-new-ci'].innerText.indexOf('IC 95% : [') === 0);
  check('card 2 : ligne IC 95% remplie', els['kpi-pex-savings-ci'].innerText.indexOf('IC 95% : [') === 0);
  check('card 4 : ligne IC 95% remplie', els['kpi-net-gain-ci'].innerText.indexOf('IC 95% : [') === 0);

  const sav = parseFloat(els['kpi-pex-savings'].innerText.replace('+', ''));
  const bSav = parseBounds(els['kpi-pex-savings-ci'].innerText);
  assertClose('card 2 : centre IC ≈ ΔPEX affiché', (bSav.lo + bSav.hi) / 2, sav, relTol(sav, 0.02));

  const net = parseFloat(els['kpi-net-gain'].innerText.replace('+', ''));
  const bNet = parseBounds(els['kpi-net-gain-ci'].innerText);
  assertClose('card 4 : centre IC ≈ bilan affiché', (bNet.lo + bNet.hi) / 2, net, relTol(net, 0.02));

  // ρ élargit la fourchette (N = 350)
  state.rho = 0; updateDashboard();
  const w0 = parseBounds(els['kpi-pex-new-ci'].innerText);
  state.rho = 1; updateDashboard();
  const w1 = parseBounds(els['kpi-pex-new-ci'].innerText);
  check('card 1 : ρ=1 élargit la fourchette vs ρ=0', (w1.hi - w1.lo) > (w0.hi - w0.lo));
  state.rho = 0.3; updateDashboard();
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL — 6 nouveaux tests en échec (spans vides : `innerText` = `''` ne commence pas par `IC 95% : [` ; `parseBounds` retourne null → TypeError sur `.lo`).

- [ ] **Step 3: Ajouter le helper `formatCI`**

Dans `index.html`, juste après la fin de `calculateExpectedPayout` (ligne 1246, `}`) et avant le commentaire `// Update entire dashboard` (ligne 1248) :

```js

    // Format d'une fourchette IC 95% (valeurs en €)
    function formatCI(ci) {
      return 'IC 95% : [' + (ci.lo / 1e6).toFixed(2) + ' – ' + (ci.hi / 1e6).toFixed(2) + '] M€';
    }
```

- [ ] **Step 4: Ajouter les spans HTML**

Card 1 (PEX Variable Nouveau) — après le `</div>` du badge `kpi-pex-diff-badge` (ligne 152) et avant le `</div>` de fermeture de la card (ligne 153) :

```html
        <div id="kpi-pex-new-ci" class="mt-1 text-[10px] text-slate-400">IC 95% : —</div>
```

Card 2 (Impact Masse Salariale) — après le `<p>` du label (ligne 167) et avant le `</div>` de la card (ligne 168) :

```html
        <div id="kpi-pex-savings-ci" class="mt-1 text-[10px] text-slate-400">IC 95% : —</div>
```

Card 4 (Bilan Net, fond sombre) — après le `<p>` « Gain C2P + Économie PEX » (ligne 197) et avant le `</div>` de la card (ligne 198) :

```html
        <div id="kpi-net-gain-ci" class="mt-1 text-[10px] text-indigo-300">IC 95% : —</div>
```

- [ ] **Step 5: Calcul des IC dans `updateDashboard`**

Après la ligne `const netGainM = marginGainM + pexDiffM;` (ligne 1284) et avant le commentaire `// 2. Update KPI cards` (ligne 1286), insérer :

```js

      // ===== Fourchettes IC 95% (total équipe, facteur commun ρ + aléa individuel) =====
      let ciNewE, ciDiffE; // en €
      if (realAgg && realAgg.ciStdNew) {
        // Population réelle : ancien et nouveau sous le MÊME tirage de perf brute
        // (calibrage = décalage absolu en pp, cf. getCalibratedAchievement)
        ciNewE = realAgg.ciStdNew;
        ciDiffE = realAgg.ciDiff;
      } else {
        // Modèle moyen : PEX actuel = valeur observée (constante) → ΔPEX miroir du CI nouveau
        const musCI = new Array(state.headcount).fill(getCalibratedAchievement(state.muInit));
        const sigsCI = new Array(state.headcount).fill(state.sigmaInit);
        const newNomRepE = (newTargetPEX_M * 1e6) / state.headcount;
        const fnNew = x => Engine.paliers(Math.max(0, x), state.breakpoints, state.payoutCap) / 100 * newNomRepE;
        ciNewE = Engine.totalQuantiles(fnNew, musCI, sigsCI, state.rho);
        ciDiffE = { lo: oldPexM * 1e6 - ciNewE.hi, hi: oldPexM * 1e6 - ciNewE.lo };
      }
```

Après la ligne `netGainEl.className = netGainM >= 0 ? 'text-2xl font-black text-emerald-400' : 'text-2xl font-black text-rose-400';` (ligne 1314), insérer :

```js

      document.getElementById('kpi-pex-new-ci').innerText = formatCI(ciNewE);
      document.getElementById('kpi-pex-savings-ci').innerText = formatCI(ciDiffE);
      document.getElementById('kpi-net-gain-ci').innerText = formatCI({ lo: marginGainM * 1e6 + ciDiffE.lo, hi: marginGainM * 1e6 + ciDiffE.hi });
```

- [ ] **Step 6: Vérifier que les tests passent**

Run: `node tests/run.js`
Expected: `TOTAL: 93 pass / 0 fail` (87 + 6).

- [ ] **Step 7: Commit**

```bash
git add index.html tests/05-ci.test.js
git commit -m "Vue Standard : fourchettes IC 95% sur les cards PEX nouveau, ΔPEX et bilan net"
```

---

### Task 4: Population réelle — IC dans `refreshPopulation` + branchement `updateDashboard` mode réel

**Files:**
- Modify: `index.html` — `refreshPopulation` (calculs avant `realAgg = {...}` ligne 2133 ; écritures DOM après ligne 2146), card Population réelle HTML (lignes ~1036-1048)
- Modify: `tests/05-ci.test.js` (ajout de tests)

**Interfaces:**
- Consumes: `Engine.totalQuantiles`, `formatCI`, `state.rho`, spans Task 3.
- Produces: `realAgg` étendu avec `{ ciStdOld, ciStdNew, ciDiff, ciHyb, ciNewFull }` (en €) — `ciStdNew` et `ciDiff` activent la branche réelle de `updateDashboard` (écrite en Task 3).
- Produces: spans `#pop-pex-old-ci`, `#pop-pex-hyb-ci`, `#pop-pex-new-ci`.

Clé de modélisation (cf. spec) : en population réelle, l'ancien schéma est **modélisé** (espérance sous µ0) et non observé. Le calibrage étant un décalage absolu en pp (`getCalibratedAchievement`), on tire x ~ N(µ0, σ) (perf brute) et on applique le décalage `deltaCal = targetIncrease − overperf` DANS la fonction : ancien = f(x), nouveau = g(x − deltaCal). Ancien et nouveau partagent ainsi le même tirage → la corrélation est gérée naturellement par le Δ.

- [ ] **Step 1: Écrire les tests (échouent d'abord)**

Ajouter à la fin de la suite `tests/05-ci.test.js` (avant la dernière `};`) :

```js

  // ===== UI : population réelle =====
  setView('advanced');
  advPopulation = [
    { id: 'A', fixed: 50000, nominal: 5000 },
    { id: 'B', fixed: 60000, nominal: 14000 }
  ];
  state.targetIncrease = 0; state.overperf = 0; state.rho = 0.3;
  refreshPopulation();

  check('pop : IC old rempli', els['pop-pex-old-ci'].innerText.indexOf('IC 95% : [') === 0);
  check('pop : IC hyb rempli', els['pop-pex-hyb-ci'].innerText.indexOf('IC 95% : [') === 0);
  check('pop : IC new rempli', els['pop-pex-new-ci'].innerText.indexOf('IC 95% : [') === 0);

  const bOld = parseBounds(els['pop-pex-old-ci'].innerText);
  assertClose('pop : centre IC old ≈ pexOld affiché', (bOld.lo + bOld.hi) / 2, realAgg.pexOld / 1e6, relTol(realAgg.pexOld / 1e6, 0.02));
  const bHyb = parseBounds(els['pop-pex-hyb-ci'].innerText);
  assertClose('pop : centre IC hyb ≈ pexHyb affiché', (bHyb.lo + bHyb.hi) / 2, realAgg.pexHyb / 1e6, relTol(realAgg.pexHyb / 1e6, 0.02));

  // ΔPEX joint (même tirage) : centre ≈ stdOld − stdNew, card 2 en mode réel
  updateDashboard();
  const bDiff = parseBounds(els['kpi-pex-savings-ci'].innerText);
  assertClose('pop : centre IC ΔPEX ≈ stdOld − stdNew', (bDiff.lo + bDiff.hi) / 2, (realAgg.stdOld - realAgg.stdNew) / 1e6, relTol((realAgg.stdOld - realAgg.stdNew) / 1e6, 0.02));

  // ρ élargit l'IC hybride
  state.rho = 1; refreshPopulation();
  const bHyb1 = parseBounds(els['pop-pex-hyb-ci'].innerText);
  check('pop : ρ=1 élargit IC hyb', (bHyb1.hi - bHyb1.lo) > (bHyb.hi - bHyb.lo));
  state.rho = 0.3;

  // Retour modèle moyen : plus d'IC réel branché, tout reste cohérent
  advPopulation = [];
  refreshPopulation();
  updateDashboard();
  check('retour modèle moyen : card 2 IC toujours présente', els['kpi-pex-savings-ci'].innerText.indexOf('IC 95% : [') === 0);
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL — spans `pop-*-ci` vides (`IC 95% : —` initial ? Non : ils n'existent pas encore, le harnais les crée vides → `''` ne commence pas par `IC 95% : [`). 8 nouveaux tests en échec.

- [ ] **Step 3: Calculer les IC dans `refreshPopulation`**

Dans `refreshPopulation`, après la fin de la boucle `advPopulation.forEach(...)` (ligne 2131, `});`) et avant la ligne `realAgg = { stdOld, stdNew, ... }` (ligne 2133), insérer :

```js

      // ===== Fourchettes IC 95% : même tirage de perf brute x ~ N(µ0, σ) pour tous =====
      // Le calibrage (hausse objectifs / surperf) est un décalage absolu en pp appliqué DANS la fonction
      const deltaCal = state.targetIncrease - state.overperf;
      const musR = advPopulation.map(() => mu0), sigsR = advPopulation.map(() => sigma);
      const clamp0 = x => Math.max(0, x);
      const oldNomI = i => advPopulation[i].nominal;
      const newNomI = i => Math.max(advPopulation[i].fixed * state.newVarShare / 100, advPopulation[i].nominal);
      const fOldI = (x, i) => Engine.oldE(clamp0(x), { oldNomE: oldNomI(i), cap: state.payoutCap });
      const fNewI = (x, i) => Engine.paliers(clamp0(x - deltaCal), state.breakpoints, state.payoutCap) / 100 * newNomI(i);
      const fHybI = (x, i) => Engine.hybridE(clamp0(x - deltaCal), advNominals(oldNomI(i), advPopulation[i].fixed));
      const fNewFullI = (x, i) => Engine.newBaseE(clamp0(x - deltaCal), advNominals(oldNomI(i), advPopulation[i].fixed));
      const ciStdOld = Engine.totalQuantiles(fOldI, musR, sigsR, state.rho);
      const ciStdNew = Engine.totalQuantiles(fNewI, musR, sigsR, state.rho);
      const ciDiff = Engine.totalQuantiles((x, i) => fOldI(x, i) - fNewI(x, i), musR, sigsR, state.rho);
      const ciHyb = Engine.totalQuantiles(fHybI, musR, sigsR, state.rho);
      const ciNewFull = Engine.totalQuantiles(fNewFullI, musR, sigsR, state.rho);
```

Remplacer la ligne `realAgg = { stdOld, stdNew, targetOld, targetNew, pexOld, pexHyb, pexNew };` (ligne 2133) par :

```js
      realAgg = { stdOld, stdNew, targetOld, targetNew, pexOld, pexHyb, pexNew, ciStdOld, ciStdNew, ciDiff, ciHyb, ciNewFull };
```

Après la ligne `document.getElementById('pop-risk-avg').innerText = losers ? fmtE(lossSum / losers) : '—';` (ligne 2146), insérer :

```js

      document.getElementById('pop-pex-old-ci').innerText = formatCI(ciStdOld);
      document.getElementById('pop-pex-hyb-ci').innerText = formatCI(ciHyb);
      document.getElementById('pop-pex-new-ci').innerText = formatCI(ciNewFull);
```

- [ ] **Step 4: Ajouter les spans HTML de la card Population réelle**

Après `<span id="pop-pex-old" ...>0.00 M€</span>` (ligne 1038) :

```html
                <span id="pop-pex-old-ci" class="text-[10px] text-slate-400 block">IC 95% : —</span>
```

Après `<span id="pop-pex-hyb" ...>0.00 M€</span>` (ligne 1042) — attention, ce bloc contient déjà `#pop-pex-delta` juste après ; insérer le CI APRÈS le span `pop-pex-delta` (ligne 1043) :

```html
                <span id="pop-pex-hyb-ci" class="text-[10px] text-slate-400 block">IC 95% : —</span>
```

Après `<span id="pop-pex-new" ...>0.00 M€</span>` (ligne 1047) :

```html
                <span id="pop-pex-new-ci" class="text-[10px] text-slate-400 block">IC 95% : —</span>
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `node tests/run.js`
Expected: `TOTAL: 101 pass / 0 fail` (93 + 8).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/05-ci.test.js
git commit -m "Population réelle : IC 95% sur PEX actuel/hybride/tout-nouveau, même tirage de perf pour ancien et nouveau"
```

---

### Task 5: Vue Avancée — IC de l'agrégat modèle moyen + README

**Files:**
- Modify: `index.html` — `updateAdvancedView` (calculs après ligne 2053 ; écritures DOM après ligne 2062), card Impact Masse Agrégé HTML (lignes ~995-1008)
- Modify: `tests/05-ci.test.js` (ajout de tests)
- Modify: `README.md` (section à la fin)

**Interfaces:**
- Consumes: `Engine.totalQuantiles`, `formatCI`, `state.rho`, `ctxAvg`/`rAvg` déjà en scope dans `updateAdvancedView`.
- Produces: spans `#adv-agg-hyb-ci`, `#adv-agg-new-ci`. Pas d'IC sur `adv-agg-old` : en modèle moyen `pexOld = state.currentPEX` est constant (l'IC du PEX actuel réel est sur la card Population réelle, Task 4).

- [ ] **Step 1: Écrire les tests (échouent d'abord)**

Ajouter à la fin de la suite `tests/05-ci.test.js` (avant la dernière `};`) :

```js

  // ===== UI : agrégat Vue Avancée (modèle moyen) =====
  setView('advanced');
  updateAdvancedView();
  check('agg : IC hyb rempli', els['adv-agg-hyb-ci'].innerText.indexOf('IC 95% : [') === 0);
  check('agg : IC new rempli', els['adv-agg-new-ci'].innerText.indexOf('IC 95% : [') === 0);
  const aHyb = parseBounds(els['adv-agg-hyb-ci'].innerText);
  const aggHybVal = parseFloat(els['adv-agg-hyb'].innerText);
  assertClose('agg : centre IC hyb ≈ pexHyb affiché', (aHyb.lo + aHyb.hi) / 2, aggHybVal, relTol(aggHybVal, 0.02));
  const aNew = parseBounds(els['adv-agg-new-ci'].innerText);
  const aggNewVal = parseFloat(els['adv-agg-new'].innerText);
  assertClose('agg : centre IC new ≈ pexNew affiché', (aNew.lo + aNew.hi) / 2, aggNewVal, relTol(aggNewVal, 0.02));
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node tests/run.js`
Expected: FAIL — 4 nouveaux tests en échec (spans `adv-agg-*-ci` vides).

- [ ] **Step 3: Calculer les IC dans `updateAdvancedView`**

Après la ligne `const pexNew = oldTargetPEX_M * calculateExpectedPayout(true) * rAvg / 100;` (ligne 2053) et avant les écritures DOM `document.getElementById('adv-agg-old')...` (ligne 2055), insérer :

```js

      // ===== Fourchettes IC 95% (agrégat modèle moyen, N = headcount) =====
      const musA = new Array(state.headcount).fill(mu), sigsA = new Array(state.headcount).fill(sigma);
      const oldNomRepAgg = oldTargetPEX_M > 0 ? (oldTargetPEX_M * 1e6) / state.headcount : 0;
      // pexHyb = oldTargetPEX_M × E[hybridE/oldNom×100] → version € par rép :
      const ciHybAgg = Engine.totalQuantiles(
        x => Engine.hybridE(Math.max(0, x), ctxAvg) / ctxAvg.oldNomE * oldNomRepAgg,
        musA, sigsA, state.rho);
      // pexNew = oldTargetPEX_M × E[paliers%] × rAvg → version € par rép :
      const ciNewAgg = Engine.totalQuantiles(
        x => Engine.paliers(Math.max(0, x), state.breakpoints, state.payoutCap) / 100 * oldNomRepAgg * rAvg,
        musA, sigsA, state.rho);
```

NB : `mu` et `sigma` sont déjà définis ligne 2048 (`const mu = getCalibratedAchievement(state.muInit), sigma = state.sigmaInit;`) et `ctxAvg`/`rAvg` lignes 2049/2047 — réutiliser ces variables, ne pas les redéfinir.

Après la ligne `aggDeltaNew.innerText = (pexNew - pexOld >= 0 ? '+' : '') + (pexNew - pexOld).toFixed(2) + ' M€';` (ligne 2062), insérer :

```js
      document.getElementById('adv-agg-hyb-ci').innerText = formatCI(ciHybAgg);
      document.getElementById('adv-agg-new-ci').innerText = formatCI(ciNewAgg);
```

- [ ] **Step 4: Ajouter les spans HTML de la card Impact Masse Agrégé**

Après `<span id="adv-agg-hyb" ...>0.00 M€</span>` (ligne 1001) et avant `<span id="adv-agg-delta" ...>` (ligne 1002) :

```html
              <span id="adv-agg-hyb-ci" class="text-[10px] text-slate-400 block">IC 95% : —</span>
```

Après `<span id="adv-agg-new" ...>0.00 M€</span>` (ligne 1006) et avant `<span id="adv-agg-delta-new" ...>` (ligne 1007) :

```html
              <span id="adv-agg-new-ci" class="text-[10px] text-slate-400 block">IC 95% : —</span>
```

- [ ] **Step 5: Mettre à jour le README**

Ajouter à la FIN de `README.md` :

```markdown
## Fourchettes IC 95%

Les cards d'impact global affichent une fourchette à 95% (IC 95%) portant sur le **total masse salariale de l'équipe**. Modèle : facteur commun (aléa de marché partagé, corrélation ρ paramétrable dans les deux vues, défaut 0.3) + aléa individuel indépendant par commercial. Calcul 100% déterministe (`Engine.totalQuantiles`, quantiles par CDF sur grille gaussienne). Le Gain C2P est déterministe dans le modèle : pas de fourchette.
```

- [ ] **Step 6: Vérifier que tous les tests passent**

Run: `node tests/run.js`
Expected: `TOTAL: 105 pass / 0 fail` (101 + 4).

- [ ] **Step 7: Commit**

```bash
git add index.html tests/05-ci.test.js README.md
git commit -m "Vue Avancée : IC 95% sur l'agrégat Impact Masse (hybride / tout-nouveau) + README"
```

---

## Vérification finale (après Task 5)

- `node tests/run.js` → `TOTAL: 105 pass / 0 fail`.
- Ouvrir `index.html` dans un navigateur : les 3 cards standard (hors Gain C2P) affichent `IC 95% : [x – y] M€` ; modifier ρ (0 → 1) élargit visiblement les fourchettes ; Vue Avancée : agrégat et population réelle (Sheet ou CSV) affichent leurs IC.
- Vérifier la cohérence visuelle : `IC 95% : —` ne doit apparaître nulle part après le premier calcul.
