# Simulateur Rémunération Variable & PEX Commerciaux

Outil interactif de simulation de scénarios de rémunération variable commerciale et de leur impact
sur la masse salariale (PEX). **100% local** : un seul fichier HTML, aucune donnée ne quitte le
navigateur, aucune installation.

## Lancement

Ouvrir `index.html` dans un navigateur (double-clic suffit). Les librairies (Tailwind, Chart.js,
KaTeX, Lucide) sont chargées via CDN — une connexion internet est nécessaire au premier chargement.

## Vue Standard

Modèle de population : distribution gaussienne des taux d'atteinte (µ et σ paramétrables).

- **Sliders stratégiques** : hausse des objectifs (décalage de la distribution), surperformance induite
- **Courbes** : ancienne (linéaire 1:1) vs nouvelle (paliers éditables : 50%→10%, 80%→50%, 100%→100%,
  100%→200% progressif, cap paramétrable)
- **KPIs de masse** : PEX nouveau vs actuel, Δ masse salariale, gain corridor additionnel, bilan net P&L
- **Simulateur individuel** : salaire fixe, part de prime actuelle, protection des acquis (le nouveau
  nominal = max(20%, acquis)) — les commerciaux à ≥ 20% conservent leur taux
- **Répartition de la population** par tranches d'atteinte avec impact moyen par commercial

## Vue Avancée — Schéma hybride

Simulateur de scénarios de transition plus fins. Commutateur **Vue Standard / Vue Avancée** dans le header.

### Règles du schéma

- **Nouveau nominal** = max(cible 20% du fixe, nominal minimum € saisi, ancien nominal €)
- **Valeur à 200%** = max(2 × nouveau nominal, montant minimum € saisi)
- **Courbe de base** : linéaire de 0 à 100% jusqu'au nouveau nominal, puis linéaire de 100% à 200%
- **Passage à la nouvelle courbe** entre T1 et T2 (slider double 0–200%) : segment droit reliant
  l'ancienne courbe (en T1) à la nouvelle (en T2)
- **Seuil de déclenchement** : en dessous de ce taux d'atteinte, 0 versé (0 = désactivé)
- **Hausse des objectifs** : décale l'atteinte calibrée du commercial testé (points avant/après)

L'ancien nominal est saisi **en €** ; la courbe affichée est exprimée en % de l'ancien nominal du
commercial testé (chaque commercial a donc sa propre courbe selon son ratio nominal).

### Impact masse agrégé

Intégration de la courbe hybride (nominal moyen 11% → 20%) sur la gaussienne globale.

## Population réelle (Google Sheet)

Dans la vue avancée, le bouton **"Charger depuis le Google Sheet"** remplace la moyenne unique par
les vrais nominaux :

- **Onglet lu** : `Data dynamic distributions` — en-tête en **ligne 4**, colonnes
  `A=Orga, B=Position, C=Country, D=ID, E–F=(ignorées), G=Base Salary, H=Amount`
- Pour chaque commercial : E[versé] = ∫ sa courbe hybride personnelle × densité gaussienne (µ, σ globaux)
- **Sorties** : PEX actuel / hybride / tout-nouveau réels, nb de perdants, perte max, perte moyenne,
  table triée par delta € avec statut (Grand-père / Gagnant / Perdant)

La carte se recalcule en temps réel quand les paramètres de la courbe changent. Les données restent
dans le navigateur.

## Déploiement Google Apps Script

Deux modes possibles (`Code.gs` gère les deux) :

**Lié au Sheet** (plus simple) :
1. Ouvrir le Google Sheet → Extensions → Apps Script
2. Coller `Code.gs` dans `Code.gs`, et le contenu de `index.html` dans un fichier HTML nommé `index`
3. Déployer → Nouveau déploiement → Application Web

**Standalone** (un seul web app, indépendant du classeur) :
1. Créer un projet sur script.google.com
2. Coller les deux fichiers (HTML nommé `index`)
3. Renseigner `SHEET_ID` en haut de `Code.gs` avec l'ID du classeur (la chaîne dans l'URL entre `/d/` et `/edit`)
4. Déployer → Application Web — Google demandera l'autorisation d'accès au classeur au premier lancement

Ouvert hors Apps Script (fichier local), le bouton de chargement affiche un message d'information —
le reste de l'outil fonctionne normalement.

## Technique

- `index.html` (client) + `Code.gs` (backend Apps Script) — Chart.js, Tailwind CSS, KaTeX, Lucide (CDN)
- Historique git complet ; tags : `v1-sans-transition`, `v2-avec-transition`
- Moteur de tests : harnais Node avec DOM simulé (suites de 1600+ vérifications :
  continuité aux frontières, égalité avec modèles de référence)
