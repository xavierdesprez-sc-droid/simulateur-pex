/**
 * Variable Compensation & Sales PEX Simulator — Google Apps Script backend
 *
 * Two deployment modes:
 * - **Bound to the Sheet**: open the Sheet > Extensions > Apps Script, paste Code.gs + index.html,
 *   deploy as a Web App. SHEET_ID stays empty.
 * - **Standalone**: create a standalone Apps Script project (script.google.com), paste the
 *   files, set SHEET_ID to the ID of the target spreadsheet, deploy as a Web App.
 *   On first run, Google will ask for permission to access the spreadsheet.
 *
 * The HTML file must be named "index".
 * Data is read from the "Data dynamic distributions" tab:
 * header on row 4, columns
 * A=Orga, B=Position, C=Country, D=ID, E-F=(ignored), G=Base Salary, H=Amount
 */

const HEADER_ROW = 4;
const COL = { ORGA: 1, POSITION: 2, COUNTRY: 3, ID: 4, BASE_SALARY: 7, AMOUNT: 8 };

/**
 * Standalone deployment: paste the Google Sheet ID here
 * (the ID is the long string in the Sheet URL, between /d/ and /edit).
 * Leave empty if the script is bound to the Sheet (Extensions > Apps Script).
 */
const SHEET_ID = '';
const SHEET_NAME = 'Data dynamic distributions';

function getSpreadsheet() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getDataSheet() {
  const sh = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet "' + SHEET_NAME + '" not found in the spreadsheet');
  return sh;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Variable Compensation & PEX Simulator — Sales Reps')
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
