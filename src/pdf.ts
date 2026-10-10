/**
 * 請求書シートを PDF にして Google ドライブに保存する（GAS 依存の薄い層）。
 *
 * スプレッドシートの「ダウンロード > PDF」と同じエクスポート URL を、スクリプトの
 * OAuth トークン付きで UrlFetchApp から呼ぶ。連続で呼ぶと 429（Too Many Requests）が
 * 返ることがあるため、間隔をあけ、429 のときは待ち時間を延ばして再試行する。
 */

/** 保存先: スプレッドシートと同じフォルダ / 請求書PDF / 2026-09 */
function getOutputFolder(month: string): GoogleAppsScript.Drive.Folder {
  const file = DriveApp.getFileById(getSpreadsheet().getId());
  const parents = file.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  return getOrCreateFolder(getOrCreateFolder(parent, CONFIG.OUTPUT_FOLDER_NAME), month);
}

function getOrCreateFolder(parent: GoogleAppsScript.Drive.Folder, name: string): GoogleAppsScript.Drive.Folder {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function exportSheetAsPdf(sheet: GoogleAppsScript.Spreadsheet.Sheet, fileName: string): GoogleAppsScript.Base.Blob {
  SpreadsheetApp.flush(); // 書き込んだ値を確定させてからエクスポートする
  const ss = getSpreadsheet();
  // テンプレートは使う行・列だけに削ってあるので、空の罫線行も含めて全体を出す
  const lastRow = sheet.getMaxRows();
  const lastCol = String.fromCharCode(64 + CONFIG.INVOICE_LAYOUT.COLUMNS);
  const params: { [k: string]: string } = {
    format: "pdf",
    gid: String(sheet.getSheetId()),
    range: `A1:${lastCol}${lastRow}`,
    size: "A4",
    portrait: "true",
    fitw: "true",
    gridlines: "false",
    printtitle: "false",
    sheetnames: "false",
    pagenum: "CENTER",
    fzr: "false",
    top_margin: "0.6",
    bottom_margin: "0.6",
    left_margin: "0.5",
    right_margin: "0.5",
    horizontal_alignment: "CENTER",
  };
  const query = Object.keys(params)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?${query}`;

  for (let attempt = 0; ; attempt++) {
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) return res.getBlob().setName(fileName);
    if (code === 429 && attempt < CONFIG.EXPORT_MAX_RETRY) {
      Utilities.sleep(CONFIG.EXPORT_INTERVAL_MS * Math.pow(2, attempt + 1));
      continue;
    }
    throw new Error(`PDF の作成に失敗しました（HTTP ${code}）`);
  }
}

/**
 * 同じ名前の PDF があればゴミ箱へ移してから保存する（同じ月・取引先の再発行で上書きする動き）。
 * ゴミ箱からは30日間元に戻せる。
 */
function savePdf(folder: GoogleAppsScript.Drive.Folder, blob: GoogleAppsScript.Base.Blob): GoogleAppsScript.Drive.File {
  const name = blob.getName() || "請求書.pdf";
  const existing = folder.getFilesByName(name);
  while (existing.hasNext()) existing.next().setTrashed(true);
  return folder.createFile(blob);
}
