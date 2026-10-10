/**
 * 請求書データ → 請求書シートに書く値（純粋関数）。
 * 「どのセルに何を書くか」をここで決め、sheets.ts は受け取った値をそのまま書くだけにする。
 */

interface InvoiceSheetModel {
  /** A1形式のセル → 値 */
  cells: { [a1: string]: string | number };
  /** [行番号, 税抜, 消費税, 税込] */
  taxRows: [number, number, number, number][];
  /** 明細行（日付, 伝票No, 品名, 数量, 単位, 単価, 金額, 税率） */
  details: (string | number)[][];
}

function invoiceToSheetModel(invoice: Invoice, company: Company): InvoiceSheetModel {
  const L = CONFIG.INVOICE_LAYOUT;
  const c = invoice.customer;
  const cells: { [a1: string]: string | number } = {};
  cells[L.INVOICE_NO] = invoice.invoiceNo;
  cells[L.ISSUE_DATE] = formatJpDate(invoice.issueDate);
  cells[L.RECIPIENT] = `${c.name} ${c.honorific}`;
  cells[L.RECIPIENT_ADDRESS] = [c.postalCode ? `〒${c.postalCode}` : "", c.address].filter((s) => s).join(" ");
  cells[L.RECIPIENT_CONTACT] = c.contact ? `ご担当: ${c.contact} 様` : "";
  cells[L.ISSUER_NAME] = company.name;
  cells[L.ISSUER_ADDRESS] = `〒${company.postalCode} ${company.address}`;
  cells[L.ISSUER_TEL] = `TEL ${company.tel}`;
  cells[L.ISSUER_REG_NO] = `登録番号 ${company.registrationNo}`;
  cells[L.TOTAL] = invoice.total;
  cells[L.PERIOD] =
    `${formatJpDate(invoice.period.start)}〜${formatJpDate(invoice.period.end)}` +
    `（${formatDayOfMonth(c.closingDay)}締め）`;
  cells[L.DUE_DATE] = formatJpDate(invoice.dueDate);
  cells[L.BANK] = company.bank;

  const taxRows: [number, number, number, number][] = [];
  invoice.taxes.forEach((t) => {
    const row = L.TAX_ROWS[t.taxRate];
    if (row) taxRows.push([row, t.base, t.tax, t.gross]);
  });
  taxRows.push([L.TAX_TOTAL_ROW, invoice.subtotal, invoice.taxTotal, invoice.total]);

  const details = invoice.lines.map((l) => [
    formatShortDate(l.date),
    l.slipNo,
    l.productName + (l.reduced ? " ※" : "") + (l.note ? `（${l.note}）` : ""),
    l.quantity,
    l.unit,
    l.unitPrice,
    l.amount,
    `${l.taxRate}%`,
  ]);

  return { cells, taxRows, details };
}

/** Drive に保存する PDF のファイル名（ファイル名に使えない記号は全角に置き換える） */
function invoiceFileName(invoice: Invoice): string {
  const safe = invoice.customer.name.replace(/[\\/:*?"<>|]/g, "＿");
  return `請求書_${invoice.invoiceNo}_${safe}.pdf`;
}

if (typeof module !== "undefined") {
  module.exports = { invoiceToSheetModel, invoiceFileName };
}
