# Design : Fourchettes à 95% sur les impacts globaux

Date : 2026-08-31
Statut : Approuvé (design validé en session)

## Objectif

Afficher un intervalle de confiance à 95% (« fourchette ») sous les valeurs des cards d'impact global, représentant la dispersion du **total masse salariale de l'équipe** (pas la dispersion individuelle). Hypothèse de corrélation inter-commerciaux paramétrable (ρ).

## Modèle probabiliste

Taux d'atteinte du commercial i :

```
X_i = µ_i + σ_i · (√ρ · Z + √(1−ρ) · ε_i)
```

où Z ~ N(0,1) est un **facteur commun** (aléa de marché, partagé) et ε_i ~ N(0,1) l'**aléa individuel indépendant**. ρ ∈ [0, 1] est un paramètre d'entrée (défaut 0.3).

### Calcul du quantile du total

Pour une quantité d'impact f (somme sur les rép de fonctions fᵢ du taux d'atteinte) :

1. **Partie commune** : C(z) = Σᵢ fᵢ(µ_i + σ_i·√ρ·z). Les courbes de payout (`Engine.oldE`, `Engine.paliers`, `Engine.hybridE`, `Engine.newBaseE`) sont croissantes, donc C est croissante en z. Ses quantiles se lisent par balayage de la grille de densité `Engine.densityPoints(0, 1)` (fenêtre ±4.5σ, step 0.5 — existant).
2. **Partie indépendante** : v_i = Var[fᵢ(µ_i + σ_i·√(1−ρ)·ε)] calculée par `Engine.integrate` sur f et f² (pattern existant). σ_idio = √(Σ v_i).
3. **Quantile** : `Q_α(Total) = Q_α(C(Z)) + z_α · σ_idio` avec z_0.025 = −1.959964, z_0.975 = +1.959964.

Il s'agit de l'approximation standard de décomposition commune + indépendante ; la partie CLT est excellente aux effectifs considérés (N ≥ 60). Déterministe et reproductible (aucun tirage aléatoire), cohérent avec la philosophie du moteur actuel.

### Cas limites

- ρ = 0 : partie commune constante, intervalle = moyenne ± 1.96·σ_idio (CLT pur).
- ρ = 1 : σ_idio = 0, fourchette = quantiles de la distribution individuelle × N.
- Clamper √ρ et √(1−ρ) à ≥ 0.

## Quantités concernées

| Card | Quantité | Fourchette | Fonction f |
|---|---|---|---|
| Standard 1 – PEX Variable Nouveau | `newPexM` | Oui | Σ paliers(x)/100 × newNom par rép |
| Standard 2 – ΔPEX | `pexDiffM = old − new` | Oui | g(x) = oldE(x) − newStd(x) par rép (même tirage X → corrélation gérée naturellement) |
| Standard 3 – Gain C2P | `c2pGainM` | **Non** | Déterministe : overperf est un paramètre, pas un aléa |
| Standard 4 – Bilan Net | `netGainM` | Oui | = marginGain (déterministe) + fourchette(ΔPEX) |
| Avancée – Impact Masse Agrégé | `pexOld` / `pexHyb` / `pexNew` | Oui sur hyb et new ; old seulement en population réelle (où pexOld est aléatoire) |
| Avancée – Population réelle | `pop-pex-old/hyb/new` | Oui | Mêmes quantités par rép |

### Deux modes, une seule mécanique

- **Modèle moyen** (pas de population chargée) : N = `state.headcount`, tous les rép identiques (µ calibré, σ = `sigmaInit`, nominaux moyens).
- **Population réelle** (`advPopulation` non vide) : nominaux propres par rép, µ et σ communs (µ0 historique / µC calibré, `sigmaInit`) — conforme à `refreshPopulation()`.

Dans les deux cas, la fourchette porte sur le **total de l'équipe** : N = `state.headcount` en modèle moyen, N = `advPopulation.length` en population réelle.

## Implémentation

### 1. Moteur (pur, sans DOM)

Nouveau helper dans `Engine` :

```js
// fns : tableau de fonctions fᵢ (une par rép, ou une seule réutilisée)
// mus, sigmas : tableaux (ou valeurs communes) par rép
// rho : corrélation inter-commerciaux
// alpha : 0.05 par défaut
Engine.totalQuantiles({ fns, mus, sigmas, rho, alpha }) → { lo, hi, mean }
```

Détails :
- Grille commune : `pts = densityPoints(0, 1)` (z-grid).
- Partie commune : pour chaque z de la grille, C(z) = Σ fᵢ(µᵢ + σᵢ·√ρ·z) ; CDF cumulée sur les poids ; quantiles par interpolation linéaire.
- Partie indépendante : pour chaque rép, vᵢ = E[f²] − (E[f])² avec les tirages ε = z·√(1−ρ) sur la même grille ; σ_idio = √(Σ vᵢ).
- Retour : `{ lo: Q025 + z_025·σ_idio, hi: Q975 + z_975·σ_idio, mean: E[Total] }`.
- Aucune référence DOM ; testable unitairement via le harnais `tests/`.

### 2. État et entrées

- `state.rho = 0.3` (défaut).
- Nouveau champ « Corrélation inter-commerciaux ρ » dans les panneaux de paramètres des deux vues (input number 0–1, step 0.05, via le pattern `bindNumberInput` existant avec clamp).
- Toute modification déclenche `updateDashboard()` / recalculs existants.

### 3. Affichage

- Sous chaque valeur concernée : ligne `IC 95% : [x – y] M€` en `text-[10px] text-slate-500` (style discret, cohérent avec les badges existants).
- Nouveaux IDs DOM : `kpi-pex-new-ci`, `kpi-pex-savings-ci`, `kpi-net-gain-ci`, `adv-agg-hyb-ci`, `adv-agg-new-ci`, `adv-agg-old-ci`, `pop-pex-old-ci`, `pop-pex-hyb-ci`, `pop-pex-new-ci`.
- Card Gain C2P : pas de ligne CI.
- Les fourchettes suivent le mode actif (modèle moyen vs population réelle).

### 4. Intégration aux fonctions existantes

- `updateDashboard()` : calcule les fourchettes des 4 cards standard ; passe les fourchettes à la vue standard et réutilise `realAgg` quand une population est chargée.
- `refreshPopulation()` : étend `realAgg` avec les quantiles `{ pexOld, pexHyb, pexNew, stdDiff }` calculés par `Engine.totalQuantiles` sur les fonctions par-rép existantes (une seule passe de grille supplémentaire par quantité).
- Mise à jour de l'agrégat Vue Avancée (`adv-agg-*`) avec les mêmes mécanismes.

## Tests

Extension de `tests/` (harnais DOM-simulé existant, `node tests/run.js`) :

1. **Monotonie en ρ** : la largeur de la fourchette croît avec ρ (f croissante quelconque).
2. **Limites** : ρ=0 → intervalle symétrique ≈ moyenne ± 1.96·σ_idio ; ρ=1 → fourchette = quantiles individuels × N.
3. **Cohérence moyenne** : pour f quasi-linéaire, moyenne ≈ centre de l'intervalle.
4. **Validation gaussienne** : quantile de Z connu (ex : Q_0.975 ≈ 1.96) reproduit par le balayage de grille.
5. **Non-régression** : les suites existantes passent toujours.

## Hors périmètre

- Incertitude sur les paramètres eux-mêmes (µ, σ estimés) — hors sujet : la fourchette porte sur la distribution des résultats, pas sur l'erreur d'estimation.
- Monte Carlo (rejeté : non déterministe, plus lent, difficilement testable).
- Approximation normale globale (rejetée : fonctions à paliers → distribution asymétrique).
