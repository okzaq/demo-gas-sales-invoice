/**
 * 日付ユーティリティ（純粋関数）。
 * 純粋関数の中では日付を "YYYY-MM-DD" 文字列で扱い、内部計算は UTC で行う。
 * こうすると GAS（Asia/Tokyo）と Jest（実行マシンのタイムゾーン）で結果が変わらない。
 */

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function toYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** "YYYY-MM-DD" を数値に分解する。形式・日付として不正なら例外 */
function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`日付の形式が不正です: ${ymd}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`存在しない日付です: ${ymd}`);
  }
  return { year, month, day };
}

/** "YYYY-MM" を数値に分解する */
function parseYm(ym: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
    throw new Error(`年月の形式が不正です（例: 2026-09）: ${ym}`);
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

function toYm(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function daysInMonth(year: number, month: number): number {
  // Date.UTC の月は0始まり。翌月の0日 = 当月末日
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 年月に n か月足す（負も可） */
function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function addDays(ymd: string, n: number): string {
  const { year, month, day } = parseYmd(ymd);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return toYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 指定した月の「◯日」。その月に存在しない日（2月30日など）や "end" は末日にそろえる */
function dayInMonth(year: number, month: number, day: DayOfMonth): string {
  const last = daysInMonth(year, month);
  const d = day === "end" ? last : Math.min(day, last);
  return toYmd(year, month, d);
}

/** "2026-09-21" → "2026年9月21日" */
function formatJpDate(ymd: string): string {
  const { year, month, day } = parseYmd(ymd);
  return `${year}年${month}月${day}日`;
}

/** "2026-09-21" → "9/21" */
function formatShortDate(ymd: string): string {
  const { month, day } = parseYmd(ymd);
  return `${month}/${day}`;
}

/** "2026-09" → "2026年9月" */
function formatJpMonth(ym: string): string {
  const { year, month } = parseYm(ym);
  return `${year}年${month}月`;
}

if (typeof module !== "undefined") {
  module.exports = {
    pad2,
    toYmd,
    parseYmd,
    parseYm,
    toYm,
    daysInMonth,
    addMonths,
    addDays,
    dayInMonth,
    formatJpDate,
    formatShortDate,
    formatJpMonth,
  };
}
