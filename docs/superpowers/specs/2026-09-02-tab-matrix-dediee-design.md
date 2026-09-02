# Design : Tab Matrix dédiée

Date : 2026-09-02
Statut : approuvé par l'utilisateur

## Objectif

Déplacer la matrice Salaire × Performance hors de la carte Population de la vue Advanced vers une troisième tab principale dédiée, avec des contrôles synchronisés, un mode par défaut « Δ vs current », une identification explicite des valeurs Hybrid/New, et une couleur plus lisible pour les valeurs « Hybrid expected value » du tableau population.

## Décisions validées

- **Placement** : 3e tab principale (Standard | Advanced | Matrix), même mécanique que `setView`.
- **Min nominal / min 200%** : inputs éditables dans la tab Matrix, synchronisés dans les deux sens avec la vue Advanced.
- **Couleur Hybrid** : amber (jaune-orange) à la place d'orange-700.
- **Contenu** : matrice + filtres population (Orga/Country/Position). La carte Population d'Advanced garde son tableau mais perd la matrice.

## Architecture

### 1. Tab principale « Matrix »

- Troisième bouton `tab-matrix` dans le header, appelant `setView('matrix')`.
- `setView(view)` étendu : trois `<main>` (`view-standard`, `view-advanced`, `view-matrix`) toggle-hidden ; classes actives des trois boutons gérées ; seul `isAdv` déclenche l'init du chart Advanced et le chargement auto de la population (comportement inchangé).
- `<main id="view-matrix">` pleine largeur (max-w-7xl, même gabarit que les autres vues), contient deux cartes :
  - **Carte contrôles** : slider Target Increase, inputs Min. Nominal (at 100%) et Min. Amount at 200%, filtres Orga/Country/Position.
  - **Carte matrice** : le bloc `matrix-card` actuel (déplacé tel quel depuis la carte Population d'Advanced).

### 2. Synchronisations (approche A : duplication synchronisée)

- **Target Increase** : le slider de la tab Matrix (`matrix-target-increase`) rejoint le groupe synchronisé ; `syncTargetSliders` gère 3 sliders + 3 labels au lieu de 2 (guarded `if (el)`).
- **Min100/min200** : nouvelle fonction `syncMinInputs()` ; les inputs de la tab Matrix (`matrix-min-100`, `matrix-min-200`) sont synchronisés dans les deux sens avec `adv-min-100`/`adv-min-200` via `advState.min100E`/`advState.min200E`. Tout `input` met à jour l'état, synchronise les 4 inputs, puis relance `refreshPopulation()` (recalcule matrice) et `updateAdvancedView()` (recalcule courbes/KPIs).
- **Filtres** : la tab Matrix possède son propre jeu de selects (`matrix-filter-orga/country/position`) ; `populatePopFilters` remplit les deux jeux, `onPopFilterChange` lit depuis le jeu modifié ; les valeurs restent identiques des deux côtés (`popFilters` état unique).

### 3. Mode par défaut « Δ vs current »

- `let matrixMode = 'deltas'` (au lieu de `'levels'`).
- Classes initiales des boutons inversées dans le HTML : `matrix-mode-deltas` actif (orange), `matrix-mode-levels` inactif (slate).

### 4. Identification Hybrid vs New

Chaque cellule de matrice affiche des chips explicites au lieu de deux valeurs brutes :

- Mode Expectations : `<chip amber>Hyb</chip> valeur` puis `<chip indigo>New</chip> valeur`.
- Mode Δ vs current : `<chip amber>Δ Hyb</chip> valeur signée` puis `<chip indigo>Δ New</chip> valeur signée`.
- Les tests existants qui cherchent `text-orange-700` / `text-indigo` dans les cellules sont adaptés aux nouvelles classes amber/indigo.

### 5. Couleur « Hybrid expected value »

- Tableau population (ligne `eHyb`) : `text-orange-700` → `text-amber-600`, distinguable du `text-rose-600` des deltas négatifs.
- Les autres usages d'orange (badges, légende du chart, boutons actifs) restent inchangés.

## Flux de données

1. L'utilisateur bouge un contrôle (slider/input/filtre) dans n'importe quelle tab.
2. L'état unique (`state.targetIncrease`, `advState.min100E/min200E`, `popFilters`) est mis à jour.
3. Les contrôles dupliqués sont resynchronisés (`syncTargetSliders`, `syncMinInputs`, `populatePopFilters`).
4. `refreshPopulation()` recalcule agrégats, tableau et matrice ; `updateAdvancedView()` recalcule la vue Advanced si nécessaire.

## Gestion d'erreur

- Population vide : la matrice affiche `matrix-empty` (« Load a population… ») — inchangé.
- Inputs non numériques : `parseFloat` + fallback 0, `Math.max(0, …)` — inchangé, réutilisé.

## Tests (`tests/03-population.test.js`)

- Mode par défaut : après chargement, `matrixMode === 'deltas'` et bouton deltas actif.
- Cellules : présence des chips `Δ Hyb`/`Δ New` (ou `Hyb`/`New` en mode levels) et des classes amber/indigo.
- Sync min100/min200 : changer `matrix-min-100` met à jour `advState.min100E` et `adv-min-100` (et réciproquement).
- Sync filtres : changer `matrix-filter-orga` met à jour `pop-filter-orga`.
- `setView('matrix')` affiche `view-matrix` et masque les deux autres.
- Suite de régression existante adaptée à la nouvelle structure (matrice hors carte Population).

## Hors périmètre

- Aucun changement de calcul (Engine, quadrants, conditioning).
- Aucun changement visuel du graphique Advanced ni des presets.
