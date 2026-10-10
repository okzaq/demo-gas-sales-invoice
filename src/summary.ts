/**
 * 月次集計（純粋関数）。
 *
 * 売上日基準（その月に売った金額）と請求月基準（締め日で区切った請求額）の2つの見方を出す。
 * 20日締めの取引先があると両者は一致しないため、どちらの数字かを表題に明記している。
 */

interface PivotRecord {
  row: string;
  col: string;
  value: number;
}

/**
 * 行×列の集計表を作る。
 * rowOrder に並べた行は値が0でも表示し（マスタ順）、それ以外の行は後ろに名前順で足す。
 * 列（月）は昇順。colKeys を渡せばその列だけを、その順で使う。
 */
function buildPivot(title: string, records: PivotRecord[], rowOrder: string[] = [], colKeys?: string[]): Pivot {
  const cols = colKeys ? colKeys.slice() : uniqueSorted(records.map((r) => r.col));
  const extraRows = uniqueSorted(records.map((r) => r.row).filter((r) => rowOrder.indexOf(r) < 0));
  const rows = rowOrder.concat(extraRows);

  const values = rows.map(() => cols.map(() => 0));
  records.forEach((r) => {
    const i = rows.indexOf(r.row);
    const j = cols.indexOf(r.col);
    if (i >= 0 && j >= 0) values[i][j] += r.value;
  });
  const rowTotals = values.map((v) => v.reduce((s, x) => s + x, 0));
  const colTotals = cols.map((_, j) => values.reduce((s, v) => s + v[j], 0));
  const grandTotal = rowTotals.reduce((s, x) => s + x, 0);
  return { title, rowKeys: rows, colKeys: cols, values, rowTotals, colTotals, grandTotal };
}

function uniqueSorted(keys: string[]): string[] {
  const seen: { [k: string]: boolean } = {};
  const out: string[] = [];
  keys.forEach((k) => {
    if (!seen[k]) {
      seen[k] = true;
      out.push(k);
    }
  });
  return out.sort();
}

function taxCategoryLabel(taxRate: number, reduced: boolean): string {
  return reduced ? `${taxRate}%対象（軽減）` : `${taxRate}%対象`;
}

/** 明細から、請求書が発生しうる (取引先, 請求月) を求める */
function billingMonthsByCustomer(lines: PricedLine[], customers: Customer[]): { [code: string]: string[] } {
  const result: { [code: string]: string[] } = {};
  customers.forEach((c) => {
    const months = lines
      .filter((l) => l.customerCode === c.code)
      .map((l) => billingMonthOf(l.date, c.closingDay));
    result[c.code] = uniqueSorted(months);
  });
  return result;
}

/** 月次集計シートに出す4つの表 */
function buildMonthlySummary(lines: PricedLine[], customers: Customer[], products: Product[]): Pivot[] {
  const salesMonth = (l: PricedLine) => l.date.slice(0, 7);

  const byRate = buildPivot(
    "月別 売上合計（税抜・売上日基準）",
    lines.map((l) => ({ row: taxCategoryLabel(l.taxRate, l.reduced), col: salesMonth(l), value: l.amount })),
    [taxCategoryLabel(10, false), taxCategoryLabel(8, true)],
  );

  const byCustomer = buildPivot(
    "取引先別 売上（税抜・売上日基準）",
    lines.map((l) => ({ row: l.customerName, col: salesMonth(l), value: l.amount })),
    customers.map((c) => c.name),
  );

  const months = billingMonthsByCustomer(lines, customers);
  const invoiceRecords: PivotRecord[] = [];
  customers.forEach((c) => {
    months[c.code].forEach((month) => {
      const invoice = buildInvoice(c, month, lines);
      invoiceRecords.push({ row: c.name, col: month, value: invoice.total });
    });
  });
  const byInvoice = buildPivot(
    "取引先別 請求額（税込・請求月基準）",
    invoiceRecords,
    customers.map((c) => c.name),
  );

  const byProduct = buildPivot(
    "商品別 売上（税抜・売上日基準）",
    lines.map((l) => ({ row: l.productName, col: salesMonth(l), value: l.amount })),
    products.map((p) => p.name),
  );

  return [byRate, byCustomer, byInvoice, byProduct];
}

/** Pivot を、シートにそのまま書ける2次元配列にする（見出し行・合計列・合計行つき） */
function pivotToRows(pivot: Pivot, rowHeader: string): (string | number)[][] {
  const header: (string | number)[] = [rowHeader].concat(pivot.colKeys.map(formatJpMonth), ["合計"]);
  const body = pivot.rowKeys.map((key, i) => ([key] as (string | number)[]).concat(pivot.values[i], [pivot.rowTotals[i]]));
  const total = (["合計"] as (string | number)[]).concat(pivot.colTotals, [pivot.grandTotal]);
  return [header].concat(body, [total]);
}

if (typeof module !== "undefined") {
  module.exports = {
    buildPivot,
    taxCategoryLabel,
    billingMonthsByCustomer,
    buildMonthlySummary,
    pivotToRows,
  };
}
