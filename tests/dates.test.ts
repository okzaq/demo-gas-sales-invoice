describe("日付ユーティリティ", () => {
  test("月の日数（うるう年を含む）", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  test("addMonths は年をまたぐ", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 11, 2)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 3, -14)).toEqual({ year: 2025, month: 1 });
  });

  test("addDays は月末・年末・うるう日をまたぐ", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("dayInMonth: 存在しない日と末日は月末にそろえる", () => {
    expect(dayInMonth(2026, 2, 30)).toBe("2026-02-28");
    expect(dayInMonth(2026, 2, "end")).toBe("2026-02-28");
    expect(dayInMonth(2026, 9, 20)).toBe("2026-09-20");
  });

  test("parseYmd / parseYm は不正な値を拒否する", () => {
    expect(() => parseYmd("2026-02-30")).toThrow("存在しない日付");
    expect(() => parseYmd("2026/09/01")).toThrow("形式が不正");
    expect(() => parseYm("2026-13")).toThrow();
    expect(() => parseYm("2026-9")).toThrow();
    expect(parseYm("2026-09")).toEqual({ year: 2026, month: 9 });
  });

  test("表示用の書式", () => {
    expect(formatJpDate("2026-09-01")).toBe("2026年9月1日");
    expect(formatShortDate("2026-09-01")).toBe("9/1");
    expect(formatJpMonth("2026-10")).toBe("2026年10月");
  });
});
