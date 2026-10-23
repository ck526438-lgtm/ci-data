// Régénère les exports CSV à partir des JSON (npm run csv). Les CSV sont commités pour être
// consommables directement (Excel, Google Sheets, pandas, PostgreSQL \copy).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "csv");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const esc = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (rows, columns) =>
  columns.join(",") + "\r\n" + rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\r\n") + "\r\n";

fs.mkdirSync(OUT, { recursive: true });

const regions = read("data/regions.json");
fs.writeFileSync(path.join(OUT, "regions.csv"), toCsv(regions,
  ["code", "name", "level", "parent", "capital", "lat", "lng", "area_km2", "population", "confidence", "source"]));

const holidays = read("data/holidays.json");
const years = [...new Set(holidays.flatMap((h) => Object.keys(h.dates || {})))].sort();
const long = [];
for (const y of years) for (const h of holidays) {
  const date = h.type === "fixed"
    ? `${y}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`
    : (h.dates || {})[y] || null;
  if (date) long.push({ id: h.id, name_fr: h.name_fr, name_en: h.name_en, type: h.type, year: y, date, confidence: h.confidence });
}
long.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(path.join(OUT, "holidays.csv"), toCsv(long, ["id", "name_fr", "name_en", "type", "year", "date", "confidence"]));

const prefixes = read("data/phone-prefixes.json").flatMap((p) =>
  p.prefixes.map((x) => ({ id: p.id, kind: p.kind, prefix: x, operator: p.operator || "", zone: p.zone || "", service: p.service || "", source: p.source })));
fs.writeFileSync(path.join(OUT, "phone-prefixes.csv"), toCsv(prefixes, ["id", "kind", "prefix", "operator", "zone", "service", "source"]));

console.log(`✓ data/csv/regions.csv (${regions.length}), holidays.csv (${long.length}), phone-prefixes.csv (${prefixes.length})`);
