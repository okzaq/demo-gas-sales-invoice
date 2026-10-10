/**
 * エントリーポイント: メニュー「請求業務」と、ダイアログから呼ばれるサーバー関数。
 * ここも薄く保ち、計算は invoice.ts / summary.ts、シート操作は sheets.ts / pdf.ts に任せる。
 */

/** 1回の実行で使ってよい時間。GAS の上限（6分）より手前で止めて、残りを知らせる */
const RUN_TIME_BUDGET_MS = 5 * 60 * 1000;

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu("請求業務")
    .addItem("請求書PDFを作成（取引先を指定）…", "showInvoiceDialog")
    .addItem("全取引先分の請求書PDFを一括作成…", "showBatchInvoiceDialog")
    .addSeparator()
    .addItem("月次集計を更新", "updateMonthlySummary")
    .addItem("売上入力の自動計算をやり直す", "refreshAllSalesCalc")
    .addSeparator()
    .addItem("デモデータを初期化", "setupDemoFromMenu")
    .addToUi();
}

/** 売上入力の A〜G 列が編集されたら、その行の自動計算列（適用単価・金額・税率）を更新する */
function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const range = e.range;
  if (range.getSheet().getName() !== CONFIG.SHEETS.SALES) return;
  if (range.getColumn() > CONFIG.SALES_INPUT_COLUMNS || range.getLastRow() < 2) return;
  writeSalesCalc(range.getRow(), range.getNumRows());
}

function showInvoiceDialog(): void {
  openInvoiceDialog("single", "請求書PDFを作成");
}

function showBatchInvoiceDialog(): void {
  openInvoiceDialog("all", "全取引先分の請求書PDFを一括作成");
}

function openInvoiceDialog(mode: "single" | "all", title: string): void {
  const template = HtmlService.createTemplateFromFile("dialog");
  template.mode = mode;
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(480).setHeight(460), title);
}

/** ダイアログの選択肢（請求月・取引先） */
function getDialogData(): { months: { value: string; label: string }[]; defaultMonth: string; customers: { code: string; name: string }[] } {
  const data = loadData();
  const byCustomer = billingMonthsByCustomer(data.lines, data.customers);
  const set: { [m: string]: boolean } = {};
  Object.keys(byCustomer).forEach((code) => byCustomer[code].forEach((m) => (set[m] = true)));
  const months = Object.keys(set).sort().reverse();
  return {
    months: months.map((m) => ({ value: m, label: `${formatJpMonth(m)}分` })),
    defaultMonth: defaultBillingMonth(months, todayYmd()),
    customers: data.customers.map((c) => ({ code: c.code, name: c.name })),
  };
}

interface CreateInvoicesResult {
  monthLabel: string;
  folderUrl: string;
  created: { name: string; total: number; fileName: string; url: string }[];
  skipped: string[];
  notDone: string[];
}

/**
 * 請求書 PDF を作る。customerCode が "ALL" なら全取引先分。
 * 入力エラーが1件でもあれば作らない（エラーの行が請求から漏れるのを防ぐため）。
 */
function createInvoices(month: string, customerCode: string): CreateInvoicesResult {
  parseYm(month);
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30 * 1000)) throw new Error("別の請求書作成が実行中です。しばらくしてからやり直してください。");
  try {
    const started = Date.now();
    const data = loadData();
    if (data.errors.length > 0) {
      const head = data.errors.slice(0, 10).join("\n");
      const more = data.errors.length > 10 ? `\n…ほか ${data.errors.length - 10} 件` : "";
      throw new Error(`入力エラーがあるため請求書を作成しませんでした。修正してからやり直してください。\n${head}${more}`);
    }
    const targets = customerCode === "ALL" ? data.customers : data.customers.filter((c) => c.code === customerCode);
    if (targets.length === 0) throw new Error(`取引先コード「${customerCode}」が取引先マスタにありません`);

    const { invoices, skipped } = buildInvoicesForMonth(targets, month, data.lines);
    const result: CreateInvoicesResult = {
      monthLabel: `${formatJpMonth(month)}分`,
      folderUrl: "",
      created: [],
      skipped: skipped.map((c) => c.name),
      notDone: [],
    };
    if (invoices.length === 0) return result;

    const folder = getOutputFolder(month);
    result.folderUrl = folder.getUrl();
    invoices.forEach((invoice, i) => {
      if (Date.now() - started > RUN_TIME_BUDGET_MS) {
        result.notDone.push(invoice.customer.name);
        return;
      }
      if (i > 0) Utilities.sleep(CONFIG.EXPORT_INTERVAL_MS);
      const sheet = renderInvoiceSheet(invoiceToSheetModel(invoice, COMPANY));
      const file = savePdf(folder, exportSheetAsPdf(sheet, invoiceFileName(invoice)));
      result.created.push({ name: invoice.customer.name, total: invoice.total, fileName: file.getName(), url: file.getUrl() });
    });
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * エディタから実行する用: 直近の請求月で全取引先分の請求書 PDF を作り、月次集計も更新して結果をログに出す。
 * 複数の Google アカウントでログインしたブラウザでは、ダイアログ（google.script.run）が応答しないことがあるため、
 * その場合はエディタでこの関数を実行する。
 */
function createAllInvoicesFromEditor(): void {
  const month = getDialogData().defaultMonth;
  const r = createInvoices(month, "ALL");
  updateSummarySheet();
  console.log(`${r.monthLabel}: 作成 ${r.created.length}件 / 売上なし ${r.skipped.length}件 / 時間切れで未作成 ${r.notDone.length}件`);
  r.created.forEach((c) => console.log(`作成: ${c.name} ${c.total.toLocaleString()}円 ${c.fileName}`));
  if (r.skipped.length > 0) console.log(`売上なし: ${r.skipped.join("、")}`);
  if (r.notDone.length > 0) console.log(`未作成（もう一度実行すると続きを作る）: ${r.notDone.join("、")}`);
  if (r.folderUrl) console.log(`保存先: ${r.folderUrl}`);
}

function updateSummarySheet(): void {
  const data = loadData();
  const pivots = buildMonthlySummary(data.lines, data.customers, data.products);
  writeSummarySheet(pivots, ["税率区分", "取引先", "取引先", "商品"], data.errors);
}

function updateMonthlySummary(): void {
  updateSummarySheet();
  const ss = getSpreadsheet();
  ss.setActiveSheet(getSheetOrThrow(CONFIG.SHEETS.SUMMARY));
  ss.toast("月次集計を更新しました", "請求業務");
}

function refreshAllSalesCalc(): void {
  const sheet = getSheetOrThrow(CONFIG.SHEETS.SALES);
  writeSalesCalc(2, Math.max(sheet.getLastRow() - 1, 0));
  getSpreadsheet().toast("売上入力の自動計算を更新しました", "請求業務");
}

function setupDemoFromMenu(): void {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    "デモデータを初期化",
    "取引先マスタ・商品マスタ・売上入力・請求書テンプレート・月次集計を作り直します。\n入力したデータは消えます。よろしいですか？",
    ui.ButtonSet.YES_NO,
  );
  if (answer !== ui.Button.YES) return;
  setupDemo();
  ui.alert("初期化しました。メニュー「請求業務」から請求書を作成できます。");
}
