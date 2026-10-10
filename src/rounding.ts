/**
 * 端数処理（純粋関数）。
 *
 * 浮動小数点のまま 1234 * 0.7 のような計算をすると 863.7999... になり、
 * 「四捨五入したら1円ずれる」事故が起きる。ここでは金額・掛率・数量を整数に直してから
 * 分数（分子/分母）として端数処理するため、誤差が入らない。
 *
 * 負の値（返品・値引き）は「絶対値で処理して符号を戻す」:
 *   切り捨て = 0 に近づける / 切り上げ = 0 から遠ざける / 四捨五入 = 0.5 は 0 から遠ざける
 * Excel の ROUNDDOWN / ROUNDUP / ROUND と同じ動き。
 */

/** 小数を、指定した桁数の整数に直す（0.85, 4桁 → 8500）。桁が足りなければ例外 */
function toScaledInt(value: number, digits: number): number {
  const scale = Math.pow(10, digits);
  const scaled = Math.round(value * scale);
  if (Math.abs(scaled - value * scale) > 1e-6 * Math.max(1, Math.abs(value * scale))) {
    throw new Error(`小数点以下は${digits}桁までです: ${value}`);
  }
  return scaled;
}

/** 整数の分数 numerator / denominator を端数処理して整数にする（denominator > 0） */
function roundRatio(numerator: number, denominator: number, mode: RoundingMode): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    throw new Error(`roundRatio には整数を渡してください: ${numerator}/${denominator}`);
  }
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const quotient = Math.floor(abs / denominator);
  const remainder = abs - quotient * denominator;
  let result = quotient;
  if (remainder > 0) {
    if (mode === "ceil") {
      result = quotient + 1;
    } else if (mode === "round") {
      result = remainder * 2 >= denominator ? quotient + 1 : quotient;
    }
  }
  // -0 を 0 にそろえる
  return result === 0 ? 0 : sign * result;
}

/** 小数を整数円に端数処理する（特価単価の入力などに使う） */
function roundYen(value: number, mode: RoundingMode): number {
  return roundRatio(toScaledInt(value, 4), 10000, mode);
}

/** シートの表記 → RoundingMode */
function parseRoundingMode(label: string): RoundingMode {
  switch (String(label).trim()) {
    case "切り捨て":
    case "切捨て":
    case "切捨":
      return "floor";
    case "四捨五入":
      return "round";
    case "切り上げ":
    case "切上げ":
    case "切上":
      return "ceil";
    default:
      throw new Error(`端数処理は「切り捨て」「四捨五入」「切り上げ」のいずれかです: ${label}`);
  }
}

if (typeof module !== "undefined") {
  module.exports = { toScaledInt, roundRatio, roundYen, parseRoundingMode };
}
