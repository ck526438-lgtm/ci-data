// Valide les fichiers de données : schémas JSON + intégrité référentielle. Usage : npm run validate
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const root = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const DATASETS = [
  { file: "data/regions.json", schema: "schema.json", idKey: "code" },
  { file: "data/holidays.json", schema: "data/holidays.schema.json", idKey: "id" },
  { file: "data/phone-prefixes.json", schema: "data/phone-prefixes.schema.json", idKey: "id" },
];
const LEVEL_RANK = { district: 0, region: 1, department: 2, sub_prefecture: 3, commune: 4 };
const EXPECTED_MIN = { district: 14, region: 31, department: 100, sub_prefecture: 400, commune: 500 };
// Bounding box de la Côte d'Ivoire (marge 0.5°)
const BOX = { lat: [3.8, 11.3], lng: [-9.1, -2.0] };

let errors = 0;
const fail = (msg) => { errors++; console.error("✗ " + msg); };
const warn = (msg) => console.warn("! " + msg);

for (const { file, schema, idKey } of DATASETS) {
  const data = read(file);
  const validate = ajv.compile(read(schema));
  if (!Array.isArray(data)) fail(`${file} doit être un tableau JSON`);
  const seen = new Map();
  for (const [i, item] of data.entries()) {
    if (!validate(item)) fail(`${file}[${i}] (${item[idKey]}): ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    if (seen.has(item[idKey])) fail(`${file}: ${idKey} dupliqué « ${item[idKey]} » (${seen.get(item[idKey])} et ${i})`);
    else seen.set(item[idKey], i);
  }
  console.log(`✓ ${file} — ${data.length} entrées conformes à ${schema}`);
}

// --- intégrité du découpage administratif ---
const regions = read("data/regions.json");
const byCode = new Map(regions.map((r) => [r.code, r]));
for (const r of regions) {
  if (r.level === "district") { if (r.parent !== null) fail(`${r.code}: un district ne doit pas avoir de parent`); continue; }
  if (!r.parent) { fail(`${r.code} (${r.level}): parent manquant`); continue; }
  const p = byCode.get(r.parent);
  if (!p) { fail(`${r.code}: parent inconnu ${r.parent}`); continue; }
  if (LEVEL_RANK[p.level] >= LEVEL_RANK[r.level]) fail(`${r.code}: parent ${p.code} de niveau ${p.level} (attendu < ${r.level})`);
  for (const k of ["lat", "lng"]) {
    if (r[k] !== null && (r[k] < BOX[k === "lat" ? "lat" : "lng"][0] || r[k] > BOX[k === "lat" ? "lat" : "lng"][1]))
      warn(`${r.code}: ${k}=${r[k]} hors de la bounding box CI`);
  }
}
const counts = regions.reduce((a, r) => ({ ...a, [r.level]: (a[r.level] || 0) + 1 }), {});
for (const [level, min] of Object.entries(EXPECTED_MIN)) {
  if ((counts[level] || 0) < min) fail(`niveau ${level}: ${counts[level] || 0} entrées, attendu ≥ ${min}`);
}
console.log("✓ hiérarchie cohérente —", Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" "));

const derived = regions.filter((r) => r.confidence === "derived").length;
if (derived) console.log(`  dont ${derived} entrées « derived » (rattachement à confirmer, voir data/SOURCES.md)`);

// --- préfixes : un préfixe ne peut pas servir deux opérateurs du même type ---
const prefixes = read("data/phone-prefixes.json");
const used = new Map();
for (const p of prefixes) for (const x of p.prefixes) {
  const key = x + ":" + p.kind;
  if (used.has(key) && p.kind.startsWith("operator")) fail(`préfixe ${x} (${p.kind}) affecté à ${used.get(key)} ET ${p.operator || p.id}`);
  else used.set(key, p.operator || p.id);
}
console.log(`✓ ${prefixes.length} entrées de numérotation, ${used.size} préfixes uniques`);

// --- jours fériés ---
const holidays = read("data/holidays.json");
for (const h of holidays) {
  if (h.type === "fixed" && (!h.month || !h.day)) fail(`${h.id}: fête fixe sans mois/jour`);
  const years = Object.keys(h.dates || {});
  for (const y of years) if (!/^[0-9]{4}$/.test(y) || !h.dates[y].startsWith(y)) fail(`${h.id}: dates[${y}] = ${h.dates[y]} incohérent`);
  if (h.type !== "fixed" && !years.length) fail(`${h.id}: fête mobile sans dates`);
}
console.log(`✓ ${holidays.length} jours fériés (fixes + mobiles)`);

if (errors) { console.error(`\n${errors} erreur(s)`); process.exit(1); }
console.log("\n✓ toutes les vérifications passent");
