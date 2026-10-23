// Copie les données dans le package npm avant publication (npm run sync).
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "data");
const dst = path.join(__dirname, "..", "packages", "js", "data");
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (f.endsWith(".json") && !f.endsWith(".schema.json")) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log("✓ données copiées dans packages/js/data");
