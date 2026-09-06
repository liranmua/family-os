/**
 * Family OS — פרוסה אנכית דקה: טאב Tasks בלבד, קריאה + כתיבה.
 *
 * נטען מתוך Extensions → Apps Script של הגיליון Family_OS_Database (bound script).
 * פריסה: Deploy → New deployment → Web app
 *   Execute as:      User accessing the web app
 *   Who has access:  Only myself   (בשלב הבדיקה הסולו; נשנה כשמורן מצטרפת)
 *
 * מטרת הפרוסה: לוודא שה-Web App קורא וכותב לגיליון האמיתי, שהזהות עובדת,
 * ושה-HTML מתרנדר בתוך HtmlService — לפני שמעבירים את כל הדשבורד.
 */

var TASKS_SHEET = 'Tasks';
var HEADER_ROW = 1;

/* ---------- הגשת הדף ---------- */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Family OS — Tasks')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getCurrentUserEmail() {
  // ב-"Execute as: user accessing" ה-effective == ה-active; active לבדו מחזיר לפעמים ריק.
  var email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  return email || '(לא זוהה)';
}

/* ---------- קריאה ---------- */

/**
 * מחזיר את כל שורות ה-Tasks כאובייקטים לפי שמות העמודות,
 * עם _row = מספר השורה בגיליון. כולל את המייל של המשתמש הנוכחי.
 */
function getTasks() {
  var sh = tasksSheet_();
  var lastRow = sh.getLastRow();
  var headers = headers_(sh);
  var rows = [];
  if (lastRow > HEADER_ROW) {
    var values = sh.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, headers.length).getValues();
    values.forEach(function (r, i) {
      if (r.join('') === '') return; // שורה ריקה
      var obj = { _row: HEADER_ROW + 1 + i };
      headers.forEach(function (h, c) { obj[h] = serialize_(r[c], h); });
      rows.push(obj);
    });
  }
  return { headers: headers, rows: rows, user: getCurrentUserEmail() };
}

/* ---------- כתיבה ---------- */

/**
 * מוסיף משימה חדשה. task = אובייקט לפי שמות העמודות (TaskID אופציונלי — יווצר אוטומטית).
 * מחזיר את רשימת המשימות המעודכנת.
 */
function addTask(task) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = tasksSheet_();
    var headers = headers_(sh);
    if (!task.TaskID) task.TaskID = nextTaskId_(sh, headers);
    // appendRow מדלג על בדיקת Data Validation — לכן הוספה עוברת גם אם רשימת אימות בגיליון שבורה.
    var row = headers.map(function (h) { return task[h] != null ? task[h] : ''; });
    sh.appendRow(row);
    SpreadsheetApp.flush();
    var res = getTasks();
    res.warnings = [];
    return res;
  } finally {
    lock.releaseLock();
  }
}

/**
 * מעדכן משימה קיימת לפי TaskID. patch = אובייקט לפי שמות עמודות (מותר לשלוח הכול).
 * כותב תא-תא רק את מה שבאמת השתנה. תא שנדחה ע"י Data Validation מדווח ב-warnings
 * בלי להפיל את שאר העדכון.
 */
function updateTask(taskId, patch) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = tasksSheet_();
    var headers = headers_(sh);
    var idCol = headers.indexOf('TaskID');
    if (idCol === -1) throw new Error('לא נמצאה עמודת TaskID');
    var lastRow = sh.getLastRow();
    var ids = sh.getRange(HEADER_ROW + 1, idCol + 1, lastRow - HEADER_ROW, 1).getValues();
    var target = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(taskId)) { target = HEADER_ROW + 1 + i; break; }
    }
    if (target === -1) throw new Error('לא נמצאה משימה ' + taskId);

    var current = sh.getRange(target, 1, 1, headers.length).getValues()[0];
    var warnings = [];
    var changed = 0;

    headers.forEach(function (h, c) {
      if (h === 'TaskID') return;
      if (!Object.prototype.hasOwnProperty.call(patch, h)) return;
      var nextVal = patch[h] == null ? '' : patch[h];
      if (String(serialize_(current[c], h)) === String(nextVal)) return; // לא השתנה
      try {
        sh.getRange(target, c + 1).setValue(nextVal);
        changed++;
      } catch (e) {
        warnings.push('שדה "' + h + '": הערך "' + nextVal + '" נדחה ע"י כלל אימות בגיליון (' + (e.message || e) + ')');
      }
    });

    SpreadsheetApp.flush();
    var res = getTasks();
    res.warnings = warnings;
    res.changed = changed;
    return res;
  } finally {
    lock.releaseLock();
  }
}

/**
 * מחזיר את הערכים החוקיים לשדות עם אימות רשימה, ישירות מהטאבים —
 * כדי שהטופס יציג בדיוק מה שהגיליון מקבל (ולא רשימה מקודדת שעלולה להתיישן).
 */
function getLists() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function col(sheetName, header) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return [];
    var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var ci = hs.indexOf(header);
    if (ci === -1) return [];
    return sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getValues()
      .map(function (r) { return String(r[0]).trim(); }).filter(String);
  }
  return {
    Category: col('Categories', 'CategoryName'),
    Assignee: col('People', 'Name'),
    ProjectID: col('Projects', 'ProjectID'),
    RelatedPerson: col('People', 'Name')
  };
}

/* ---------- עזר ---------- */

function tasksSheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TASKS_SHEET);
  if (!sh) throw new Error('לא נמצא טאב בשם "' + TASKS_SHEET + '"');
  return sh;
}

function headers_(sh) {
  return sh.getRange(HEADER_ROW, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function nextTaskId_(sh, headers) {
  var idCol = headers.indexOf('TaskID');
  var lastRow = sh.getLastRow();
  var max = 0;
  if (lastRow > HEADER_ROW) {
    var ids = sh.getRange(HEADER_ROW + 1, idCol + 1, lastRow - HEADER_ROW, 1).getValues();
    ids.forEach(function (r) {
      var m = /^TSK-(\d+)$/.exec(String(r[0]).trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return 'TSK-' + ('00' + (max + 1)).slice(-3);
}

/** ממיר ערכי תא ל-JSON ידידותי: תאריכים ל-yyyy-MM-dd, שעות ל-HH:mm. */
function serialize_(v, header) {
  var isTime = /time/i.test(header) && !/date/i.test(header);
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), isTime ? 'HH:mm' : 'yyyy-MM-dd');
  }
  if (typeof v === 'number' && isTime && v >= 0 && v < 1) {
    var mins = Math.round(v * 24 * 60);
    return ('0' + Math.floor(mins / 60)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2);
  }
  return v;
}
