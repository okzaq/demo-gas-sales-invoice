/**
 * アプリ設定。GAS 上ではファイル連結で1スコープになるため export しない。
 * テストからは末尾の module.exports 経由で参照する（tests/__mocks__/gas.ts が global へ展開する）。
 *
 * シート名・列の並び・請求書テンプレートのセル位置はすべてここに集約する。
 * 実案件では「今の Excel の見た目」に合わせてこのファイルを直せばよい構造にしている。
 */
const CONFIG = {
  TIME_ZONE: "Asia/Tokyo",

  SHEETS: {
    CUSTOMERS: "取引先マスタ",
    PRODUCTS: "商品マスタ",
    SALES: "売上入力",
    INVOICE_TEMPLATE: "請求書テンプレート",
    INVOICE: "請求書",
    SUMMARY: "月次集計",
  },

  /** 各シートの見出し（1行目）。列の並びはこの順で固定。 */
  HEADERS: {
    CUSTOMERS: [
      "取引先コード",
      "取引先名",
      "敬称",
      "郵便番号",
      "住所",
      "ご担当者",
      "掛率",
      "締め日",
      "支払月",
      "支払日",
      "単価端数",
      "消費税端数",
    ],
    PRODUCTS: ["商品コード", "商品名", "単位", "標準単価（税抜）", "税率区分"],
    SALES: [
      "日付",
      "伝票No",
      "取引先",
      "商品",
      "数量",
      "特価単価（任意）",
      "備考",
      "適用単価（自動）",
      "金額・税抜（自動）",
      "税率（自動）",
    ],
  },

  /** 売上入力シート: 手入力する列数（A〜G）と、自動計算の最初の列（H） */
  SALES_INPUT_COLUMNS: 7,
  SALES_CALC_COLUMN: 8,

  /** プルダウンの選択肢 */
  CHOICES: {
    HONORIFIC: ["御中", "様"],
    CLOSING_DAY: ["5日", "10日", "15日", "20日", "25日", "末日"],
    PAYMENT_MONTH: ["当月", "翌月", "翌々月"],
    PAYMENT_DAY: ["5日", "10日", "15日", "20日", "25日", "末日"],
    ROUNDING: ["切り捨て", "四捨五入", "切り上げ"],
    TAX_CATEGORY: ["標準10%", "軽減8%"],
  },

  /** 請求書テンプレートのセル位置。テンプレートの見た目を変えたらここも合わせる */
  INVOICE_LAYOUT: {
    COLUMNS: 8,
    INVOICE_NO: "G3",
    ISSUE_DATE: "G4",
    RECIPIENT: "A3",
    RECIPIENT_ADDRESS: "A4",
    RECIPIENT_CONTACT: "A5",
    ISSUER_NAME: "E6",
    ISSUER_ADDRESS: "E7",
    ISSUER_TEL: "E8",
    ISSUER_REG_NO: "E9",
    TOTAL: "B8",
    PERIOD: "B9",
    DUE_DATE: "B10",
    BANK: "B11",
    /** 税率別内訳の行（税率→行番号）と列 */
    TAX_ROWS: { 10: 14, 8: 15 } as { [rate: number]: number },
    TAX_TOTAL_ROW: 16,
    TAX_COL_BASE: 4, // D
    TAX_COL_TAX: 6, // F
    TAX_COL_GROSS: 7, // G
    /** 明細: 最初の行と、テンプレートに罫線付きで用意してある行数（超えたら行を挿入） */
    DETAIL_FIRST_ROW: 19,
    DETAIL_TEMPLATE_ROWS: 15,
  },

  /** PDF の保存先（スプレッドシートと同じフォルダの下に作る） */
  OUTPUT_FOLDER_NAME: "請求書PDF",

  /** PDF エクスポートの連続呼び出しで 429 を避けるための待ち時間（ミリ秒）と再試行回数 */
  EXPORT_INTERVAL_MS: 1500,
  EXPORT_MAX_RETRY: 4,
} as const;

/**
 * 請求書に載せる自社（発行元）の情報。デモでは架空の会社。
 * 登録番号は明らかなダミー値（T + 0 が13桁）。
 */
const COMPANY: Company = {
  name: "サンプル食品卸株式会社",
  postalCode: "000-0000",
  address: "架空県見本市中央1-2-3 見本ビル4F",
  tel: "000-000-0000",
  registrationNo: "T0000000000000",
  bank: "見本銀行 中央支店 普通 0000000 サンプルショクヒンオロシ（カ",
};

// GAS ランタイムには module が無いので、テスト実行時のみ評価される
if (typeof module !== "undefined") {
  module.exports = { CONFIG, COMPANY };
}
