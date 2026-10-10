const fs = require("fs");
const path = require("path");

const env = process.argv[2] || "dev";
const allowed = ["dev", "prod"];
if (!allowed.includes(env)) {
  console.error(`Usage: node ${path.basename(__filename)} <${allowed.join("|")}>`);
  process.exit(1);
}

const root = path.join(__dirname, "..");
const src = path.join(root, `.clasp.${env}.json`);
const dest = path.join(root, ".clasp.json");

if (!fs.existsSync(src)) {
  // postinstall から呼ばれた直後などは未作成でも致命ではないため、警告のみで正常終了する
  console.warn(`Skip: ${path.basename(src)} が見つかりません（.clasp.json.example を参考に作成してください）`);
  process.exit(0);
}

fs.copyFileSync(src, dest);
console.log(`.clasp.${env}.json -> .clasp.json`);
