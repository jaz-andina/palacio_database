/**
 * Palacio Finance – guarda los receipts en tu Google Drive.
 *
 * Estructura que crea automáticamente:
 *   "0.1 Utilities + Monthly fees" / <año> / <mes> / <archivo>
 *
 * ── CÓMO INSTALARLO (una sola vez) ───────────────────────────────────────────
 * 1. Entrá a https://script.google.com con tu cuenta jazlevis@gmail.com
 * 2. Nuevo proyecto → borrá todo y pegá ESTE archivo completo.
 * 3. Cambiá UPLOAD_SECRET por una contraseña inventada (la misma que pondrás
 *    en .env.local como DRIVE_UPLOAD_SECRET).
 * 4. Implementar → Nueva implementación → Tipo: "Aplicación web".
 *      - Ejecutar como:        Yo (jazlevis@gmail.com)
 *      - Quién tiene acceso:   Cualquier usuario
 * 5. Autorizá los permisos cuando te los pida.
 * 6. Copiá la "URL de la aplicación web" y pegala en .env.local como
 *    DRIVE_APPS_SCRIPT_URL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Debe coincidir EXACTAMENTE con DRIVE_UPLOAD_SECRET en .env.local
var UPLOAD_SECRET = 'palacio-7f3a9c21b8e4';
var ROOT_FOLDER_NAME = '0.1 Utilities + Monthly fees';

// Google Sheet donde se escriben los totales (BALANCE VILELA + PORTUGAL).
var TARGET_SPREADSHEET_ID = '1caaZ9VTvgB9YvgGC7IT0olm8Q9eaFQPXSy1KPsiRPaE';
var TARGET_SHEET_GID = 1250346669;
// Fila (1-based) donde se escribe el total mensual de agua, en la columna del mes.
var AGUA_ROW = 42;
// Filas del Sheet ↔ valores que manda la app (texto normalizado: minúsculas, sin acentos).
var TOTAL_ROWS = {
  utilities: 'gastos utilities',
  mantenimiento: 'gastos mantenimiento',
  adminImpuestos: 'gastos admin + impuestos',
  realesTotales: 'gastos reales totales'
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.secret !== UPLOAD_SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }

    // Acciones: escribir totales, inspeccionar una fila, o (por defecto) guardar receipt.
    if (body.action === 'syncTotals') {
      return json(syncTotals(body));
    }
    if (body.action === 'inspectRow') {
      return json(inspectRow(body.row || AGUA_ROW));
    }

    var root = getOrCreateRoot(ROOT_FOLDER_NAME);
    var yearFolder = getOrCreateChild(root, String(body.year));
    var monthFolder = getOrCreateChild(yearFolder, String(body.month));

    var bytes = Utilities.base64Decode(body.dataBase64);
    var blob = Utilities.newBlob(
      bytes,
      body.mimeType || 'application/octet-stream',
      body.filename || 'receipt'
    );
    var file = monthFolder.createFile(blob);

    return json({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Escribe los 4 totales del mes en la columna correspondiente del Sheet.
function syncTotals(body) {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var sheet = getSheetByGid(ss, TARGET_SHEET_GID);
  if (!sheet) return { ok: false, error: 'No se encontró la pestaña (gid ' + TARGET_SHEET_GID + ').' };

  var values = sheet.getDataRange().getValues();

  // Fila de cada total
  var rowOf = {};
  for (var key in TOTAL_ROWS) {
    rowOf[key] = findLabelRow(values, TOTAL_ROWS[key]);
    if (rowOf[key] < 0) return { ok: false, error: 'No se encontró la fila "' + TOTAL_ROWS[key] + '".' };
  }

  // Columna del mes: buscamos el encabezado más cercano por encima del bloque de totales.
  var topRow = Math.min(rowOf.utilities, rowOf.mantenimiento, rowOf.adminImpuestos, rowOf.realesTotales);
  var monthCol = findMonthColumnAbove(values, topRow, body.month);
  if (monthCol < 0) return { ok: false, error: 'No se encontró la columna del mes "' + body.month + '".' };

  var written = {};
  for (var k in TOTAL_ROWS) {
    var val = Number(body[k]);
    sheet.getRange(rowOf[k] + 1, monthCol + 1).setValue(val);
    written[k] = val;
  }

  // Agua → fila fija AGUA_ROW, misma columna del mes. Solo si viene un número.
  // Devolvemos el valor de Mayo (col F = 6) de esa fila como chequeo de seguridad.
  var aguaRowMayo = sheet.getRange(AGUA_ROW, 6).getValue();
  if (body.agua !== undefined && body.agua !== null && body.agua !== '' && !isNaN(Number(body.agua))) {
    sheet.getRange(AGUA_ROW, monthCol + 1).setValue(Number(body.agua));
    written.agua = Number(body.agua);
  }

  return {
    ok: true,
    month: body.month,
    column_1based: monthCol + 1,
    rows_1based: { utilities: rowOf.utilities + 1, mantenimiento: rowOf.mantenimiento + 1,
                   adminImpuestos: rowOf.adminImpuestos + 1, realesTotales: rowOf.realesTotales + 1,
                   agua: AGUA_ROW },
    agua_row_mayo_actual: aguaRowMayo,
    written: written
  };
}

// Devuelve el contenido de una fila (1-based) en TODAS las pestañas, para verificar
// dónde está realmente el dato (ej. la fila del agua). Solo lectura.
function inspectRow(rowNum) {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var out = [];
  ss.getSheets().forEach(function (sh) {
    var lastCol = sh.getLastColumn();
    var vals = (rowNum <= sh.getLastRow() && lastCol > 0)
      ? sh.getRange(rowNum, 1, 1, lastCol).getValues()[0]
      : [];
    out.push({ gid: sh.getSheetId(), name: sh.getName(), row: rowNum, values: vals });
  });
  return { ok: true, inspect: out };
}

function normalizeText(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca acentos
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca la fila cuya etiqueta (en las primeras columnas) coincide exactamente.
function findLabelRow(values, label) {
  var target = normalizeText(label);
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (normalizeText(values[r][c]) === target) return r;
    }
  }
  return -1;
}

// Desde fromRow hacia arriba, busca la primera celda igual al nombre del mes.
function findMonthColumnAbove(values, fromRow, month) {
  var target = normalizeText(month);
  for (var r = fromRow - 1; r >= 0; r--) {
    for (var c = 0; c < values[r].length; c++) {
      if (normalizeText(values[r][c]) === target) return c;
    }
  }
  return -1;
}

function getSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

// Busca la carpeta raíz por nombre en todo el Drive; si no existe, la crea en My Drive.
function getOrCreateRoot(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.getRootFolder().createFolder(name);
}

function getOrCreateChild(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Ejecutá esta función UNA vez desde el editor (elegila arriba y tocá ▷ Ejecutar).
// Sirve para: (1) que Google te pida autorizar el permiso de Google Sheets, y
// (2) verificar que tu cuenta pueda abrir la planilla. Mirá el resultado en
// "Registro de ejecución". Si dice un error de permiso, tu cuenta no es editora
// de la planilla y hay que pedir que te compartan como Editor.
function authorizeAndTest() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var sheet = getSheetByGid(ss, TARGET_SHEET_GID);
  Logger.log('Planilla: ' + ss.getName());
  Logger.log('Pestaña (gid ' + TARGET_SHEET_GID + '): ' + (sheet ? sheet.getName() : '¡NO ENCONTRADA!'));
}
