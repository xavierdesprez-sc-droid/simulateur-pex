/**
 * Simulateur Rémunération Variable & PEX — backend Google Apps Script
 *
 * Deux modes de déploiement :
 * - **Lié au Sheet** : ouvrir le Sheet > Extensions > Apps Script, coller Code.gs + index.html,
 *   déployer en Application Web. SHEET_ID reste vide.
 * - **Standalone** : créer un projet Apps Script indépendant (script.google.com), coller les
 *   fichiers, renseigner SHEET_ID avec l'ID du classeur cible, déployer en Application Web.
 *   À la première exécution, Google demandera l'autorisation d'accéder au classeur.
 *
 * Le fichier HTML doit s'appeler "index".
 * Données lues dans l'onglet "Data dynamic distributions" :
 * en-tête en ligne 4, colonnes
 * A=Orga, B=Position, C=Country, D=ID, E-F=(ignorées), G=Base Salary, H=Amount
 */

const HEADER_ROW = 4;
const COL = { ORGA: 1, POSITION: 2, COUNTRY: 3, ID: 4, BASE_SALARY: 7, AMOUNT: 8 };

/**
 * Déploiement standalone : coller ici l'ID du Google Sheet
 * (l'ID est la longue chaîne dans l'URL du Sheet, entre /d/ et /edit).
 * Laisser vide si le script est lié au Sheet (Extensions > Apps Script).
 */
const SHEET_ID = '';
const SHEET_NAME = 'Data dynamic distributions';

function getSpreadsheet() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getDataSheet() {
  const sh = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Feuille "' + SHEET_NAME + '" introuvable dans le classeur');
  return sh;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Simulateur Rémunération Variable & PEX')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getPopulation() {
  const sh = getDataSheet();
  const lastRow = sh.getLastRow();
  if (lastRow <= HEADER_ROW) return { reps: [], ignored: 0 };
  const values = sh.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, 8).getValues();
  const mapped = values.map((r, i) => ({
    id: String(r[COL.ID - 1] || 'rep' + (i + 1)),
    orga: String(r[COL.ORGA - 1] || ''),
    position: String(r[COL.POSITION - 1] || ''),
    country: String(r[COL.COUNTRY - 1] || ''),
    fixed: Number(r[COL.BASE_SALARY - 1]) || 0,
    nominal: Number(r[COL.AMOUNT - 1]) || 0
  }));
  const reps = mapped.filter(r => r.fixed > 0 && r.nominal >= 0);
  return { reps, ignored: mapped.length - reps.length };
}
