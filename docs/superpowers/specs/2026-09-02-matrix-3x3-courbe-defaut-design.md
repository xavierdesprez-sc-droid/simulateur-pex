# Design : Matrix 2x2/3x3 + courbe par défaut standard

Date : 2026-09-02

## 1. Courbe par défaut (standard view)

Nouveaux breakpoints par défaut dans `state.breakpoints` et `resetDefaults()` :

| Achievement | Payout |
|---|---|
| 0 | 0 |
| 40 | 0 |
| 100 | 100 |
| 200 | 200 |

Comportement : palier à 0 jusqu'à 40% d'achievement, linéaire 0→100% entre 40% et 100%,
linéaire 100→200% entre 100% et 200%. Aucun changement moteur : `Engine.paliers`
traite déjà `(0,0)` comme payout « below threshold » et le 2e breakpoint (40%) comme seuil.
La table reste éditable. Texte descriptif de la carte (ligne 376 index.html) et README mis à jour.

## 2. Switch 2x2 / 3x3 dans l'onglet Matrix

- État `matrixSize = '2x2'` (défaut), `setMatrixSize(size)` avec segmented control
  (« 2x2 » id `matrix-size-2`, « 3x3 » id `matrix-size-3`) à côté des boutons
  Expectations/Δ. Même style actif/inactif que les boutons de mode.
- `computeMatrix(population, pts0, ptsC, mu0, muC, size)` :
  - **2x2** (inchangé) : salaire < / ≥ moyenne ; perf < / ≥ µ (`halfInt`).
  - **3x3** : salaire en terciles (population triée par `fixed`, split via
    `Math.floor(n/3)` → bas, puis 2e tiers, reste en haut) ; perf en terciles de masse
    de la gaussienne : coupures `tercileCuts(pts)` aux points de densité où la masse
    cumulée atteint 1/3 puis 2/3, et `bandInt(pts, cuts, band)` (low / mid / top)
    généralisant `halfInt`.
- Forme de sortie : `{ size, meanFixed, count: {low[, mid], high}, quadrants: {low|mid|high: {low[, mid], top}} }`.
  Les clés 2x2 existantes (`low`, `high` × `low`, `top`) sont conservées.
- `refreshPopulation()` passe `matrixSize` à `computeMatrix` ; `setMatrixSize`
  relance `refreshPopulation()` (recalcul + rendu).
- **Rendu** : grille statique unique à 4 colonnes (`matrix-grid`). En 2x2, les éléments
  « mid » (`matrix-head-mid`, `matrix-row-mid`, cellules `*-mid`) passent en `hidden`
  et la classe de la grille repasse à `grid-cols-[auto_1fr_1fr]` ; en 3x3 l'inverse.
  Sous-titres de colonnes (« lower half / middle third / upper third of distribution »)
  mis à jour dynamiquement (ids `matrix-sub-low/-mid/-top`). Ids de cellules conservés
  pour les cellules existantes, ajout de `matrix-low-mid`, `matrix-mid-low`,
  `matrix-mid-mid`, `matrix-mid-top`, `matrix-high-mid`, `matrix-count-mid`.
  Cellules vides (« — ») si un bucket est vide, comme aujourd'hui.

## 3. Tests

- `01-model` : nouveaux défauts — `evalNewPayout(70) === 50` (linéaire 40→100),
  `state.breakpoints[1] === {40, 0}` ; reset → 4 breakpoints.
- `03-population` : défaut `matrixSize === '2x2'` ; `setMatrixSize('3x3')` →
  counts somment à N, terciles 1/1/2 sur la population de test, cellules positives,
  monotonie perf par ligne (top ≥ mid ≥ low pour old/hyb/new), cellules DOM mid
  rendues, count mid affiché ; retour 2x2 opérationnel.
