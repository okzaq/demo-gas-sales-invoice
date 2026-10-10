import { makeCustomer, makeLine } from "./helpers";

describe("invoiceToSheetModel（請求書シートに書く値）", () => {
  const customer = makeCustomer({
    code: "C002",
    name: "見本ベーカリー株式会社",
    postalCode: "000-0002",
    address: "架空県見本市麦畑2-2-2",
    contact: "試作 二郎",
    closingDay: 20,
    paymentMonthOffset: 1,
    paymentDay: 10,
  });
  const lines = [
    makeLine({ customerCode: "C002", date: "2026-09-12", slipNo: "S00010", productName: "無塩バター 450g", quantity: -2, unitPrice: 833, amount: -1666, note: "返品" }),
    makeLine({ customerCode: "C002", date: "2026-09-01", slipNo: "S00001", productName: "強力粉 25kg", unit: "袋", quantity: 2, unitPrice: 5508, amount: 11016 }),
    makeLine({ customerCode: "C002", date: "2026-09-01", slipNo: "S00001", productName: "配送料", unit: "回", unitPrice: 680, amount: 680, taxRate: 10, reduced: false }),
  ];
  const invoice = buildInvoice(customer, "2026-09", lines);
  const model = invoiceToSheetModel(invoice, COMPANY);

  test("宛名・番号・日付・期間", () => {
    expect(model.cells["A3"]).toBe("見本ベーカリー株式会社 御中");
    expect(model.cells["A4"]).toBe("〒000-0002 架空県見本市麦畑2-2-2");
    expect(model.cells["A5"]).toBe("ご担当: 試作 二郎 様");
    expect(model.cells["G3"]).toBe("202609-C002");
    expect(model.cells["G4"]).toBe("2026年9月20日");
    expect(model.cells["B9"]).toBe("2026年8月21日〜2026年9月20日（20日締め）");
    expect(model.cells["B10"]).toBe("2026年10月10日");
  });

  test("発行元と登録番号（ダミー）", () => {
    expect(model.cells["E6"]).toBe("サンプル食品卸株式会社");
    expect(model.cells["E9"]).toBe("登録番号 T0000000000000");
  });

  test("ご請求金額と税率別の内訳（10%行・8%行・合計行）", () => {
    // 8%: 11016 - 1666 = 9350 → 748 / 10%: 680 → 68
    expect(model.cells["B8"]).toBe(9350 + 748 + 680 + 68);
    expect(model.taxRows).toEqual([
      [14, 680, 68, 748],
      [15, 9350, 748, 10098],
      [16, 10030, 816, 10846],
    ]);
  });

  test("明細: 日付順、軽減税率に ※、備考は品名の後ろに", () => {
    expect(model.details).toEqual([
      ["9/1", "S00001", "強力粉 25kg ※", 2, "袋", 5508, 11016, "8%"],
      ["9/1", "S00001", "配送料", 1, "回", 680, 680, "10%"],
      ["9/12", "S00010", "無塩バター 450g ※（返品）", -2, "個", 833, -1666, "8%"],
    ]);
  });

  test("担当者・郵便番号が空なら、その部分を出さない", () => {
    const c = makeCustomer({ contact: "", postalCode: "", address: "架空県" });
    const m = invoiceToSheetModel(buildInvoice(c, "2026-09", []), COMPANY);
    expect(m.cells["A4"]).toBe("架空県");
    expect(m.cells["A5"]).toBe("");
    expect(m.details).toEqual([]);
  });
});

describe("invoiceFileName", () => {
  test("請求書番号と取引先名。ファイル名に使えない記号は置き換える", () => {
    const invoice = buildInvoice(makeCustomer({ code: "C9", name: "A/B:商店" }), "2026-09", []);
    expect(invoiceFileName(invoice)).toBe("請求書_202609-C9_A＿B＿商店.pdf");
  });
});
