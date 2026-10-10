/**
 * 単価・金額・消費税・請求書の計算（純粋関数）。
 *
 * 計算の順番:
 *   1. 単価 = 標準単価 × 掛率 → 取引先の「単価端数」で円に丸める（特価単価があればそれを使う）
 *   2. 金額 = 単価 × 数量 → 同じく「単価端数」で円に丸める（数量が小数のとき）
 *   3. 消費税 = 税率ごとの税抜合計 × 税率 → 「消費税端数」で1回だけ丸める
 *      （インボイス制度: 端数処理は1枚の請求書につき税率ごとに1回。明細ごとに丸めて合計しない）
 */

/** 単価・金額を確定させる。数量は小数3桁、掛率は小数4桁、標準単価は小数2桁まで */
function priceLine(sale: SaleRow, customer: Customer, product: Product): PricedLine {
  const mode = customer.priceRounding;
  const unitPrice =
    sale.specialPrice !== null
      ? roundYen(sale.specialPrice, mode)
      : roundRatio(toScaledInt(product.price, 2) * toScaledInt(customer.rate, 4), 100 * 10000, mode);
  const amount = roundRatio(unitPrice * toScaledInt(sale.quantity, 3), 1000, mode);
  return {
    rowNumber: sale.rowNumber,
    date: sale.date,
    slipNo: sale.slipNo,
    customerCode: customer.code,
    customerName: customer.name,
    productCode: product.code,
    productName: product.name,
    unit: product.unit,
    quantity: sale.quantity,
    unitPrice,
    amount,
    taxRate: product.taxRate,
    reduced: product.reduced,
    note: sale.note,
  };
}

/** 売上行をまとめて単価確定する。マスタにない取引先・商品は行番号付きのエラーにする */
function priceSales(sales: SaleRow[], customers: Customer[], products: Product[]): ParseResult<PricedLine> {
  const customerByName: { [name: string]: Customer } = {};
  customers.forEach((c) => (customerByName[c.name] = c));
  const productByName: { [name: string]: Product } = {};
  products.forEach((p) => (productByName[p.name] = p));

  const items: PricedLine[] = [];
  const errors: string[] = [];
  sales.forEach((sale) => {
    const customer = customerByName[sale.customerName];
    const product = productByName[sale.productName];
    if (!customer) {
      errors.push(`売上入力 ${sale.rowNumber}行目: 取引先「${sale.customerName}」が取引先マスタにありません`);
      return;
    }
    if (!product) {
      errors.push(`売上入力 ${sale.rowNumber}行目: 商品「${sale.productName}」が商品マスタにありません`);
      return;
    }
    try {
      items.push(priceLine(sale, customer, product));
    } catch (e) {
      errors.push(`売上入力 ${sale.rowNumber}行目: ${(e as Error).message}`);
    }
  });
  return { items, errors };
}

/**
 * 税率ごとの内訳。10% と 8% は明細がなくても 0 円の行として必ず含める
 * （請求書の様式を毎回同じにするため）。税率の高い順。
 */
function calcTaxBreakdown(lines: PricedLine[], taxRounding: RoundingMode): TaxBreakdown[] {
  const bases: { [rate: number]: number } = { 10: 0, 8: 0 };
  lines.forEach((line) => {
    bases[line.taxRate] = (bases[line.taxRate] || 0) + line.amount;
  });
  return Object.keys(bases)
    .map(Number)
    .sort((a, b) => b - a)
    .map((rate) => {
      const base = bases[rate];
      const tax = roundRatio(base * rate, 100, taxRounding);
      return { taxRate: rate, reduced: rate === 8, base, tax, gross: base + tax };
    });
}

function compareLines(a: PricedLine, b: PricedLine): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.slipNo !== b.slipNo) return a.slipNo < b.slipNo ? -1 : 1;
  return a.rowNumber - b.rowNumber;
}

/** 請求書番号: 請求月 + 取引先コード（例: 202609-C001）。同じ月・取引先なら再発行しても同じ番号 */
function invoiceNumber(month: string, customerCode: string): string {
  return `${month.replace("-", "")}-${customerCode}`;
}

/**
 * 1取引先・1か月分の請求書を作る。
 * allLines は全取引先・全期間の明細でよい（ここで取引先と対象期間で絞り込む）。
 * 対象の明細が0件でも請求書（金額0）を返す。発行するかどうかは呼び出し側が lines.length で決める。
 */
function buildInvoice(customer: Customer, month: string, allLines: PricedLine[]): Invoice {
  const period = billingPeriod(month, customer.closingDay);
  const lines = allLines
    .filter((l) => l.customerCode === customer.code && isInPeriod(l.date, period))
    .sort(compareLines);
  const taxes = calcTaxBreakdown(lines, customer.taxRounding);
  const subtotal = taxes.reduce((s, t) => s + t.base, 0);
  const taxTotal = taxes.reduce((s, t) => s + t.tax, 0);
  return {
    invoiceNo: invoiceNumber(month, customer.code),
    customer,
    period,
    issueDate: period.end,
    dueDate: paymentDueDate(period.end, customer.paymentMonthOffset, customer.paymentDay),
    lines,
    taxes,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
  };
}

/** 指定月の全取引先分。明細0件の取引先は skipped に入れる */
function buildInvoicesForMonth(
  customers: Customer[],
  month: string,
  allLines: PricedLine[],
): { invoices: Invoice[]; skipped: Customer[] } {
  const invoices: Invoice[] = [];
  const skipped: Customer[] = [];
  customers.forEach((c) => {
    const invoice = buildInvoice(c, month, allLines);
    if (invoice.lines.length > 0) invoices.push(invoice);
    else skipped.push(c);
  });
  return { invoices, skipped };
}

/**
 * 売上入力シートの自動計算列（適用単価, 金額, 税率）を1行分求める。
 * 空行は空欄、入力ミスは「要確認」と理由（セルのメモに出す）を返す。
 */
function calcSalesRowCells(
  row: unknown[],
  rowNumber: number,
  customers: Customer[],
  products: Product[],
  formatDate: DateFormatter,
): { cells: (string | number)[]; error: string } {
  const parsed = parseSalesRows([row], formatDate, rowNumber);
  if (parsed.items.length === 0 && parsed.errors.length === 0) return { cells: ["", "", ""], error: "" };
  const priced = priceSales(parsed.items, customers, products);
  const errors = parsed.errors.concat(priced.errors);
  if (errors.length > 0) {
    const reason = errors[0].replace(/^.*?\d+行目: /, "");
    return { cells: ["", "", "要確認"], error: reason };
  }
  const line = priced.items[0];
  return { cells: [line.unitPrice, line.amount, `${line.taxRate}%`], error: "" };
}

if (typeof module !== "undefined") {
  module.exports = {
    calcSalesRowCells,
    priceLine,
    priceSales,
    calcTaxBreakdown,
    invoiceNumber,
    buildInvoice,
    buildInvoicesForMonth,
  };
}
