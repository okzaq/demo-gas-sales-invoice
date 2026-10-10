import { makeCustomer, makeLine, makeProduct } from "./helpers";

describe("buildPivot", () => {
  test("行×列の合計と、行合計・列合計・総合計", () => {
    const pivot = buildPivot("t", [
      { row: "A", col: "2026-09", value: 100 },
      { row: "A", col: "2026-09", value: 50 },
      { row: "B", col: "2026-08", value: 30 },
      { row: "A", col: "2026-08", value: 20 },
    ]);
    expect(pivot.rowKeys).toEqual(["A", "B"]);
    expect(pivot.colKeys).toEqual(["2026-08", "2026-09"]);
    expect(pivot.values).toEqual([
      [20, 150],
      [30, 0],
    ]);
    expect(pivot.rowTotals).toEqual([170, 30]);
    expect(pivot.colTotals).toEqual([50, 150]);
    expect(pivot.grandTotal).toBe(200);
  });

  test("rowOrder の行は値がなくても表示し、それ以外は後ろに足す", () => {
    const pivot = buildPivot("t", [{ row: "Z", col: "2026-09", value: 1 }], ["B", "A"]);
    expect(pivot.rowKeys).toEqual(["B", "A", "Z"]);
    expect(pivot.values).toEqual([[0], [0], [1]]);
  });

  test("colKeys を指定するとその列だけ", () => {
    const pivot = buildPivot("t", [{ row: "A", col: "2026-07", value: 5 }, { row: "A", col: "2026-09", value: 7 }], [], ["2026-09"]);
    expect(pivot.values).toEqual([[7]]);
    expect(pivot.grandTotal).toBe(7);
  });

  test("0件", () => {
    const pivot = buildPivot("t", []);
    expect(pivot).toMatchObject({ rowKeys: [], colKeys: [], values: [], grandTotal: 0 });
  });
});

describe("buildMonthlySummary", () => {
  const monthEnd = makeCustomer({ code: "C1", name: "末締め商店", closingDay: "end" });
  const day20 = makeCustomer({ code: "C2", name: "二十日締め商店", closingDay: 20 });
  const idle = makeCustomer({ code: "C3", name: "休眠商店" });
  const products = [makeProduct({ name: "牛乳" }), makeProduct({ code: "P2", name: "洗剤", taxRate: 10, reduced: false })];
  const lines = [
    makeLine({ customerCode: "C1", customerName: "末締め商店", productName: "牛乳", date: "2026-09-25", amount: 1000 }),
    makeLine({ customerCode: "C2", customerName: "二十日締め商店", productName: "牛乳", date: "2026-09-10", amount: 2000 }),
    makeLine({
      customerCode: "C2",
      customerName: "二十日締め商店",
      productName: "洗剤",
      date: "2026-09-25",
      amount: 500,
      taxRate: 10,
      reduced: false,
    }),
  ];
  const [byRate, byCustomer, byInvoice, byProduct] = buildMonthlySummary(lines, [monthEnd, day20, idle], products);

  test("税率別（売上日基準）", () => {
    expect(byRate.rowKeys).toEqual(["10%対象", "8%対象（軽減）"]);
    expect(byRate.values).toEqual([[500], [3000]]);
  });

  test("取引先別（売上日基準）: 売上のない取引先も0で表示", () => {
    expect(byCustomer.rowKeys).toEqual(["末締め商店", "二十日締め商店", "休眠商店"]);
    expect(byCustomer.values).toEqual([[1000], [2500], [0]]);
  });

  test("取引先別の請求額（請求月基準）: 20日締めの 9/25 は10月分の請求に入る", () => {
    expect(byInvoice.colKeys).toEqual(["2026-09", "2026-10"]);
    expect(byInvoice.values).toEqual([
      [1080, 0], // 1000 + 8%
      [2160, 550], // 9月分 2000 + 8% / 10月分 500 + 10%
      [0, 0],
    ]);
    expect(byInvoice.grandTotal).toBe(1080 + 2160 + 550);
  });

  test("商品別（売上日基準）", () => {
    expect(byProduct.rowKeys).toEqual(["牛乳", "洗剤"]);
    expect(byProduct.values).toEqual([[3000], [500]]);
  });

  test("売上0件でも表の枠は作れる", () => {
    const empty = buildMonthlySummary([], [monthEnd], products);
    expect(empty.map((p) => p.colKeys)).toEqual([[], [], [], []]);
    expect(empty[1].rowKeys).toEqual(["末締め商店"]);
  });
});

describe("pivotToRows（シートに書く形）", () => {
  test("見出し行・合計列・合計行が付く", () => {
    const pivot = buildPivot("t", [
      { row: "A", col: "2026-08", value: 1 },
      { row: "B", col: "2026-09", value: 2 },
    ]);
    expect(pivotToRows(pivot, "取引先")).toEqual([
      ["取引先", "2026年8月", "2026年9月", "合計"],
      ["A", 1, 0, 1],
      ["B", 0, 2, 2],
      ["合計", 1, 2, 3],
    ]);
  });
});
