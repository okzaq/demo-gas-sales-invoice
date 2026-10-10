/**
 * Excel からの移行の受け入れテストの例。
 * 「今の Excel が出している数字」を正解として、新しい計算ロジックが1円も違わないことを確かめる。
 */
import { EXCEL_INVOICE_CASE, EXCEL_LINE_CASES } from "./fixtures/excel-expected";
import { makeCustomer, makeProduct, makeSale } from "./helpers";

describe("Excel の計算結果と一致する（明細）", () => {
  test.each(EXCEL_LINE_CASES)(
    "定価 %d × 掛率 %d × 数量 %d（%s）→ 単価 %d / 金額 %d",
    (price, rate, quantity, mode, unitPrice, amount) => {
      const line = priceLine(
        makeSale({ quantity }),
        makeCustomer({ rate, priceRounding: mode }),
        makeProduct({ price }),
      );
      expect(line.unitPrice).toBe(unitPrice);
      expect(line.amount).toBe(amount);
    },
  );
});

describe("Excel の計算結果と一致する（請求書1枚）", () => {
  test("税率別の合計・消費税・請求額", () => {
    const { rate, lines, expected } = EXCEL_INVOICE_CASE;
    const customer = makeCustomer({ rate, priceRounding: "floor", taxRounding: "floor" });
    const products = lines.map(([price, , taxRate], i) =>
      makeProduct({ code: `P${i}`, name: `商品${i}`, price, taxRate, reduced: taxRate === 8 }),
    );
    const sales = lines.map(([, quantity], i) => makeSale({ productName: `商品${i}`, quantity, date: "2026-09-10" }));
    const priced = priceSales(sales, [customer], products);
    expect(priced.errors).toEqual([]);

    const invoice = buildInvoice(customer, "2026-09", priced.items);
    const t10 = invoice.taxes.find((t) => t.taxRate === 10)!;
    const t8 = invoice.taxes.find((t) => t.taxRate === 8)!;
    expect({
      base10: t10.base,
      tax10: t10.tax,
      base8: t8.base,
      tax8: t8.tax,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
    }).toEqual(expected);
  });
});
