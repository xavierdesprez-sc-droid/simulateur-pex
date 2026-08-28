/**
 * Simulateur Rémunération Variable & PEX — backend Google Apps Script
 *
 * Déploiement :
 * 1. Ouvrir le Google Sheet (Extensions > Apps Script)
 * 2. Coller ce fichier en "Code.gs" et le contenu de index.html dans un fichier HTML nommé "index"
 * 3. Déployer > Nouveau déploiement > Application Web (exécuter en tant que : moi, accès : à définir)
 *
 * Attendu dans la feuille : en-tête en ligne 4, colonnes
 * A=Orga, B=Position, C=Country, D=ID, E-F=(ignorées), G=Base Salary, H=Amount
 */

const HEADER_ROW = 4;
const COL = { ORGA: 1, POSITION: 2, COUNTRY: 3, ID: 4, BASE_SALARY: 7, AMOUNT: 8 };

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Simulateur Rémunération Variable & PEX')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getPopulation() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const lastRow = sh.getLastRow();
  if (lastRow <= HEADER_ROW) return [];
  const values = sh.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, 8).getValues();
  return values
    .map((r, i) => ({
      id: String(r[COL.ID - 1] || 'rep' + (i + 1)),
      orga: String(r[COL.ORGA - 1] || ''),
      position: String(r[COL.POSITION - 1] || ''),
      country: String(r[COL.COUNTRY - 1] || ''),
      fixed: Number(r[COL.BASE_SALARY - 1]) || 0,
      nominal: Number(r[COL.AMOUNT - 1]) || 0
    }))
    .filter(r => r.fixed > 0 && r.nominal >= 0);
}
