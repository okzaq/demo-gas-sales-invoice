const fs = require("fs");
const path = require("path");

// appsscript.json と、ダイアログ用の HTML（src/*.html）を dist/ へ同梱する
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

fs.mkdirSync(distDir, { recursive: true });
const files = ["appsscript.json"].concat(fs.readdirSync(srcDir).filter((f) => f.endsWith(".html")));
for (const f of files) {
  fs.copyFileSync(path.join(srcDir, f), path.join(distDir, f));
  console.log(`src/${f} -> dist/${f}`);
}
