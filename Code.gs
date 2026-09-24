/**
 * Variable Compensation & Sales PEX Simulator — Google Apps Script backend
 *
 * The SWE, NCE, and shared access spreadsheet IDs are configured below.
 * Create separate Apps Script projects for SWE and NCE, keeping DEPLOYED_PROFILE
 * fixed in each project. The profile selects the corresponding data spreadsheet.
 *
 * The HTML file must be named "index".
 * Data is read from the active cluster profile:
 * header on row 4. SWE uses A=Orga, B=Position, C=Country, G=Base Salary,
 * H=Amount. NCE uses A=Job Profile, B=Country, D=Annual Base Pay 2026 Revised,
 * E=Nominal Bonus 2026 Revised. IDs are intentionally ignored.
 */

const POPULATION_PROFILES = {
  SWE: {
    sheetName: 'Data dynamic distributions',
    headerRow: 4,
    rangeWidth: 8,
    columns: { orga: 1, jobProfile: 2, country: 3, fixed: 7, nominal: 8 }
  },
  NCE: {
    sheetName: 'Data dynamic distributions',
    headerRow: 4,
    rangeWidth: 5,
    columns: { jobProfile: 1, country: 2, fixed: 4, nominal: 5 }
  }
};

// Keep the profile fixed server-side: the browser must not choose which
// cluster's spreadsheet it can read.
const DEPLOYED_PROFILE = 'SWE';
const POPULATION_SPREADSHEET_IDS = {
  SWE: '1yszfpDvR3iVB1GX1mRTiymFIKXki2WXsAYsj7b2cP-Y',
  NCE: '1X14uFi-ykPG9hBwhGMfmZjbHKNS3CR-s8aRZPUJTYss'
};
const SHEET_ID = POPULATION_SPREADSHEET_IDS[DEPLOYED_PROFILE];
const ACCESS_LIST_SPREADSHEET_ID = '1uLTW_Kk4Z5YEfsZWkLHAKWhAcBaenDsGn6t6wogzqTA';
const ACCESS_LIST_SHEET_NAME = 'Access';
const ACCESS_CONTACT_CELL = 'D2';
const ACCESS_FULL_EMAIL_COLUMN = 1;
const ACCESS_RESTRICTED_EMAIL_COLUMN = 2;
const ACCESS_EMAIL_START_ROW = 2;

function getSpreadsheet_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

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

function getDataSheet_(profile) {
  const sh = getSpreadsheet_().getSheetByName(profile.sheetName);
  if (!sh) throw new Error('Sheet "' + profile.sheetName + '" not found in the spreadsheet');
  return sh;
}

function doGet() {
  const access = getAccessStatus_();
  if (!access.allowed) return createAccessDeniedPage_(access.contactEmail);

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Variable Compensation & PEX Simulator — Sales Reps')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getPopulation() {
  const access = requireAccess_();

  const profile = POPULATION_PROFILES[DEPLOYED_PROFILE];
  if (!profile) throw new Error('Unknown deployed population profile: ' + DEPLOYED_PROFILE);
  const sh = getDataSheet_(profile);
  const lastRow = sh.getLastRow();
  if (lastRow <= profile.headerRow) {
    return { reps: [], ignored: 0, canViewIndividualTables: access.canViewIndividualTables };
  }
  const values = sh.getRange(
    profile.headerRow + 1, 1, lastRow - profile.headerRow, profile.rangeWidth
  ).getValues();
  let ignored = 0;
  const reps = [];
  values.forEach(r => {
    const c = profile.columns;
    const orga = c.orga ? String(r[c.orga - 1] || '') : '';
    const jobProfile = String(r[c.jobProfile - 1] || '').trim();
    const country = String(r[c.country - 1] || '').trim();
    const fixed = Number(r[c.fixed - 1]) || 0;
    const nominal = Number(r[c.nominal - 1]);
    if ((c.orga && /MG/i.test(orga)) || !jobProfile || !country ||
        !(fixed > 0) || !isFinite(nominal) || nominal < 0) {
      ignored++;
      return;
    }
    reps.push({ jobProfile, country, fixed, nominal });
  });
  return { reps, ignored, canViewIndividualTables: access.canViewIndividualTables };
}
