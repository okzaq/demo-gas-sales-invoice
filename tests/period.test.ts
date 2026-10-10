describe("billingPeriod（締め日による請求対象期間）", () => {
  test("末日締め: 当月1日〜末日", () => {
    expect(billingPeriod("2026-09", "end")).toEqual({ month: "2026-09", start: "2026-09-01", end: "2026-09-30" });
    expect(billingPeriod("2026-02", "end")).toEqual({ month: "2026-02", start: "2026-02-01", end: "2026-02-28" });
    expect(billingPeriod("2028-02", "end")).toEqual({ month: "2028-02", start: "2028-02-01", end: "2028-02-29" });
  });

  test("20日締め: 前月21日〜当月20日", () => {
    expect(billingPeriod("2026-09", 20)).toEqual({ month: "2026-09", start: "2026-08-21", end: "2026-09-20" });
  });

  test("20日締め: 年をまたぐ（1月分は前年12/21から）", () => {
    expect(billingPeriod("2026-01", 20)).toEqual({ month: "2026-01", start: "2025-12-21", end: "2026-01-20" });
  });

  test("15日締め・5日締め", () => {
    expect(billingPeriod("2026-09", 15)).toMatchObject({ start: "2026-08-16", end: "2026-09-15" });
    expect(billingPeriod("2026-03", 5)).toMatchObject({ start: "2026-02-06", end: "2026-03-05" });
  });

  test("30日締め: 2月は月末を締め日とみなす", () => {
    expect(billingPeriod("2026-02", 30)).toMatchObject({ start: "2026-01-31", end: "2026-02-28" });
    expect(billingPeriod("2026-03", 30)).toMatchObject({ start: "2026-03-01", end: "2026-03-30" });
    expect(billingPeriod("2028-03", 30)).toMatchObject({ start: "2028-03-01", end: "2028-03-30" });
  });

  test.each([5, 10, 15, 20, 25, 28, 29, 30, "end"] as DayOfMonth[])(
    "締め日 %s: 2年分の請求期間がすき間・重なりなく続く",
    (closing) => {
      let prev = billingPeriod("2026-01", closing);
      for (let i = 1; i < 24; i++) {
        const { year, month } = addMonths(2026, 1, i);
        const cur = billingPeriod(toYm(year, month), closing);
        expect(cur.start).toBe(addDays(prev.end, 1));
        expect(cur.start <= cur.end).toBe(true);
        prev = cur;
      }
    },
  );
});

describe("billingMonthOf（売上日がどの請求月に入るか）", () => {
  test("20日締め: 20日は当月分、21日は翌月分", () => {
    expect(billingMonthOf("2026-09-20", 20)).toBe("2026-09");
    expect(billingMonthOf("2026-09-21", 20)).toBe("2026-10");
    expect(billingMonthOf("2026-12-21", 20)).toBe("2027-01");
  });

  test("末日締め: 常に当月分", () => {
    expect(billingMonthOf("2026-09-01", "end")).toBe("2026-09");
    expect(billingMonthOf("2026-09-30", "end")).toBe("2026-09");
  });

  test.each([10, 20, 30, "end"] as DayOfMonth[])("締め日 %s: 3年分の毎日について billingPeriod と一致する", (closing) => {
    for (let d = "2026-01-01"; d <= "2028-12-31"; d = addDays(d, 1)) {
      const period = billingPeriod(billingMonthOf(d, closing), closing);
      expect(isInPeriod(d, period)).toBe(true);
    }
  });
});

describe("paymentDueDate（支払期限）", () => {
  test("末日締め翌月末払い", () => {
    expect(paymentDueDate("2026-09-30", 1, "end")).toBe("2026-10-31");
  });
  test("20日締め翌月10日払い", () => {
    expect(paymentDueDate("2026-09-20", 1, 10)).toBe("2026-10-10");
  });
  test("15日締め当月末払い", () => {
    expect(paymentDueDate("2026-09-15", 0, "end")).toBe("2026-09-30");
  });
  test("翌々月末払いで年をまたぐ", () => {
    expect(paymentDueDate("2026-11-30", 2, "end")).toBe("2027-01-31");
  });
  test("支払日がその月にない（翌月30日払いで2月）→ 月末", () => {
    expect(paymentDueDate("2026-01-31", 1, 30)).toBe("2026-02-28");
  });
  test("締め日より前になる設定（25日締め当月20日払い）は翌月に送る", () => {
    expect(paymentDueDate("2026-09-25", 0, 20)).toBe("2026-10-20");
  });
});

describe("シート表記の変換", () => {
  test("parseDayOfMonth", () => {
    expect(parseDayOfMonth("末日")).toBe("end");
    expect(parseDayOfMonth("月末")).toBe("end");
    expect(parseDayOfMonth("20日")).toBe(20);
    expect(parseDayOfMonth(20)).toBe(20);
    expect(parseDayOfMonth("31日")).toBe("end");
    expect(() => parseDayOfMonth("0日")).toThrow();
    expect(() => parseDayOfMonth("32日")).toThrow();
    expect(() => parseDayOfMonth("毎週")).toThrow();
  });
  test("parsePaymentMonth", () => {
    expect(parsePaymentMonth("当月")).toBe(0);
    expect(parsePaymentMonth("翌月")).toBe(1);
    expect(parsePaymentMonth("翌々月")).toBe(2);
    expect(() => parsePaymentMonth("来月")).toThrow();
  });
  test("formatDayOfMonth", () => {
    expect(formatDayOfMonth("end")).toBe("末日");
    expect(formatDayOfMonth(20)).toBe("20日");
  });
});

describe("defaultBillingMonth（ダイアログの初期値）", () => {
  const months = ["2026-07", "2026-08", "2026-09", "2026-10"];
  test("今日の月より前で一番新しい月（ふつうは先月）", () => {
    expect(defaultBillingMonth(months, "2026-10-01")).toBe("2026-09");
  });
  test("データより後の日付なら一番新しい月", () => {
    expect(defaultBillingMonth(months, "2027-03-15")).toBe("2026-10");
  });
  test("全部が未来の月なら一番新しい月", () => {
    expect(defaultBillingMonth(["2026-11"], "2026-10-01")).toBe("2026-11");
  });
  test("候補がなければ今日の前月", () => {
    expect(defaultBillingMonth([], "2026-01-15")).toBe("2025-12");
  });
});
