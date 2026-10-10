/**
 * 型定義のみ（GAS 上では空のファイルになる）。
 * 日付はタイムゾーンの影響を受けないよう、純粋関数の中では "YYYY-MM-DD" 文字列で扱う。
 */

/** 端数処理の方法 */
type RoundingMode = "floor" | "round" | "ceil";

/** 締め日・支払日: 1〜31 の日、または "end"（末日） */
type DayOfMonth = number | "end";

interface Company {
  name: string;
  postalCode: string;
  address: string;
  tel: string;
  registrationNo: string;
  bank: string;
}

interface Customer {
  code: string;
  name: string;
  honorific: string;
  postalCode: string;
  address: string;
  contact: string;
  /** 掛率（例: 0.85 = 標準単価の85%） */
  rate: number;
  closingDay: DayOfMonth;
  /** 締め日の何か月後に支払うか（0=当月, 1=翌月, 2=翌々月） */
  paymentMonthOffset: number;
  paymentDay: DayOfMonth;
  /** 掛率適用後の単価・金額の端数処理 */
  priceRounding: RoundingMode;
  /** 消費税の端数処理（税率ごとに1回） */
  taxRounding: RoundingMode;
}

interface Product {
  code: string;
  name: string;
  unit: string;
  /** 標準単価（税抜） */
  price: number;
  /** 税率（%）。10 または 8 */
  taxRate: number;
  /** 軽減税率の対象か */
  reduced: boolean;
}

/** 売上入力の1行 */
interface SaleRow {
  /** シート上の行番号（エラー表示用） */
  rowNumber: number;
  date: string;
  slipNo: string;
  customerName: string;
  productName: string;
  quantity: number;
  /** 特価単価。空欄なら null（標準単価×掛率） */
  specialPrice: number | null;
  note: string;
}

/** 単価・金額を確定させた売上明細 */
interface PricedLine {
  rowNumber: number;
  date: string;
  slipNo: string;
  customerCode: string;
  customerName: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** 税抜金額（円） */
  amount: number;
  taxRate: number;
  reduced: boolean;
  note: string;
}

interface BillingPeriod {
  /** 請求月 "YYYY-MM" */
  month: string;
  start: string;
  end: string;
}

interface TaxBreakdown {
  taxRate: number;
  reduced: boolean;
  /** 税抜の対象額 */
  base: number;
  tax: number;
  gross: number;
}

interface Invoice {
  invoiceNo: string;
  customer: Customer;
  period: BillingPeriod;
  issueDate: string;
  dueDate: string;
  lines: PricedLine[];
  /** 税率の高い順。明細がない税率も 10% と 8% は必ず含める */
  taxes: TaxBreakdown[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

/** 行×列の集計表 */
interface Pivot {
  title: string;
  rowKeys: string[];
  colKeys: string[];
  /** values[i][j] = rowKeys[i] × colKeys[j] */
  values: number[][];
  rowTotals: number[];
  colTotals: number[];
  grandTotal: number;
}

/** マスタ・売上を読み込んだ結果。エラーは行番号付きのメッセージ */
interface ParseResult<T> {
  items: T[];
  errors: string[];
}
