/**
 * シートの値（getValues() の2次元配列）を型付きのデータに変換する（純粋関数）。
 * 入力ミスは例外にせず、行番号付きのメッセージを errors に集めて画面にまとめて出す。
 * 空行は読み飛ばす。
 */

/** Date を "YYYY-MM-DD" にする関数。GAS では Utilities.formatDate を使ったものを渡す */
type DateFormatter = (d: Date) => string;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((v) => cellText(v) === "");
}

/** 数値セル。"1,200" のような文字列も受ける。空欄は null、数値でなければ NaN */
function cellNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  const text = cellText(v).replace(/,/g, "");
  if (text === "") return null;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

/** 日付セル。Date オブジェクト、または "2026-09-01" / "2026/9/1" 形式の文字列。空欄は null */
function cellDate(v: unknown, formatDate: DateFormatter): string | null {
  if (v instanceof Date) return formatDate(v);
  const text = cellText(v);
  if (text === "") return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (!m) throw new Error(`日付として読めません: ${text}`);
  const ymd = toYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  parseYmd(ymd); // 存在しない日付なら例外
  return ymd;
}

/** "標準10%" / "軽減8%" など → 税率 */
function parseTaxCategory(label: unknown): { taxRate: number; reduced: boolean } {
  const text = cellText(label).replace(/％/g, "%");
  if (/^(標準)?\s*10\s*%?$/.test(text)) return { taxRate: 10, reduced: false };
  if (/^(軽減)?\s*8\s*%?\s*(軽減)?$/.test(text) || text === "軽減税率") return { taxRate: 8, reduced: true };
  throw new Error(`税率区分は「標準10%」「軽減8%」のいずれかです: ${text}`);
}

function parseCustomerRows(values: unknown[][], firstRow = 2): ParseResult<Customer> {
  const items: Customer[] = [];
  const errors: string[] = [];
  const codes: { [k: string]: number } = {};
  const names: { [k: string]: number } = {};
  const sheet = CONFIG.SHEETS.CUSTOMERS;

  values.forEach((row, i) => {
    const rowNumber = firstRow + i;
    if (isBlankRow(row)) return;
    const where = `${sheet} ${rowNumber}行目`;
    try {
      const code = cellText(row[0]);
      const name = cellText(row[1]);
      if (!code) throw new Error("取引先コードが空です");
      if (!name) throw new Error("取引先名が空です");
      if (codes[code]) throw new Error(`取引先コード「${code}」が${codes[code]}行目と重複しています`);
      if (names[name]) throw new Error(`取引先名「${name}」が${names[name]}行目と重複しています`);
      const rate = cellNumber(row[6]);
      if (rate === null || isNaN(rate) || rate <= 0 || rate > 2) {
        throw new Error(`掛率は 0 より大きく 2 以下の数値で入力してください（例: 0.85）: ${cellText(row[6])}`);
      }
      const customer: Customer = {
        code,
        name,
        honorific: cellText(row[2]) || "御中",
        postalCode: cellText(row[3]),
        address: cellText(row[4]),
        contact: cellText(row[5]),
        rate,
        closingDay: parseDayOfMonth(row[7]),
        paymentMonthOffset: parsePaymentMonth(row[8]),
        paymentDay: parseDayOfMonth(row[9]),
        priceRounding: parseRoundingMode(cellText(row[10])),
        taxRounding: parseRoundingMode(cellText(row[11])),
      };
      codes[code] = rowNumber;
      names[name] = rowNumber;
      items.push(customer);
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  });
  return { items, errors };
}

function parseProductRows(values: unknown[][], firstRow = 2): ParseResult<Product> {
  const items: Product[] = [];
  const errors: string[] = [];
  const codes: { [k: string]: number } = {};
  const names: { [k: string]: number } = {};
  const sheet = CONFIG.SHEETS.PRODUCTS;

  values.forEach((row, i) => {
    const rowNumber = firstRow + i;
    if (isBlankRow(row)) return;
    const where = `${sheet} ${rowNumber}行目`;
    try {
      const code = cellText(row[0]);
      const name = cellText(row[1]);
      if (!code) throw new Error("商品コードが空です");
      if (!name) throw new Error("商品名が空です");
      if (codes[code]) throw new Error(`商品コード「${code}」が${codes[code]}行目と重複しています`);
      if (names[name]) throw new Error(`商品名「${name}」が${names[name]}行目と重複しています`);
      const price = cellNumber(row[3]);
      if (price === null || isNaN(price) || price < 0) {
        throw new Error(`標準単価は 0 以上の数値で入力してください: ${cellText(row[3])}`);
      }
      const tax = parseTaxCategory(row[4]);
      codes[code] = rowNumber;
      names[name] = rowNumber;
      items.push({ code, name, unit: cellText(row[2]), price, taxRate: tax.taxRate, reduced: tax.reduced });
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  });
  return { items, errors };
}

/** 売上入力の A〜G 列（日付, 伝票No, 取引先, 商品, 数量, 特価単価, 備考）を読む */
function parseSalesRows(values: unknown[][], formatDate: DateFormatter, firstRow = 2): ParseResult<SaleRow> {
  const items: SaleRow[] = [];
  const errors: string[] = [];
  const sheet = CONFIG.SHEETS.SALES;

  values.forEach((row, i) => {
    const rowNumber = firstRow + i;
    const inputCells = row.slice(0, CONFIG.SALES_INPUT_COLUMNS);
    if (isBlankRow(inputCells)) return;
    const where = `${sheet} ${rowNumber}行目`;
    try {
      const date = cellDate(row[0], formatDate);
      if (!date) throw new Error("日付が空です");
      const customerName = cellText(row[2]);
      const productName = cellText(row[3]);
      if (!customerName) throw new Error("取引先が空です");
      if (!productName) throw new Error("商品が空です");
      const quantity = cellNumber(row[4]);
      if (quantity === null || isNaN(quantity) || quantity === 0) {
        throw new Error(`数量は 0 以外の数値で入力してください（返品はマイナス）: ${cellText(row[4])}`);
      }
      const special = cellNumber(row[5]);
      if (special !== null && (isNaN(special) || special < 0)) {
        throw new Error(`特価単価は 0 以上の数値で入力してください: ${cellText(row[5])}`);
      }
      items.push({
        rowNumber,
        date,
        slipNo: cellText(row[1]),
        customerName,
        productName,
        quantity,
        specialPrice: special,
        note: cellText(row[6]),
      });
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  });
  return { items, errors };
}

if (typeof module !== "undefined") {
  module.exports = {
    cellText,
    isBlankRow,
    cellNumber,
    cellDate,
    parseTaxCategory,
    parseCustomerRows,
    parseProductRows,
    parseSalesRows,
  };
}
