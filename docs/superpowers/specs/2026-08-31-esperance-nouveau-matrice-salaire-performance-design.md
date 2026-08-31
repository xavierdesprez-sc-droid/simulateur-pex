# Spec : Espérance nouveau dans le tableau + matrice Salaire × Performance

Date : 2026-08-31
Statut : Validé (design approuvé oralement, « go »)

## Contexte

La vue avancée affiche, pour la population chargée depuis le Sheet, un tableau
par commercial (ID / Fixe / Nominal / Espérance actuelle / Espérance hybride /
Δ €) et des cards d'agrégats (PEX actuel, hybride, tout-nouveau ; perdants…).
L'espérance tout-nouveau (`eNewFull`) est déjà calculée dans la boucle de
`refreshPopulation()` mais agrégée uniquement — jamais affichée par rep.

## Objectifs

1. Ajouter au tableau par commercial la colonne **Espérance nouveau** et le
   **Δ € (nouveau vs actuel)**.
2. Ajouter une card **Matrice Salaire × Performance** (2×2) montrant les
   impacts du nouveau schéma par quadrant.

## Décisions validées

- **Δ du tableau** : nouveau − actuel (même convention que le Δ hybride).
- **Seuils de la matrice** :
  - Salaire bas/haut : comparé à la **moyenne des fixes de la population
    affichée** (après filtres orga/pays/position).
  - Top/low performer : **moitié de la distribution** — top = intégration sur
    x > muC, low = x < muC (distribution calibrée). Pas de classement
    individuel des reps.
- **Contenu des quadrants** : hybride ET nouveau (2 lignes par quadrant), avec
  un **switch Espérances / Δ vs actuel**. Le Δ « actuel » est intégré sur la
  moitié correspondante de la distribution historique (chaque moitié de sa
  propre distribution).

## Spécification fonctionnelle

### 1. Tableau des commerciaux

Deux colonnes après « Espérance hybride » / « Δ € » (colonne Δ hybride reste
après hybride ; ordre final : ID, Fixe, Nominal, Esp. actuelle, Esp. hybride,
Δ €, Esp. nouveau, Δ €) :

- **Espérance nouveau** : `eNewFull` du rep (schéma avancé, nominaux adv).
- **Δ € (nouveau)** : `eNewFull − eStdOld`, coloré émeraude si > +20 €,
  rose si < −20 €, gris sinon (mêmes seuils que le Δ hybride).

Tri : inchangé (tri par Δ hybride croissant).

### 2. Card « Matrice Salaire × Performance »

- Emplacement : sous le tableau population, dans le même panneau.
- Grille 2×2 : lignes = Salaire bas / Salaire haut ; colonnes = Low performer
  / Top performer. Étiquettes avec effectif du quadrant en petit.
- Chaque quadrant : deux valeurs — **Hybride** (orange) et **Nouveau**
  (indigo), moyennes sur les commerciaux du quadrant.
- Switch dans l'entête de la card : **Espérances** (niveaux €) / **Δ vs
  actuel** (impacts par quadrant, formatés comme les deltas du tableau).
- Moyenne conditionnelle : pour un quadrant (moitié salaire × moitié
  performance), on moyenne sur les reps du demi-salaire l'espérance intégrée
  sur la demi-distribution de performance correspondante (densité renormalisée
  sur x < muC ou x > muC pour hybride/nouveau ; x < mu0 ou x > mu0 pour
  l'actuel dans le mode Δ).
- État vide : si aucun commercial affiché, la card affiche un message.

## Spécification technique

- Moteur : aucune nouvelle primitive. Réutilisation de `Engine.densityPoints`,
  `Engine.oldE`, `Engine.hybridE`, `Engine.newBaseE` avec un filtrage
  `{ x, w } → x < mu` / `x > mu` et renormalisation (Σw = 1 sur la demi-fenêtre).
- `refreshPopulation()` :
  - stocke `eNew` et `deltaNew` dans `rows` ;
  - calcule les agrégats de matrice (4 quadrants × {old, hyb, new} + counts)
    et les expose via une variable module-level `popMatrix` (testable) ;
  - met à jour le DOM de la matrice selon le mode courant
    (`matrixMode = 'levels' | 'deltas'`).
- Tests (suite `03-population.test.js` + `02-advanced-ui.test.js`) :
  1. Colonnes du tableau : l'entête contient « Espérance nouveau » et le body
     des lignes contiennent la valeur `eNew` et `deltaNew`.
  2. Somme des espérances nouveau du tableau ≈ `pexNew` affiché.
  3. Matrice : quadrants aux coins = structure 2×2 présente ; effectifs des 4
     quadrants somment au nombre de commerciaux affichés.
  4. Hybride matrice ≈ agrégat : moyenne des espérances hybrides des
     quadrants pondérée par effectifs ≈ `pexHyb` (à tolérance près, car les
     quadrants conditionnent sur des demi-distributions — vérifier plutôt la
     cohérence interne : chaque quadrant < ou > selon la demi-distribution).
  5. Switch bascule l'affichage niveaux/deltas.

## Hors périmètre

- Toute modification du moteur (`Code.gs`, courbes, quantiles).
- La vue standard.
