import { utcFormatter } from "./helpers";

describe("セル値の変換", () => {
  test("cellNumber", () => {
    expect(cellNumber(1200)).toBe(1200);
    expect(cellNumber("1,200")).toBe(1200);
    expect(cellNumber("-2")).toBe(-2);
    expect(cellNumber("2.5")).toBe(2.5);
    expect(cellNumber("")).toBeNull();
    expect(cellNumber(null)).toBeNull();
    expect(cellNumber("abc")).toBeNaN();
  });

  test("cellDate: Date オブジェクトと文字列", () => {
    expect(cellDate(new Date(Date.UTC(2026, 8, 1)), utcFormatter)).toBe("2026-09-01");
    expect(cellDate("2026/9/1", utcFormatter)).toBe("2026-09-01");
    expect(cellDate("2026-09-01", utcFormatter)).toBe("2026-09-01");
    expect(cellDate("", utcFormatter)).toBeNull();
    expect(() => cellDate("2026/2/30", utcFormatter)).toThrow("存在しない日付");
    expect(() => cellDate("9月1日", utcFormatter)).toThrow("日付として読めません");
  });

  test("parseTaxCategory", () => {
    expect(parseTaxCategory("標準10%")).toEqual({ taxRate: 10, reduced: false });
    expect(parseTaxCategory("10％")).toEqual({ taxRate: 10, reduced: false });
    expect(parseTaxCategory("軽減8%")).toEqual({ taxRate: 8, reduced: true });
    expect(parseTaxCategory("8%軽減")).toEqual({ taxRate: 8, reduced: true });
    expect(() => parseTaxCategory("5%")).toThrow();
    expect(() => parseTaxCategory("")).toThrow();
  });
});

describe("parseCustomerRows", () => {
  const valid = ["C001", "テスト商店", "御中", "000-0000", "架空県", "見本 太郎", 0.85, "20日", "翌月", "10日", "切り捨て", "四捨五入"];

  test("1行を Customer に変換する", () => {
    const { items, errors } = parseCustomerRows([valid]);
    expect(errors).toEqual([]);
    expect(items[0]).toEqual({
      code: "C001",
      name: "テスト商店",
      honorific: "御中",
      postalCode: "000-0000",
      address: "架空県",
      contact: "見本 太郎",
      rate: 0.85,
      closingDay: 20,
      paymentMonthOffset: 1,
      paymentDay: 10,
      priceRounding: "floor",
      taxRounding: "round",
    });
  });

  test("空行は読み飛ばし、エラーの行番号は実際のシートの行", () => {
    const blank = valid.map(() => "");
    const badRate = valid.slice();
    badRate[0] = "C002";
    badRate[1] = "別の商店";
    badRate[6] = 85; // 85% のつもりで 85 と入力
    const { items, errors } = parseCustomerRows([valid, blank, badRate]);
    expect(items).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^取引先マスタ 4行目: 掛率は/);
  });

  test("取引先コード・取引先名の重複はエラー（売上入力は名前で選ぶため）", () => {
    const dupCode = valid.slice();
    dupCode[1] = "名前違い";
    const dupName = valid.slice();
    dupName[0] = "C009";
    const { errors } = parseCustomerRows([valid, dupCode, dupName]);
    expect(errors).toEqual([
      "取引先マスタ 3行目: 取引先コード「C001」が2行目と重複しています",
      "取引先マスタ 4行目: 取引先名「テスト商店」が2行目と重複しています",
    ]);
  });

  test("締め日・支払月・端数処理の表記ゆれ・誤り", () => {
    const badClosing = valid.slice();
    badClosing[7] = "毎月";
    const badRounding = valid.slice();
    badRounding[0] = "C003";
    badRounding[1] = "端数商店";
    badRounding[11] = "銀行丸め";
    const { errors } = parseCustomerRows([badClosing, badRounding]);
    expect(errors[0]).toMatch(/^取引先マスタ 2行目: 日付の指定は/);
    expect(errors[1]).toMatch(/^取引先マスタ 3行目: 端数処理は/);
  });

  test("敬称が空なら「御中」", () => {
    const row = valid.slice();
    row[2] = "";
    expect(parseCustomerRows([row]).items[0].honorific).toBe("御中");
  });
});

describe("parseProductRows", () => {
  test("税率区分を読み、単価の誤りはエラー", () => {
    const { items, errors } = parseProductRows([
      ["P001", "牛乳", "本", 220, "軽減8%"],
      ["P002", "洗剤", "本", "1,980", "標準10%"],
      ["P003", "不明", "個", "時価", "標準10%"],
      ["P004", "マイナス", "個", -1, "標準10%"],
    ]);
    expect(items.map((p) => [p.code, p.price, p.taxRate, p.reduced])).toEqual([
      ["P001", 220, 8, true],
      ["P002", 1980, 10, false],
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^商品マスタ 4行目/);
  });
});

describe("parseSalesRows", () => {
  test("Date・文字列の日付、特価単価の空欄、返品のマイナス", () => {
    const { items, errors } = parseSalesRows(
      [
        [new Date(Date.UTC(2026, 8, 1)), "S1", "テスト商店", "牛乳", 3, "", ""],
        ["2026/9/2", "S2", "テスト商店", "牛乳", -1, 200, "返品"],
      ],
      utcFormatter,
    );
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { rowNumber: 2, date: "2026-09-01", slipNo: "S1", customerName: "テスト商店", productName: "牛乳", quantity: 3, specialPrice: null, note: "" },
      { rowNumber: 3, date: "2026-09-02", slipNo: "S2", customerName: "テスト商店", productName: "牛乳", quantity: -1, specialPrice: 200, note: "返品" },
    ]);
  });

  test("自動計算列（H〜J）に値があっても、A〜G が空なら空行", () => {
    const { items, errors } = parseSalesRows([["", "", "", "", "", "", "", 833, 2499, "8%"]], utcFormatter);
    expect(items).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("入力ミスは行番号付きでまとめて返す", () => {
    const { items, errors } = parseSalesRows(
      [
        ["", "S1", "テスト商店", "牛乳", 3, "", ""],
        ["2026/9/1", "S1", "", "牛乳", 3, "", ""],
        ["2026/9/1", "S1", "テスト商店", "牛乳", 0, "", ""],
        ["2026/9/1", "S1", "テスト商店", "牛乳", 1, -100, ""],
      ],
      utcFormatter,
      10,
    );
    expect(items).toEqual([]);
    expect(errors).toEqual([
      "売上入力 10行目: 日付が空です",
      "売上入力 11行目: 取引先が空です",
      "売上入力 12行目: 数量は 0 以外の数値で入力してください（返品はマイナス）: 0",
      "売上入力 13行目: 特価単価は 0 以上の数値で入力してください: -100",
    ]);
  });
});
