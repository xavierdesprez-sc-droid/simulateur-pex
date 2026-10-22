/**
 * SWE 2025 Achievement Dashboard: Google Apps Script backend (separate project).
 * Full-access list only (canViewIndividualTables). The access and swe2025-source
 * blocks are copied byte for byte from ../Code.gs; tests/backend-swe-2025.test.js
 * fails if they drift.
 */

// BEGIN SHARED: access
const ACCESS_LIST_SPREADSHEET_ID = '1uLTW_Kk4Z5YEfsZWkLHAKWhAcBaenDsGn6t6wogzqTA';
const ACCESS_LIST_SHEET_NAME = 'Access';
const ACCESS_CONTACT_CELL = 'D2';
const ACCESS_FULL_EMAIL_COLUMN = 1;
const ACCESS_RESTRICTED_EMAIL_COLUMN = 2;
const ACCESS_EMAIL_START_ROW = 2;

function getAccessSheet_() {
  const spreadsheetId = String(ACCESS_LIST_SPREADSHEET_ID || '').trim();
  if (!spreadsheetId) {
    throw new Error('Set ACCESS_LIST_SPREADSHEET_ID in Code.gs to the private access-list spreadsheet ID.');
  }

  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(ACCESS_LIST_SHEET_NAME);
  if (!sheet) throw new Error('Access-list tab "' + ACCESS_LIST_SHEET_NAME + '" not found.');
  return sheet;
}

function getAccessStatus_() {
  const sheet = getAccessSheet_();
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const contactEmail = String(sheet.getRange(ACCESS_CONTACT_CELL).getDisplayValue() || '').trim();
  const lastRow = sheet.getLastRow();
  const accessRows = lastRow < ACCESS_EMAIL_START_ROW
    ? []
    : sheet.getRange(
      ACCESS_EMAIL_START_ROW,
      ACCESS_FULL_EMAIL_COLUMN,
      lastRow - ACCESS_EMAIL_START_ROW + 1,
      ACCESS_RESTRICTED_EMAIL_COLUMN
    ).getDisplayValues();
  const hasFullAccess = Boolean(email) && accessRows.some(
    row => String(row[ACCESS_FULL_EMAIL_COLUMN - 1] || '').trim().toLowerCase() === email
  );
  const hasRestrictedAccess = Boolean(email) && accessRows.some(
    row => String(row[ACCESS_RESTRICTED_EMAIL_COLUMN - 1] || '').trim().toLowerCase() === email
  );

  return {
    allowed: hasFullAccess || hasRestrictedAccess,
    canViewIndividualTables: hasFullAccess && !hasRestrictedAccess,
    contactEmail
  };
}

function getAccessDeniedMessage_(contactEmail) {
  return contactEmail
    ? 'You do not currently have access to this simulator. Please contact ' + contactEmail + ' to request access.'
    : 'You do not currently have access to this simulator. Please contact the simulator owner to request access.';
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function createAccessDeniedPage_(contactEmail) {
  const message = escapeHtml_(getAccessDeniedMessage_(contactEmail));
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Access required</title></head><body><main><h1>Access required</h1><p>' +
    message + '</p></main></body></html>'
  ).setTitle('Access required');
}

function requireAccess_() {
  const access = getAccessStatus_();
  if (!access.allowed) throw new Error(getAccessDeniedMessage_(access.contactEmail));
  return access;
}
// END SHARED: access

// BEGIN SHARED: swe2025-source
const SWE_2025_SPREADSHEET_ID = '1c2D9H4r6ZkWRchhNysoGjwnY0kn_m0tbpHQSlQVofRM';
const SWE_2025_SHEET_NAME = 'Copie de Liste Sales';
const SWE_2025_HEADER_ROW = 1;
const SWE_2025_REQUIRED_HEADERS = [
  'Country', 'Business Title', 'In/Out', 'Annualized Base Pay', 'Nominal',
  'Achievement 2025', 'Rating - Most Recent', 'Market', 'Category', 'seniority years', 'Age'
];

function normalizeHeader_(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function parseNumberOrNull_(value) {
  const text = String(value == null ? '' : value).trim();
  if (text === '') return null;
  const number = Number(text);
  return isFinite(number) ? number : null;
}

function parseAchievementPercent_(text) {
  const cleaned = String(text == null ? '' : text)
    .replace(/[\s\u00a0]/g, '')
    .replace(/%$/, '')
    .replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return isFinite(value) ? value : null;
}

function readSwe2025Rows_() {
  const sheet = SpreadsheetApp.openById(SWE_2025_SPREADSHEET_ID).getSheetByName(SWE_2025_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SWE_2025_SHEET_NAME + '" not found in the 2025 population spreadsheet.');
  const counts = { total: 0, notIn: 0, invalid: 0, achievementMissing: 0 };
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(SWE_2025_HEADER_ROW, 1, 1, lastColumn).getDisplayValues()[0];
  const columnOf = {};
  headers.forEach((name, index) => { columnOf[normalizeHeader_(name)] = index; });
  const missing = SWE_2025_REQUIRED_HEADERS.filter(name => columnOf[normalizeHeader_(name)] === undefined);
  if (missing.length) throw new Error('Missing column in the 2025 population sheet: ' + missing[0]);
  const numRows = lastRow - SWE_2025_HEADER_ROW;
  if (numRows < 1) return { rows: [], counts };
  const values = sheet.getRange(SWE_2025_HEADER_ROW + 1, 1, numRows, lastColumn).getValues();
  const display = sheet.getRange(SWE_2025_HEADER_ROW + 1, 1, numRows, lastColumn).getDisplayValues();
  const rows = [];
  values.forEach((row, index) => {
    if (row.every(value => String(value == null ? '' : value).trim() === '')) return;
    counts.total++;
    const cell = name => row[columnOf[normalizeHeader_(name)]];
    const text = name => String(cell(name) == null ? '' : cell(name)).trim();
    if (text('In/Out').toLowerCase() !== 'in') {
      counts.notIn++;
      return;
    }
    const fixed = parseNumberOrNull_(cell('Annualized Base Pay'));
    const nominal = parseNumberOrNull_(cell('Nominal'));
    const country = text('Country');
    const jobProfile = text('Business Title');
    if (!country || !jobProfile || fixed === null || !(fixed > 0) || nominal === null || nominal < 0) {
      counts.invalid++;
      return;
    }
    const achievement = parseAchievementPercent_(display[index][columnOf[normalizeHeader_('Achievement 2025')]]);
    if (achievement === null) counts.achievementMissing++;
    rows.push({
      country,
      jobProfile,
      fixed,
      nominal,
      achievement,
      market: text('Market'),
      category: text('Category'),
      rating: text('Rating - Most Recent'),
      seniority: parseNumberOrNull_(cell('seniority years')),
      age: parseNumberOrNull_(cell('Age'))
    });
  });
  return { rows, counts };
}
// END SHARED: swe2025-source

function requireFullAccess_() {
  const access = getAccessStatus_();
  if (!access.canViewIndividualTables) throw new Error(getAccessDeniedMessage_(access.contactEmail));
  return access;
}

function doGet() {
  const access = getAccessStatus_();
  if (!access.canViewIndividualTables) return createAccessDeniedPage_(access.contactEmail);
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('SWE 2025 Achievement Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getDashboardData() {
  requireFullAccess_();
  const parsed = readSwe2025Rows_();
  return { rows: parsed.rows, counts: parsed.counts };
}
