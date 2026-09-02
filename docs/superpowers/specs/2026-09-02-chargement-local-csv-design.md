# Spec : chargement local du CSV de population (fallback hors Apps Script)

**Date :** 2026-09-02
**Statut :** approuvé par l'utilisateur (design validé en conversation)

## Problème

Le bouton « Load from Google Sheet » (vue avancée) affiche un simple message
d'information quand `index.html` est ouvert hors Apps Script
(`index.html`, fonction `loadPopulationFromSheet`). Impossible de tester la
population réelle en local.

## Objectif

En local, le bouton charge directement un fichier CSV (`population_test.csv`,
fourni à côté d'`index.html`) dans la même structure `advPopulation` que le
chargement Sheet, avec un repli universel si le navigateur bloque la lecture.

## Comportement du bouton `loadPopulationFromSheet`

1. **Apps Script disponible** (`typeof google !== 'undefined' && google.script?.run`)
   → chargement Sheet, code actuel inchangé.
2. **Sinon** → `fetch('population_test.csv')` (même répertoire qu'`index.html`).
   - Succès (HTTP 200) → parsing → `advPopulation` → `refreshPopulation()`
     → statut « N rep(s) loaded from population_test.csv ».
   - Échec (CORS en `file://` sur Chrome/Edge, 404, réseau) → ouverture d'un
     `<input type="file" accept=".csv,text/csv">` caché. Fichier choisi →
     `FileReader.readAsText` → même parsing → statut
     « N rep(s) loaded from <nom du fichier> ». Annulation → message d'info
     dans le statut, population inchangée.
3. **Erreurs de parsing / CSV vide** → message d'erreur dans le statut,
   `advPopulation` inchangé.

## Parsing : `parsePopulationCsv(text)`

Nouvelle fonction **pure et DOM-free** dans la section Engine (testable
directement), cohérente avec `Code.gs#getPopulation` :

- Ignore la première ligne (header).
- Colonnes : A=Orga, B=Position, C=Country, D=ID, E–F ignorées,
  G=Base Salary, H=Amount.
- Champs : découpés à la virgule ; guillemets doubles périphériques retirés ;
  cellules manquantes (ligne trop courte) = chaîne vide.
- `id` : valeur colonne D, sinon fallback `rep<i+1>` (i = index de la ligne de
  données) ; `fixed`/`nominal` : `Number(...) || 0`.
- Filtre : garde `fixed > 0 && nominal >= 0` (identique à `Code.gs`).
- Retour : `{ reps, ignored }` avec `reps = [{ id, orga, position, country,
  fixed, nominal }]`.
- Tolère les retours `\r\n` et une éventuelle ligne vide finale.

## UI

- Un `<input type="file">` caché (`id="pop-csv-input"`) ajouté près du bouton
  existant ; déclenché par `.click()` programmatique.
- Aucun changement visuel du bouton ; le bandeau `pop-status` existant sert
  aux messages (chargement, succès, annulation, erreur).

## Tests (`tests/03-population.test.js`)

- `parsePopulationCsv` : CSV valide (mapping complet), header ignoré,
  fallback d'id, lignes invalides comptées dans `ignored`, `nominal = 0`
  accepté, `\r\n` toléré.
- Chargement local : mock de `fetch` renvoyant un CSV → `advPopulation`
  peuplée, statut correct ; `fetch` en échec → pas de crash (chemin picker ;
  le déclenchement du picker lui-même n'est pas testé, comportement DOM).

## README

Mise à jour de la section « Real population » : en local le bouton charge
`population_test.csv` automatiquement, avec sélecteur de fichier en repli.

## Hors périmètre

- Auto-chargement à l'ouverture de la page.
- Parsing de CSV avec séparateur `;` ou détection de header à la ligne 4
  (le CSV fourni a son header en ligne 1).
- Modification de `Code.gs`.
