/**
 * GASグローバルオブジェクトのモック。
 * jest.config.js の setupFiles で読み込まれ、GAS固有のグローバルを定義する。
 *
 * src/ の各ファイルは GAS 上ではファイル連結で1つのスコープになるため export を持たない。
 * テストから参照できるよう、各ファイル末尾で module.exports している定数・関数を
 * ここでグローバルへ展開する（ファイルをまたいだ呼び出しが GAS と同じように解決される）。
 * ファイルを増やしたらここに追記する。
 */
const modules = [
  require("../../src/config"),
  require("../../src/dates"),
  require("../../src/rounding"),
  require("../../src/period"),
  require("../../src/master"),
  require("../../src/invoice"),
  require("../../src/invoice-view"),
  require("../../src/summary"),
  require("../../src/demo-data"),
];
modules.forEach((m) => Object.assign(global as any, m));

// SpreadsheetApp 等の GAS グローバルは直接モックしない。
// 計算はすべて GAS 非依存の純粋関数に寄せ、シート操作（sheets.ts / pdf.ts / setup.ts / main.ts）は薄く保つ方針。
