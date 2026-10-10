/**
 * 締め日と請求対象期間・支払期限（純粋関数）。
 *
 * 例: 20日締めの「2026年9月分」の請求 → 対象期間は 8/21〜9/20
 *     末日締めの「2026年9月分」の請求 → 対象期間は 9/1〜9/30
 * 締め日がその月に存在しない場合（30日締めの2月など）は月末を締め日とみなす。
 */

/** シートの表記 → DayOfMonth（"末日" / "20日" / 20） */
function parseDayOfMonth(label: unknown): DayOfMonth {
  const text = String(label).trim();
  if (text === "末日" || text === "末" || text === "月末") return "end";
  const m = /^(\d{1,2})日?$/.exec(text);
  if (!m) throw new Error(`日付の指定は「20日」「末日」のように入力してください: ${text}`);
  const day = Number(m[1]);
  if (day < 1 || day > 31) throw new Error(`日は1〜31で指定してください: ${text}`);
  return day === 31 ? "end" : day;
}

function formatDayOfMonth(day: DayOfMonth): string {
  return day === "end" ? "末日" : `${day}日`;
}

/** "当月" / "翌月" / "翌々月" → 0 / 1 / 2 */
function parsePaymentMonth(label: unknown): number {
  switch (String(label).trim()) {
    case "当月":
      return 0;
    case "翌月":
      return 1;
    case "翌々月":
      return 2;
    default:
      throw new Error(`支払月は「当月」「翌月」「翌々月」のいずれかです: ${label}`);
  }
}

/** 請求月（"YYYY-MM"）と締め日から、請求対象期間を求める */
function billingPeriod(month: string, closingDay: DayOfMonth): BillingPeriod {
  const { year, month: m } = parseYm(month);
  const end = dayInMonth(year, m, closingDay);
  const prev = addMonths(year, m, -1);
  const start = addDays(dayInMonth(prev.year, prev.month, closingDay), 1);
  return { month, start, end };
}

/** 売上日がどの請求月に入るか（"YYYY-MM"） */
function billingMonthOf(date: string, closingDay: DayOfMonth): string {
  const { year, month } = parseYmd(date);
  const closing = dayInMonth(year, month, closingDay);
  if (date <= closing) return toYm(year, month);
  const next = addMonths(year, month, 1);
  return toYm(next.year, next.month);
}

function isInPeriod(date: string, period: BillingPeriod): boolean {
  // "YYYY-MM-DD" は文字列比較で日付順になる
  return period.start <= date && date <= period.end;
}

/**
 * 支払期限: 締め日の月から paymentMonthOffset か月後の paymentDay。
 * 「25日締め・当月20日払い」のように締め日より前になる設定は、翌月の同じ日に送る。
 */
function paymentDueDate(closingDate: string, paymentMonthOffset: number, paymentDay: DayOfMonth): string {
  const { year, month } = parseYmd(closingDate);
  const target = addMonths(year, month, paymentMonthOffset);
  let due = dayInMonth(target.year, target.month, paymentDay);
  if (due < closingDate) {
    const next = addMonths(target.year, target.month, 1);
    due = dayInMonth(next.year, next.month, paymentDay);
  }
  return due;
}

/**
 * 請求ダイアログで最初に選んでおく月: 今日の月より前で一番新しい月（ふつうは先月）。
 * 該当がなければ一番新しい月。候補が空なら今日の前月。
 */
function defaultBillingMonth(months: string[], today: string): string {
  const current = today.slice(0, 7);
  const sorted = months.slice().sort();
  const past = sorted.filter((m) => m < current);
  if (past.length > 0) return past[past.length - 1];
  if (sorted.length > 0) return sorted[sorted.length - 1];
  const { year, month } = parseYmd(today);
  const prev = addMonths(year, month, -1);
  return toYm(prev.year, prev.month);
}

if (typeof module !== "undefined") {
  module.exports = {
    defaultBillingMonth,
    parseDayOfMonth,
    formatDayOfMonth,
    parsePaymentMonth,
    billingPeriod,
    billingMonthOf,
    isInPeriod,
    paymentDueDate,
  };
}
