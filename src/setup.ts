/**
 * デモの初期化（GAS 依存）。空のスプレッドシートで setupDemo を1回実行すると、
 * シート作成 → 架空データ投入 → 入力規則（プルダウン）→ 請求書テンプレート → 月次集計 まで再現する。
 * 既に同名のシートがあれば作り直す（入力したデータは消える）。
 */

const SETUP_MAX_ROWS = 1000;
const HEADER_BG = "#e8eef7";
const AUTO_BG = "#f3f3f3";

function setupDemo(): void {
  const ss = getSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TIME_ZONE);
  ss.setSpreadsheetLocale("ja_JP");

  const S = CONFIG.SHEETS;
  const order: string[] = [S.SALES, S.CUSTOMERS, S.PRODUCTS, S.INVOICE_TEMPLATE, S.SUMMARY];
  // 作り直す前に、消えない作業用シートを1枚置いておく（シートが0枚になるのを防ぐ）
  const temp = ss.insertSheet(`_setup_${Date.now()}`);
  [S.INVOICE as string].concat(order).forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (sheet) ss.deleteSheet(sheet);
  });
  order.forEach((name, i) => ss.insertSheet(name, i));

  const customers = setupCustomerSheet(ss.getSheetByName(S.CUSTOMERS)!);
  const products = setupProductSheet(ss.getSheetByName(S.PRODUCTS)!);
  setupSalesSheet(ss.getSheetByName(S.SALES)!, customers, products);
  setupInvoiceTemplate(ss.getSheetByName(S.INVOICE_TEMPLATE)!);

  ss.deleteSheet(temp);
  // 新規スプレッドシートの「シート1」が空のまま残っていれば消す
  ss.getSheets().forEach((sheet) => {
    if (order.indexOf(sheet.getName()) < 0 && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });

  writeSalesCalc(2, SETUP_MAX_ROWS);
  updateSummarySheet();
  ss.setActiveSheet(ss.getSheetByName(S.SALES)!);
}

function writeHeader(sheet: GoogleAppsScript.Spreadsheet.Sheet, headers: readonly string[]): void {
  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers.slice()])
    .setBackground(HEADER_BG)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

function listRule(values: readonly string[], help: string): GoogleAppsScript.Spreadsheet.DataValidation {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(values.slice(), true)
    .setAllowInvalid(false)
    .setHelpText(help)
    .build();
}

function setupCustomerSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet): GoogleAppsScript.Spreadsheet.Sheet {
  const H = CONFIG.HEADERS.CUSTOMERS;
  const C = CONFIG.CHOICES;
  writeHeader(sheet, H);
  const rows = demoCustomerRows();
  sheet.getRange(2, 1, rows.length, H.length).setValues(rows);
  const n = SETUP_MAX_ROWS - 1;
  sheet.getRange(2, 3, n).setDataValidation(listRule(C.HONORIFIC, "会社宛は「御中」、個人宛は「様」"));
  sheet
    .getRange(2, 7, n)
    .setNumberFormat("0.00")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireNumberBetween(0.01, 2)
        .setAllowInvalid(false)
        .setHelpText("標準単価に掛ける率（例: 0.85 = 85%）")
        .build(),
    );
  sheet.getRange(2, 8, n).setDataValidation(listRule(C.CLOSING_DAY, "締め日"));
  sheet.getRange(2, 9, n).setDataValidation(listRule(C.PAYMENT_MONTH, "締め日から見た支払月"));
  sheet.getRange(2, 10, n).setDataValidation(listRule(C.PAYMENT_DAY, "支払日"));
  sheet.getRange(2, 11, n).setDataValidation(listRule(C.ROUNDING, "掛率をかけた単価・金額の端数処理"));
  sheet.getRange(2, 12, n).setDataValidation(listRule(C.ROUNDING, "消費税の端数処理（請求書ごと・税率ごとに1回）"));
  sheet.setColumnWidths(1, H.length, 90);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(5, 220);
  return sheet;
}

function setupProductSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet): GoogleAppsScript.Spreadsheet.Sheet {
  const H = CONFIG.HEADERS.PRODUCTS;
  writeHeader(sheet, H);
  const rows = demoProductRows();
  sheet.getRange(2, 1, rows.length, H.length).setValues(rows);
  const n = SETUP_MAX_ROWS - 1;
  sheet
    .getRange(2, 4, n)
    .setNumberFormat("#,##0")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireNumberGreaterThanOrEqualTo(0)
        .setAllowInvalid(false)
        .setHelpText("税抜の標準単価（円）")
        .build(),
    );
  sheet.getRange(2, 5, n).setDataValidation(listRule(CONFIG.CHOICES.TAX_CATEGORY, "食品は軽減8%、それ以外は標準10%"));
  sheet.setColumnWidths(1, H.length, 110);
  sheet.setColumnWidth(2, 200);
  return sheet;
}

function setupSalesSheet(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  customers: GoogleAppsScript.Spreadsheet.Sheet,
  products: GoogleAppsScript.Spreadsheet.Sheet,
): void {
  const H = CONFIG.HEADERS.SALES;
  writeHeader(sheet, H);
  const sales = demoSales();
  const rows = sales.map((s) => {
    const { year, month, day } = parseYmd(s.date);
    // スクリプトのタイムゾーン（appsscript.json: Asia/Tokyo）の0時
    const date = new Date(year, month - 1, day);
    return [date, s.slipNo, s.customerName, s.productName, s.quantity, s.specialPrice === null ? "" : s.specialPrice, s.note];
  });
  sheet.getRange(2, 1, rows.length, CONFIG.SALES_INPUT_COLUMNS).setValues(rows);

  const n = SETUP_MAX_ROWS - 1;
  sheet
    .getRange(2, 1, n)
    .setNumberFormat("yyyy/mm/dd")
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText("売上日").build());
  sheet
    .getRange(2, 3, n)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(customers.getRange("B2:B"), true)
        .setAllowInvalid(false)
        .setHelpText("取引先マスタの取引先名から選択")
        .build(),
    );
  sheet
    .getRange(2, 4, n)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(products.getRange("B2:B"), true)
        .setAllowInvalid(false)
        .setHelpText("商品マスタの商品名から選択")
        .build(),
    );
  sheet
    .getRange(2, 5, n)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireNumberNotEqualTo(0)
        .setAllowInvalid(false)
        .setHelpText("数量（返品はマイナス）")
        .build(),
    );
  sheet
    .getRange(2, 6, n)
    .setNumberFormat("#,##0")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireNumberGreaterThanOrEqualTo(0)
        .setAllowInvalid(false)
        .setHelpText("空欄なら 標準単価×掛率。特価のときだけ入力")
        .build(),
    );

  // 自動計算列: 背景をグレーにし、手で書き換えようとしたら警告を出す
  const calc = sheet.getRange(1, CONFIG.SALES_CALC_COLUMN, SETUP_MAX_ROWS, 3);
  sheet.getRange(2, CONFIG.SALES_CALC_COLUMN, n, 3).setBackground(AUTO_BG);
  sheet.getRange(2, CONFIG.SALES_CALC_COLUMN, n, 2).setNumberFormat("#,##0");
  calc.protect().setWarningOnly(true).setDescription("自動計算列（売上を入力すると自動で埋まります）");

  sheet.setColumnWidths(1, H.length, 100);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(7, 160);
}

/** 請求書テンプレート。セル位置は CONFIG.INVOICE_LAYOUT と対応させる */
function setupInvoiceTemplate(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const L = CONFIG.INVOICE_LAYOUT;
  const border = SpreadsheetApp.BorderStyle;
  sheet.setHiddenGridlines(true);
  [70, 70, 230, 60, 45, 80, 95, 50].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  // 使う8列以外は削除して、印刷範囲を固定する
  if (sheet.getMaxColumns() > L.COLUMNS) sheet.deleteColumns(L.COLUMNS + 1, sheet.getMaxColumns() - L.COLUMNS);
  sheet.getRange(1, 1, sheet.getMaxRows(), L.COLUMNS).setFontSize(9).setVerticalAlignment("middle");

  sheet.getRange("A1:H1").merge().setValue("請　求　書").setFontSize(20).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setRowHeight(1, 44);

  // 宛先（左上）
  sheet.getRange("A3:D3").merge().setFontSize(14).setFontWeight("bold").setBorder(null, null, true, null, null, null, "#333333", border.SOLID);
  sheet.getRange("A4:D4").merge();
  sheet.getRange("A5:D5").merge();
  sheet.setRowHeight(3, 30);

  // 請求書番号・請求日（右上）
  sheet.getRange("F3").setValue("請求書番号").setHorizontalAlignment("right");
  sheet.getRange("F4").setValue("請求日").setHorizontalAlignment("right");
  sheet.getRange("G3:H3").merge().setHorizontalAlignment("right");
  sheet.getRange("G4:H4").merge().setHorizontalAlignment("right");

  // 発行元（右）
  sheet.getRange("E6:H6").merge().setFontSize(11).setFontWeight("bold");
  sheet.getRange("E7:H7").merge().setFontSize(8).setWrap(true);
  sheet.getRange("E8:H8").merge().setFontSize(8);
  sheet.getRange("E9:H9").merge().setFontSize(8);
  sheet.setRowHeight(7, 28);

  // ご請求金額など（左）
  sheet.getRange("A7:D7").merge().setValue("下記のとおりご請求申し上げます。");
  const labels: [string, string][] = [
    ["A8", "ご請求金額"],
    ["A9", "対象期間"],
    ["A10", "お支払期限"],
    ["A11", "お振込先"],
  ];
  labels.forEach(([a1, label]) => sheet.getRange(a1).setValue(label).setBackground(HEADER_BG).setFontWeight("bold"));
  sheet
    .getRange("B8:D8")
    .merge()
    .setNumberFormat('"¥"#,##0"-"')
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("left")
    .setBorder(null, null, true, null, null, null, "#333333", border.DOUBLE);
  sheet.setRowHeight(8, 34);
  sheet.getRange("B9:D9").merge();
  sheet.getRange("B10:D10").merge();
  sheet.getRange("B11:H11").merge();

  // 税率別内訳
  const taxHeader = 13;
  sheet.getRange(taxHeader, 1, 1, 3).merge().setValue("税率区分");
  sheet.getRange(taxHeader, 4, 1, 2).merge().setValue("税抜金額");
  sheet.getRange(taxHeader, 6).setValue("消費税");
  sheet.getRange(taxHeader, 7, 1, 2).merge().setValue("税込金額");
  sheet.getRange(taxHeader, 1, 1, 8).setBackground(HEADER_BG).setFontWeight("bold").setHorizontalAlignment("center");
  const taxLabels: [number, string][] = [
    [L.TAX_ROWS[10], "10%対象"],
    [L.TAX_ROWS[8], "8%対象（軽減税率）"],
    [L.TAX_TOTAL_ROW, "合計"],
  ];
  taxLabels.forEach(([row, label]) => {
    sheet.getRange(row, 1, 1, 3).merge().setValue(label);
    sheet.getRange(row, 4, 1, 2).merge();
    sheet.getRange(row, 7, 1, 2).merge();
    sheet.getRange(row, 4, 1, 5).setNumberFormat("#,##0").setHorizontalAlignment("right");
  });
  sheet.getRange(L.TAX_TOTAL_ROW, 1, 1, 8).setFontWeight("bold");
  sheet.getRange(taxHeader, 1, L.TAX_TOTAL_ROW - taxHeader + 1, 8).setBorder(true, true, true, true, true, true, "#999999", border.SOLID);

  sheet.getRange("A17:H17").merge().setValue("※印は軽減税率（8%）対象品目です。").setFontSize(8);

  // 明細
  const head = L.DETAIL_FIRST_ROW - 1;
  sheet
    .getRange(head, 1, 1, 8)
    .setValues([["日付", "伝票No", "品名", "数量", "単位", "単価", "金額", "税率"]])
    .setBackground(HEADER_BG)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  const detail = sheet.getRange(L.DETAIL_FIRST_ROW, 1, L.DETAIL_TEMPLATE_ROWS, 8);
  detail.setBorder(true, true, true, true, true, true, "#999999", border.SOLID);
  sheet.getRange(L.DETAIL_FIRST_ROW, 1, L.DETAIL_TEMPLATE_ROWS, 2).setHorizontalAlignment("center");
  // 数量は小数（量り売り）もあるので表示形式は自動のまま
  sheet.getRange(L.DETAIL_FIRST_ROW, 4, L.DETAIL_TEMPLATE_ROWS, 1).setHorizontalAlignment("right");
  sheet.getRange(L.DETAIL_FIRST_ROW, 5, L.DETAIL_TEMPLATE_ROWS, 1).setHorizontalAlignment("center");
  sheet.getRange(L.DETAIL_FIRST_ROW, 6, L.DETAIL_TEMPLATE_ROWS, 2).setNumberFormat("#,##0").setHorizontalAlignment("right");
  sheet.getRange(L.DETAIL_FIRST_ROW, 8, L.DETAIL_TEMPLATE_ROWS, 1).setHorizontalAlignment("center");
  sheet.getRange(head, 1, L.DETAIL_TEMPLATE_ROWS + 1, 8).setBorder(true, true, true, true, true, true, "#999999", border.SOLID);

  // 余った行を削除して、PDF に空白ページが出ないようにする
  const lastRow = L.DETAIL_FIRST_ROW + L.DETAIL_TEMPLATE_ROWS - 1;
  if (sheet.getMaxRows() > lastRow) sheet.deleteRows(lastRow + 1, sheet.getMaxRows() - lastRow);
}
