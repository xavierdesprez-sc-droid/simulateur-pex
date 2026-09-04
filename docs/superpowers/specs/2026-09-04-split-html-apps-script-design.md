# Design : Split HTML maintenable avec déploiement Apps Script monofichier

Date : 2026-09-04
Statut : implémenté le 2026-09-04 (commits c8ca6b0..6756f5b, plan `docs/superpowers/plans/2026-09-04-split-html-apps-script.md`)

## Objectif

`index.html` fait ~143 Ko / 2794 lignes (dont ~73 Ko de JS inline dans un seul `<script>` + ~70 Ko de markup) en un seul fichier. Le problème constaté n'est ni un quota ni une perf de chargement, mais la **maintenabilité** : fichier illisible, évolutions risquées, navigation difficile.

Contrainte : déploiement actuel en **copier-coller manuel** vers Apps Script (`Code.gs` + un fichier HTML nommé `index` via `HtmlService.createHtmlOutputFromFile('index')`), avec fonctionnement local `file://` conservé (fallback CSV `population_test.csv` / file picker).

But : pouvoir développer en fichiers séparés tout en continuant à déployer **un seul fichier** dans Apps Script, sans changer le workflow (1 copier-coller), sans casser le mode local ni les tests (`node tests/run.js`, 180 checks).

## Décisions validées

- **Problème à résoudre** : maintenabilité uniquement. Pas d'objectif de réduction de taille (l'output restera ~143 Ko).
- **Déploiement** : copier-coller manuel conservé. Pas de `clasp` imposé.
- **Approche retenue (A)** : `src/` splitté + `build.js` qui régénère `index.html` monofichier. `index.html` reste le seul artefact déployé / ouvert en local / lu par les tests en fallback.
- **Approches rejetées** :
  - B (includes natifs `<?!= include() ?>`) : N copier-coller manuels à chaque déploiement, source d'erreur, casse le mode local `file://` (scriptlets non interprétées).
  - C (alléger sans splitter : purge Tailwind, lazy-load Chart/KaTeX/Lucide, minify) : gain marginal, ne règle pas les 2800 lignes.

## Architecture

### 1. Layout `src/` proposé (à ajuster à l'implémentation)

```text
src/
  head.html            # doctype, <head>, CDN (tailwind/chart/lucide/katex/fonts), tailwind.config, <style>
  body-header.html     # header + tabs Standard/Advanced/Matrix + presets
  body-standard.html   # <main id="view-standard"> + cartes KPIs + simulateur individuel + breakpoints
  body-advanced.html   # <main id="view-advanced"> + courbes + population + filtres
  body-matrix.html     # <main id="view-matrix"> + contrôles + matrice
  body-footer.html     # scripts CDN defer, fermeture body/html hors JS métier
  js/
    00-state.js        # state, advState, popFilters, matrixMode, instances charts
    01-engine.js       # Engine pur (densityPoints, integrate, oldE/newBaseE/hybridE, normalPdf, eval*Payout)
    02-standard.js     # getCalibratedAchievement, calculateExpectedPayout, updateDashboard, updateIndividualRep, segments, breakpoints table, initChart
    03-advanced.js     # advNominals, evalOldE/NewBaseE/HybridE, initAdvChart, updateAdvancedView
    04-population.js   # parsePopulationCsv, applyPopulationCsv, loadPopulationCsvFile/Sheet, populatePopFilters, refreshPopulation
    05-matrix.js       # halfInt, tercileCuts, bandInt, renderMatrix
    06-app.js          # setView, applyPreset, sync*, renderMathSafely, init/boot, lucide.createIcons
build.js               # concatène src/*.html + src/js/*.js -> index.html (node seul, zéro dépendance)
index.html             # GÉNÉRÉ, commité (artefact Apps Script + ouverture locale)
Code.gs                # inchangé (toujours createHtmlOutputFromFile('index'))
```

Règles :
- Ordre de concat JS fixe et numérique (`00→06`) pour préserver les dépendances implicites actuelles (globals `state`, `Engine`, fonctions appelées via `onclick` inline).
- Aucun module ES / bundler : concat simple pour rester compatible `file://`, Apps Script `HtmlService`, et harness de test par `eval`.
- Le markup `onclick="setView(...)"` reste tel quel (fonctions globales).
- `<style>` reste dans `head.html` (1,2 Ko, pas besoin de le splitter).

### 2. `build.js`

- Node seul, sans dépendance (comme `tests/`).
- Lit `src/*.html` et `src/js/*.js` en UTF-8, injecte les JS entre `<script>` et `</script>` dans l'ordre, écrit `index.html`.
- Idempotent et déterministe : relancer sans modification ne change pas le fichier (pas de timestamp).
- Usage : `node build.js` avant chaque copier-coller et avant chaque `node tests/run.js` si `src/` a changé.
- Option : `node build.js --check` (utilisé en CI / pre-test) qui échoue si `index.html` n'est pas à jour.

### 3. Tests

- `tests/harness.js` : deux modes, sans changer les suites :
  - si `src/js/` existe : charge et `eval` la concaténation `src/js/*.js` dans l'ordre (source de vérité dev).
  - sinon fallback : extraction du dernier `<script>` de `index.html` (comportement actuel).
  - `htmlSrc` (assertions DOM/classes) continue de lire `index.html` généré.
- `tests/run.js` : vérifie optionnellement la fraîcheur (`node build.js --check`) ou rebuild avant les suites, pour éviter de tester un `index.html` périmé.
- `Code.gs` : check syntaxique inchangé.

## Flux de données / workflow dev

1. Éditer `src/**`.
2. `node build.js` → régénère `index.html`.
3. `node tests/run.js` → 180 checks.
4. Ouvrir `index.html` en local (double-clic, fallback CSV) pour contrôle visuel.
5. Copier-coller `index.html` → fichier `index` Apps Script (+ `Code.gs` si changé) → déployer en Web App (bound ou standalone, inchangé).
6. En cas d'oubli du build : `--check` échoue avec message explicite (« relance node build.js »).

## Gestion d'erreur

- Fichier `src/` manquant dans `build.js` : erreur explicite avec nom du fichier attendu, exit 1, `index.html` non écrasé.
- `index.html` périmé détecté par `--check` : diff de contenu, pas de réécriture silencieuse.
- Apps Script : aucun changement (toujours 1 fichier `index`, pas de scriptlets, pas de CSP externe supplémentaire, CDN HTTPS inchangés).
- Local `file://` : inchangé (pas de fetch inter-fichiers, pas de modules, le fichier généré reste auto-porteur hors CDN).

## Tests (critères d'acceptation du plan)

- `node build.js && node tests/run.js` : 180/180 pass.
- `node build.js --check` après build : exit 0 ; après édition `src/` sans rebuild : exit != 0.
- `index.html` régénéré ≈ même taille (± quelques %) et même comportement : Standard/Advanced/Matrix, charts, CSV local, `google.script.run` mocké.
- Ouverture locale `index.html` après build : pas de régression visuelle (tabs, presets, KaTeX, Lucide).

## Hors périmètre

- Aucun changement fonctionnel (Engine, courbes, hybrid T1/T2, grandfathering ≥ 20%, matrice 2×2/3×3, filtres Orga/Country/Position).
- Aucun changement `Code.gs` (SHEET_ID, `getPopulation`, `doGet`).
- Pas de migration `clasp`, pas d'externalisation JS/CSS sur hosting tiers, pas de minification/purge Tailwind, pas de modules ES.
- Pas de split du `<style>` (1,2 Ko) ni des CDN.
