// Central storage for the annotation site: a Google Sheet behind an Apps Script web app.
//
// Setup (about 5 minutes, once):
//   1. Create a new Google Sheet. Extensions -> Apps Script. Replace the code with this file. Save.
//   2. Deploy -> New deployment -> type "Web app".
//      Execute as: Me.   Who has access: Anyone.
//   3. Copy the web-app URL (ends in /exec) into config.js as window.SYNC_URL, commit, push.
//
// One row per (user, item); re-saving an item updates its row. Annotators can then
// resume from any browser by logging in with the same username.

const SHEET = "annotations";
const COLS = ["user", "item_id", "consistency", "note",
              "step1_at", "step1_seconds", "updated_at"];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(COLS); sh.setFrozenRows(1); }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const user = String((e.parameter && e.parameter.user) || "").toLowerCase();
  const values = sheet_().getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() !== user) continue;
    const row = {};
    COLS.forEach((c, j) => { row[c] = values[i][j] instanceof Date ? values[i][j].toISOString() : values[i][j]; });
    rows.push(row);
  }
  return json_({ rows: rows });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    const user = String(body.user || "").toLowerCase();
    if (!user || !body.item_id) return json_({ ok: false, error: "missing user or item_id" });
    const sh = sheet_();
    const values = sh.getDataRange().getValues();
    const record = COLS.map((c) => c === "user" ? user : (body[c] === undefined ? "" : body[c]));
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).toLowerCase() === user && values[i][1] === body.item_id) {
        sh.getRange(i + 1, 1, 1, COLS.length).setValues([record]);
        return json_({ ok: true, updated: true });
      }
    }
    sh.appendRow(record);
    return json_({ ok: true, updated: false });
  } finally {
    lock.releaseLock();
  }
}
