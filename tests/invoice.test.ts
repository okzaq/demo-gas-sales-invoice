import { makeCustomer, makeLine, makeProduct, makeSale, utcFormatter } from "./helpers";

describe("priceLine（掛率・端数処理）", () => {
  test("標準単価 × 掛率 × 数量", () => {
    const line = priceLine(makeSale({ quantity: 3 }), makeCustomer({ rate: 0.85 }), makeProduct({ price: 980 }));
    expect(line.unitPrice).toBe(833);
    expect(line.amount).toBe(2499);
  });

  test.each([
    ["floor", 253],
    ["round", 253],
    ["ceil", 254],
  ] as [RoundingMode, number][])("298円 × 0.85 = 253.3 を %s → %i円", (mode, expected) => {
    const line = priceLine(makeSale(), makeCustomer({ rate: 0.85, priceRounding: mode }), makeProduct({ price: 298 }));
    expect(line.unitPrice).toBe(expected);
  });

  test.each([
    ["floor", 3697],
    ["round", 3698],
    ["ceil", 3698],
  ] as [RoundingMode, number][])("ちょうど .5（4350円 × 0.85 = 3697.5）を %s → %i円", (mode, expected) => {
    const line = priceLine(makeSale(), makeCustomer({ rate: 0.85, priceRounding: mode }), makeProduct({ price: 4350 }));
    expect(line.unitPrice).toBe(expected);
  });

  test("浮動小数点の誤差で1円ずれない（100 × 0.29 は Math.floor だと 28 になる）", () => {
    expect(Math.floor(100 * 0.29)).toBe(28); // 素朴な計算だとずれることの確認
    const line = priceLine(makeSale(), makeCustomer({ rate: 0.29, priceRounding: "floor" }), makeProduct({ price: 100 }));
    expect(line.unitPrice).toBe(29);
  });

  test("小数の数量（量り売り）は金額も端数処理する", () => {
    const sale = makeSale({ quantity: 2.5 });
    const ceil = priceLine(sale, makeCustomer({ rate: 0.9, priceRounding: "ceil" }), makeProduct({ price: 698 }));
    expect(ceil.unitPrice).toBe(629); // 628.2 → 629
    expect(ceil.amount).toBe(1573); // 1572.5 → 1573
    const round = priceLine(sale, makeCustomer({ rate: 0.9, priceRounding: "round" }), makeProduct({ price: 698 }));
    expect(round.unitPrice).toBe(628);
    expect(round.amount).toBe(1570);
  });

  test("返品（マイナス数量）は金額がマイナス", () => {
    const line = priceLine(makeSale({ quantity: -2 }), makeCustomer({ rate: 0.85 }), makeProduct({ price: 980 }));
    expect(line.amount).toBe(-1666);
  });

  test("特価単価があれば掛率を使わない", () => {
    const line = priceLine(makeSale({ specialPrice: 1400, quantity: 6 }), makeCustomer({ rate: 0.9 }), makeProduct({ price: 1580 }));
    expect(line.unitPrice).toBe(1400);
    expect(line.amount).toBe(8400);
  });

  test("特価単価に小数を入れたら単価端数のルールで円にする", () => {
    const line = priceLine(makeSale({ specialPrice: 1234.5 }), makeCustomer({ priceRounding: "round" }), makeProduct());
    expect(line.unitPrice).toBe(1235);
  });

  test("特価単価 0 円（無償提供）", () => {
    const line = priceLine(makeSale({ specialPrice: 0, quantity: 3 }), makeCustomer(), makeProduct());
    expect(line.amount).toBe(0);
  });

  test("税率・商品情報を引き継ぐ", () => {
    const line = priceLine(makeSale(), makeCustomer(), makeProduct({ taxRate: 10, reduced: false, unit: "本" }));
    expect(line).toMatchObject({ taxRate: 10, reduced: false, unit: "本", customerCode: "C900", productCode: "P900" });
  });
});

describe("priceSales", () => {
  test("マスタにない取引先・商品は行番号付きのエラー", () => {
    const result = priceSales(
      [
        makeSale({ rowNumber: 2 }),
        makeSale({ rowNumber: 3, customerName: "存在しない商店" }),
        makeSale({ rowNumber: 4, productName: "存在しない商品" }),
      ],
      [makeCustomer()],
      [makeProduct()],
    );
    expect(result.items).toHaveLength(1);
    expect(result.errors).toEqual([
      "売上入力 3行目: 取引先「存在しない商店」が取引先マスタにありません",
      "売上入力 4行目: 商品「存在しない商品」が商品マスタにありません",
    ]);
  });

  test("数量の小数が4桁以上ならエラーにする（黙って丸めない）", () => {
    const result = priceSales([makeSale({ rowNumber: 5, quantity: 1.2345 })], [makeCustomer()], [makeProduct()]);
    expect(result.items).toHaveLength(0);
    expect(result.errors[0]).toMatch(/^売上入力 5行目: 小数点以下は3桁まで/);
  });

  test("0件なら空", () => {
    expect(priceSales([], [makeCustomer()], [makeProduct()])).toEqual({ items: [], errors: [] });
  });
});

describe("calcTaxBreakdown（税率ごとに1回の端数処理）", () => {
  test("軽減税率と標準税率の混在", () => {
    const lines = [
      makeLine({ amount: 1001, taxRate: 10, reduced: false }),
      makeLine({ amount: 2002, taxRate: 10, reduced: false }),
      makeLine({ amount: 1234, taxRate: 8, reduced: true }),
      makeLine({ amount: 567, taxRate: 8, reduced: true }),
    ];
    expect(calcTaxBreakdown(lines, "floor")).toEqual([
      { taxRate: 10, reduced: false, base: 3003, tax: 300, gross: 3303 },
      { taxRate: 8, reduced: true, base: 1801, tax: 144, gross: 1945 },
    ]);
  });

  test("明細ごとに丸めて足すと1円ずれるケースでも、税率ごとの合計から1回だけ計算する", () => {
    const lines = [makeLine({ amount: 1234 }), makeLine({ amount: 567 })];
    // 明細ごとに切り捨てて足すと 98 + 45 = 143 円（インボイス制度では認められない計算）
    const perLine = lines.reduce((s, l) => s + Math.floor((l.amount * 8) / 100), 0);
    expect(perLine).toBe(143);
    // 税率ごとの合計 1,801 円 × 8% = 144.08 → 144 円
    expect(calcTaxBreakdown(lines, "floor")[1].tax).toBe(144);
  });

  test.each([
    ["floor", 144],
    ["round", 144],
    ["ceil", 145],
  ] as [RoundingMode, number][])("消費税の端数処理 %s（1,801円 × 8% = 144.08）→ %i円", (mode, expected) => {
    expect(calcTaxBreakdown([makeLine({ amount: 1801 })], mode)[1].tax).toBe(expected);
  });

  test("消費税の四捨五入（ちょうど .5）", () => {
    // 1,005円 × 10% = 100.5
    const lines = [makeLine({ amount: 1005, taxRate: 10, reduced: false })];
    expect(calcTaxBreakdown(lines, "round")[0].tax).toBe(101);
    expect(calcTaxBreakdown(lines, "floor")[0].tax).toBe(100);
  });

  test("返品が上回ってマイナスになった税率は、0 に近づける方向で切り捨て", () => {
    const lines = [makeLine({ amount: -1005, taxRate: 10, reduced: false })];
    expect(calcTaxBreakdown(lines, "floor")[0]).toMatchObject({ base: -1005, tax: -100, gross: -1105 });
    expect(calcTaxBreakdown(lines, "round")[0].tax).toBe(-101);
  });

  test("0件でも 10% と 8% の行を 0 円で返す（請求書の様式を固定するため）", () => {
    expect(calcTaxBreakdown([], "floor")).toEqual([
      { taxRate: 10, reduced: false, base: 0, tax: 0, gross: 0 },
      { taxRate: 8, reduced: true, base: 0, tax: 0, gross: 0 },
    ]);
  });

  test("片方の税率だけでも、もう片方は 0 円の行になる", () => {
    const result = calcTaxBreakdown([makeLine({ amount: 5000 })], "floor");
    expect(result[0]).toMatchObject({ taxRate: 10, base: 0, tax: 0 });
    expect(result[1]).toMatchObject({ taxRate: 8, base: 5000, tax: 400 });
  });
});

describe("buildInvoice（1取引先・1か月分の請求書）", () => {
  const customer = makeCustomer({
    code: "C002",
    name: "二十日締め商店",
    closingDay: 20,
    paymentMonthOffset: 1,
    paymentDay: 10,
  });
  const line = (date: string, amount: number, extra: Partial<PricedLine> = {}) =>
    makeLine({ date, amount, customerCode: "C002", customerName: "二十日締め商店", ...extra });

  const lines = [
    line("2026-08-20", 1000), // 前月分（締め日当日）
    line("2026-08-21", 2000), // 9月分の初日
    line("2026-09-20", 3000), // 9月分の最終日（締め日当日）
    line("2026-09-21", 4000), // 10月分
    line("2026-09-05", 500, { taxRate: 10, reduced: false }),
    makeLine({ date: "2026-09-10", amount: 9999, customerCode: "C001" }), // 別の取引先
  ];

  test("締め日で対象期間の明細だけを集める（20日締め: 8/21〜9/20）", () => {
    const invoice = buildInvoice(customer, "2026-09", lines);
    expect(invoice.period).toEqual({ month: "2026-09", start: "2026-08-21", end: "2026-09-20" });
    expect(invoice.lines.map((l) => l.date)).toEqual(["2026-08-21", "2026-09-05", "2026-09-20"]);
  });

  test("合計・請求日・支払期限・請求書番号", () => {
    const invoice = buildInvoice(customer, "2026-09", lines);
    expect(invoice.subtotal).toBe(5500);
    expect(invoice.taxTotal).toBe(50 + 400);
    expect(invoice.total).toBe(5950);
    expect(invoice.issueDate).toBe("2026-09-20");
    expect(invoice.dueDate).toBe("2026-10-10");
    expect(invoice.invoiceNo).toBe("202609-C002");
  });

  test("明細は 日付 → 伝票No → 行番号 の順", () => {
    const unordered = [
      line("2026-09-02", 1, { slipNo: "S2", rowNumber: 10 }),
      line("2026-09-01", 1, { slipNo: "S9", rowNumber: 11 }),
      line("2026-09-02", 1, { slipNo: "S1", rowNumber: 13 }),
      line("2026-09-02", 1, { slipNo: "S1", rowNumber: 12 }),
    ];
    const invoice = buildInvoice(customer, "2026-09", unordered);
    expect(invoice.lines.map((l) => l.rowNumber)).toEqual([11, 12, 13, 10]);
  });

  test("対象の明細が0件なら金額0の請求書（lines が空）", () => {
    const invoice = buildInvoice(customer, "2026-12", lines);
    expect(invoice.lines).toEqual([]);
    expect(invoice.total).toBe(0);
    expect(invoice.taxes.map((t) => t.tax)).toEqual([0, 0]);
  });

  test("末日締め: 2月はうるう年で29日まで", () => {
    const monthEnd = makeCustomer({ closingDay: "end" });
    const feb = [makeLine({ date: "2028-02-29", amount: 100 }), makeLine({ date: "2028-03-01", amount: 200 })];
    const invoice = buildInvoice(monthEnd, "2028-02", feb);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.issueDate).toBe("2028-02-29");
    expect(invoice.dueDate).toBe("2028-03-31");
  });
});

describe("buildInvoicesForMonth（一括作成）", () => {
  test("明細のない取引先は skipped に入れる", () => {
    const a = makeCustomer({ code: "A", name: "A商店" });
    const b = makeCustomer({ code: "B", name: "B商店" });
    const lines = [makeLine({ customerCode: "A", date: "2026-09-01" })];
    const { invoices, skipped } = buildInvoicesForMonth([a, b], "2026-09", lines);
    expect(invoices.map((i) => i.customer.code)).toEqual(["A"]);
    expect(skipped.map((c) => c.code)).toEqual(["B"]);
  });

  test("取引先0件・明細0件", () => {
    expect(buildInvoicesForMonth([], "2026-09", [])).toEqual({ invoices: [], skipped: [] });
  });
});

describe("calcSalesRowCells（売上入力の自動計算列）", () => {
  const customers = [makeCustomer({ rate: 0.85 })];
  const products = [makeProduct({ price: 980 })];

  test("空行は空欄", () => {
    expect(calcSalesRowCells(["", "", "", "", "", "", ""], 2, customers, products, utcFormatter)).toEqual({
      cells: ["", "", ""],
      error: "",
    });
  });

  test("正しい行は 適用単価・金額・税率", () => {
    const row = [new Date(Date.UTC(2026, 8, 1)), "S1", "テスト商店", "テスト商品", 3, "", ""];
    expect(calcSalesRowCells(row, 2, customers, products, utcFormatter)).toEqual({ cells: [833, 2499, "8%"], error: "" });
  });

  test("マスタにない商品は「要確認」と理由", () => {
    const row = ["2026-09-01", "S1", "テスト商店", "幻の商品", 3, "", ""];
    expect(calcSalesRowCells(row, 7, customers, products, utcFormatter)).toEqual({
      cells: ["", "", "要確認"],
      error: "商品「幻の商品」が商品マスタにありません",
    });
  });

  test("入力途中（数量が空）も「要確認」", () => {
    const row = ["2026-09-01", "S1", "テスト商店", "テスト商品", "", "", ""];
    const result = calcSalesRowCells(row, 7, customers, products, utcFormatter);
    expect(result.cells[2]).toBe("要確認");
    expect(result.error).toMatch(/^数量は/);
  });
});
