/**
 * Oakley trial tracker — shared-data backend (Google Apps Script bound to a Google Sheet).
 * Setup: see README "Shared data setup". Change TOKEN, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone). Paste the /exec URL + TOKEN into the app (More tab).
 *
 * The sheet "records" is a simple key-value log: one row per record, last-write-wins by `t`.
 * The app does the field-level merge for daily logs; this script only stores and returns rows.
 */
const TOKEN = 'CHANGE-ME-to-a-long-random-string';
const SHEET_NAME = 'records';

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'type', 'date', 't', 'del', 'data']);
    sh.getRange('A:A').setNumberFormat('@');   // keep ids / dates as plain text
    sh.getRange('C:C').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

function doGet(e) { return handle_({ token: (e.parameter || {}).token, records: [] }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Bad request' }); }
  return handle_(req);
}

function handle_(req) {
  if (req.token !== TOKEN) return out_({ ok: false, error: 'Invalid token' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
    const index = {};
    rows.forEach((r, i) => index[String(r[0])] = i);
    let changed = false;

    (Array.isArray(req.records) ? req.records : []).forEach(rec => {
      if (!rec || !rec.id) return;
      const row = [String(rec.id), rec.type || '', rec.date || '', Number(rec.t) || 0, rec.del ? 1 : 0,
        JSON.stringify({ d: rec.d || {}, ft: rec.ft })];
      if (rec.id in index) {
        const i = index[rec.id];
        if (Number(rows[i][3]) <= row[3]) { rows[i] = row; changed = true; }
      } else {
        rows.push(row); index[rec.id] = rows.length - 1; changed = true;
      }
    });
    if (changed && rows.length) sh.getRange(2, 1, rows.length, 6).setValues(rows);

    const tz = Session.getScriptTimeZone();
    const records = rows.map(r => {
      let p = {};
      try { p = JSON.parse(r[5]); } catch (e) { }
      const date = r[2] instanceof Date ? Utilities.formatDate(r[2], tz, 'yyyy-MM-dd') : String(r[2]);
      return { id: String(r[0]), type: r[1], date: date, t: Number(r[3]), del: Number(r[4]) ? 1 : 0, d: p.d || {}, ft: p.ft };
    });
    return out_({ ok: true, records: records });
  } finally {
    lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
