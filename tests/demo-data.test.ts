/**
 * setupDemo で投入する架空データが、そのまま計算・請求書作成に通ることを確かめる。
 * README に載せている請求書の見本もここで値を固定している（README と実際の出力がずれないように）。
 */
function loadDemo() {
  const customers = parseCustomerRows(demoCustomerRows());
  const products = parseProductRows(demoProductRows());
  const sales: SaleRow[] = demoSales().map((s, i) => ({ ...s, rowNumber: i + 2 }));
  const priced = priceSales(sales, customers.items, products.items);
  return { customers, products, sales, priced };
}

describe("デモデータ", () => {
  const { customers, products, sales, priced } = loadDemo();

  test("マスタも売上もエラーなく読める", () => {
    expect(customers.errors).toEqual([]);
    expect(products.errors).toEqual([]);
    expect(priced.errors).toEqual([]);
    expect(customers.items).toHaveLength(5);
    expect(products.items).toHaveLength(13);
    expect(priced.items).toHaveLength(sales.length);
  });

  test("乱数の種が固定なので、何度作っても同じデータ", () => {
    expect(demoSales()).toEqual(demoSales());
  });

  test("期間は 2026-07-01〜2026-09-30、乱数で作る売上は日曜日にない", () => {
    const dates = sales.map((s) => s.date);
    expect(dates.every((d) => d >= DEMO_FROM && d <= DEMO_TO)).toBe(true);
    // 備考付きの行は固定で足した「見どころ」の行（締め日当日の 9/20 は日曜）
    const generated = sales.filter((s) => s.note === "").map((s) => s.date);
    const sundays = generated.filter((d) => {
      const { year, month, day } = parseYmd(d);
      return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
    });
    expect(sundays).toEqual([]);
    expect(sales.length).toBeGreaterThan(100);
    expect(sales.length).toBeLessThan(400);
  });

  test("8月分の一括作成では、注文のない「見本 花子」様がスキップされる", () => {
    const { invoices, skipped } = buildInvoicesForMonth(customers.items, "2026-08", priced.items);
    expect(skipped.map((c) => c.name)).toEqual(["見本 花子"]);
    expect(invoices).toHaveLength(4);
  });

  test("20日締めの取引先: 9/20 の売上は9月分、9/21 は10月分", () => {
    const bakery = customers.items.find((c) => c.code === "C002")!;
    const sep = buildInvoice(bakery, "2026-09", priced.items);
    const oct = buildInvoice(bakery, "2026-10", priced.items);
    expect(sep.lines.some((l) => l.note === "締め日当日→9月分")).toBe(true);
    expect(oct.lines.some((l) => l.note === "締め日翌日→10月分")).toBe(true);
    expect(sep.lines.some((l) => l.note === "返品" && l.amount < 0)).toBe(true);
  });

  test("README の請求書見本（レストラン架空亭・2026年9月分）", () => {
    const restaurant = customers.items.find((c) => c.code === "C003")!;
    const invoice = buildInvoice(restaurant, "2026-09", priced.items);
    const model = invoiceToSheetModel(invoice, COMPANY);
    // README の見本と同じ値であること（README を書き換えたらここも直す）
    expect(invoice.invoiceNo).toBe("202609-C003");
    expect(invoice.lines).toHaveLength(22);
    expect(model.taxRows).toEqual([
      [14, 11070, 1107, 12177], // 10%対象: 11,070円 × 10% = 1,107円
      [15, 48692, 3895, 52587], // 8%対象: 48,692円 × 8% = 3,895.36円 → 四捨五入で 3,895円
      [16, 59762, 5002, 64764],
    ]);
    expect(invoice.total).toBe(64764);
    expect(invoice.dueDate).toBe("2026-10-25");
    expect(invoice.lines.find((l) => l.note === "特価")).toMatchObject({ unitPrice: 1400, amount: 8400 });
    expect(invoice.lines.find((l) => l.note === "量り売り")).toMatchObject({ quantity: 2.5, unitPrice: 629, amount: 1573 });
  });
});
