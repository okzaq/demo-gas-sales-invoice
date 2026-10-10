/**
 * 端数処理。src の関数は tests/__mocks__/gas.ts でグローバルに展開されている（GAS と同じ呼び方）。
 */
describe("roundRatio（分数の端数処理）", () => {
  test.each([
    [7, 2, "floor", 3],
    [7, 2, "round", 4],
    [7, 2, "ceil", 4],
    [6, 2, "floor", 3],
    [6, 2, "ceil", 3],
    [5, 10, "round", 1], // 0.5 は切り上げ
    [4, 10, "round", 0],
    [1, 1000, "ceil", 1],
    [999, 1000, "floor", 0],
  ] as [number, number, RoundingMode, number][])("%i / %i を %s → %i", (n, d, mode, expected) => {
    expect(roundRatio(n, d, mode)).toBe(expected);
  });

  test.each([
    [-7, 2, "floor", -3], // 切り捨ては 0 に近づける（Excel の ROUNDDOWN と同じ）
    [-7, 2, "round", -4], // 四捨五入の 0.5 は 0 から遠ざける（Excel の ROUND と同じ）
    [-7, 2, "ceil", -4], // 切り上げは 0 から遠ざける（Excel の ROUNDUP と同じ）
    [-4, 10, "round", 0],
  ] as [number, number, RoundingMode, number][])("負の値 %i / %i を %s → %i", (n, d, mode, expected) => {
    expect(roundRatio(n, d, mode)).toBe(expected);
  });

  test("0 は -0 にならない", () => {
    expect(Object.is(roundRatio(0, 3, "ceil"), 0)).toBe(true);
    expect(Object.is(roundRatio(-1, 3, "floor"), 0)).toBe(true);
  });

  test("整数以外・分母0以下は例外", () => {
    expect(() => roundRatio(1.5, 2, "floor")).toThrow();
    expect(() => roundRatio(1, 0, "floor")).toThrow();
    expect(() => roundRatio(1, -2, "floor")).toThrow();
  });
});

describe("toScaledInt", () => {
  test("小数を整数に直す", () => {
    expect(toScaledInt(0.85, 4)).toBe(8500);
    expect(toScaledInt(0.29, 4)).toBe(2900); // 0.29 * 10000 = 2899.9999... を 2900 に
    expect(toScaledInt(2.5, 3)).toBe(2500);
    expect(toScaledInt(-2, 3)).toBe(-2000);
  });
  test("指定した桁を超える小数は例外（黙って丸めない）", () => {
    expect(() => toScaledInt(0.12345, 4)).toThrow("小数点以下は4桁まで");
  });
});

describe("roundYen", () => {
  test.each([
    [1234.5, "round", 1235],
    [1234.5, "floor", 1234],
    [1234.4, "ceil", 1235],
    [1234, "ceil", 1234],
    [-1234.5, "round", -1235],
  ] as [number, RoundingMode, number][])("%d を %s → %i", (v, mode, expected) => {
    expect(roundYen(v, mode)).toBe(expected);
  });
});

describe("parseRoundingMode", () => {
  test("シートの表記を変換する", () => {
    expect(parseRoundingMode("切り捨て")).toBe("floor");
    expect(parseRoundingMode("切捨て")).toBe("floor");
    expect(parseRoundingMode(" 四捨五入 ")).toBe("round");
    expect(parseRoundingMode("切り上げ")).toBe("ceil");
  });
  test("知らない表記は例外", () => {
    expect(() => parseRoundingMode("五捨六入")).toThrow();
    expect(() => parseRoundingMode("")).toThrow();
  });
});
