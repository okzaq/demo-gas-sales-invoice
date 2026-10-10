/**
 * シートの読み書き（GAS 依存の薄い層）。
 * 判断・計算はしない。読んだ値は master.ts / invoice.ts の純粋関数に渡し、結果をそのまま書く。
 */

function getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetOrThrow(name: string): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`シート「${name}」が見つかりません。メニュー「請求業務 > デモデータを初期化」を実行してください。`);
  return sheet;
}

function formatDateCell(d: Date): string {
  return Utilities.formatDate(d, CONFIG.TIME_ZONE, "yyyy-MM-dd");
}

function todayYmd(): string {
  return formatDateCell(new Date());
}

/** 見出し行を除いたデータ行（numColumns 列ぶん）。データがなければ空配列 */
function readDataRows(sheet: GoogleAppsScript.Spreadsheet.Sheet, numColumns: number): unknown[][] {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, numColumns).getValues();
}

interface LoadedData {
  customers: Customer[];
  products: Product[];
  lines: PricedLine[];
  errors: string[];
}

/** マスタと売上を読み、単価・金額まで確定させる */
function loadData(): LoadedData {
  const customers = parseCustomerRows(
    readDataRows(getSheetOrThrow(CONFIG.SHEETS.CUSTOMERS), CONFIG.HEADERS.CUSTOMERS.length),
  );
  const products = parseProductRows(
    readDataRows(getSheetOrThrow(CONFIG.SHEETS.PRODUCTS), CONFIG.HEADERS.PRODUCTS.length),
  );
  const sales = parseSalesRows(
    readDataRows(getSheetOrThrow(CONFIG.SHEETS.SALES), CONFIG.SALES_INPUT_COLUMNS),
    formatDateCell,
  );
  const priced = priceSales(sales.items, customers.items, products.items);
  return {
    customers: customers.items,
    products: products.items,
    lines: priced.items,
    errors: customers.errors.concat(products.errors, sales.errors, priced.errors),
  };
}

/** 売上入力の自動計算列（H〜J）を、指定した行範囲について書き直す */
function writeSalesCalc(startRow: number, numRows: number): void {
  const sheet = getSheetOrThrow(CONFIG.SHEETS.SALES);
  const first = Math.max(2, startRow);
  const last = Math.min(sheet.getLastRow(), startRow + numRows - 1);
  if (last < first) return;
  const customers = parseCustomerRows(
    readDataRows(getSheetOrThrow(CONFIG.SHEETS.CUSTOMERS), CONFIG.HEADERS.CUSTOMERS.length),
  ).items;
  const products = parseProductRows(
    readDataRows(getSheetOrThrow(CONFIG.SHEETS.PRODUCTS), CONFIG.HEADERS.PRODUCTS.length),
  ).items;
  const rows = sheet.getRange(first, 1, last - first + 1, CONFIG.SALES_INPUT_COLUMNS).getValues();
  const results = rows.map((row, i) => calcSalesRowCells(row, first + i, customers, products, formatDateCell));
  const target = sheet.getRange(first, CONFIG.SALES_CALC_COLUMN, rows.length, 3);
  target.setValues(results.map((r) => r.cells));
  target.setNotes(results.map((r) => ["", "", r.error]));
}

/** 請求書テンプレートをコピーして「請求書」シートを作り直し、値を書き込む */
function renderInvoiceSheet(model: InvoiceSheetModel): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = getSpreadsheet();
  const L = CONFIG.INVOICE_LAYOUT;
  const template = getSheetOrThrow(CONFIG.SHEETS.INVOICE_TEMPLATE);
  const old = ss.getSheetByName(CONFIG.SHEETS.INVOICE);
  if (old) ss.deleteSheet(old);
  const sheet = template.copyTo(ss).setName(CONFIG.SHEETS.INVOICE);
  sheet.showSheet();

  Object.keys(model.cells).forEach((a1) => sheet.getRange(a1).setValue(model.cells[a1]));
  model.taxRows.forEach(([row, base, tax, gross]) => {
    sheet.getRange(row, L.TAX_COL_BASE).setValue(base);
    sheet.getRange(row, L.TAX_COL_TAX).setValue(tax);
    sheet.getRange(row, L.TAX_COL_GROSS).setValue(gross);
  });

  const count = model.details.length;
  if (count > L.DETAIL_TEMPLATE_ROWS) {
    const lastTemplateRow = L.DETAIL_FIRST_ROW + L.DETAIL_TEMPLATE_ROWS - 1;
    const extra = count - L.DETAIL_TEMPLATE_ROWS;
    sheet.insertRowsAfter(lastTemplateRow, extra);
    sheet
      .getRange(L.DETAIL_FIRST_ROW, 1, 1, L.COLUMNS)
      .copyFormatToRange(sheet, 1, L.COLUMNS, lastTemplateRow + 1, lastTemplateRow + extra);
  }
  if (count > 0) {
    sheet.getRange(L.DETAIL_FIRST_ROW, 1, count, L.COLUMNS).setValues(model.details);
  }
  return sheet;
}

/** 月次集計シートを書き直す */
function writeSummarySheet(pivots: Pivot[], rowHeaders: string[], errors: string[]): void {
  const sheet = getSheetOrThrow(CONFIG.SHEETS.SUMMARY);
  sheet.clear();
  sheet.getRange(1, 1).setValue("月次集計").setFontSize(14).setFontWeight("bold");
  sheet
    .getRange(2, 1)
    .setValue(`最終更新: ${Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy/MM/dd HH:mm")}（メニュー「請求業務 > 月次集計を更新」で更新）`)
    .setFontColor("#666666");

  let row = 4;
  if (errors.length > 0) {
    sheet
      .getRange(row, 1)
      .setValue(`入力エラーが ${errors.length} 件あり、その行は集計に含まれていません（最初の1件: ${errors[0]}）`)
      .setFontColor("#c62828");
    row += 2;
  }

  let maxCols = 1;
  pivots.forEach((pivot, k) => {
    const values = pivotToRows(pivot, rowHeaders[k]);
    const width = values[0].length;
    maxCols = Math.max(maxCols, width);
    sheet.getRange(row, 1).setValue(pivot.title).setFontWeight("bold");
    row += 1;
    const range = sheet.getRange(row, 1, values.length, width);
    range.setValues(values).setBorder(true, true, true, true, true, true, "#bbbbbb", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(row, 1, 1, width).setBackground("#e8eef7").setFontWeight("bold").setHorizontalAlignment("center");
    sheet.getRange(row + values.length - 1, 1, 1, width).setBackground("#f3f3f3").setFontWeight("bold");
    sheet.getRange(row + 1, 2, values.length - 1, width - 1).setNumberFormat("#,##0");
    row += values.length + 2;
  });
  sheet.setColumnWidth(1, 220);
  if (maxCols > 1) sheet.setColumnWidths(2, maxCols - 1, 110);
}
