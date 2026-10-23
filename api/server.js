// API ci-data — npm install && npm start  (puis http://localhost:3000/v1/regions)
const express = require("express");
const path = require("path");
const pkg = require("../package.json");
const regions = require("../data/regions.json");
const holidays = require("../data/holidays.json");
const prefixes = require("../data/phone-prefixes.json");

const app = express();
const LEVEL_RANK = { district: 0, region: 1, department: 2, sub_prefecture: 3, commune: 4 };
const byCode = new Map(regions.map((r) => [r.code, r]));

app.use((req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); next(); });
app.use("/data", express.static(path.join(__dirname, "..", "data")));

const counts = regions.reduce((a, r) => ({ ...a, [r.level]: (a[r.level] || 0) + 1 }), {});

const holidayOn = (year) => holidays.map((h) => ({
  id: h.id, name_fr: h.name_fr, name_en: h.name_en, type: h.type, confidence: h.confidence,
  date: h.type === "fixed"
    ? `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`
    : (h.dates || {})[String(year)] || null,
}));

// Descendants, tous niveaux confondus (une région → toutes ses communes).
const descendants = (code) => {
  const out = [];
  const walk = (parent) => { for (const c of regions) if (c.parent === parent) { out.push(c); walk(c.code); } };
  walk(code);
  return out;
};

app.get("/", (req, res) => res.json({
  name: pkg.name, version: pkg.version, description: pkg.description,
  documentation: "https://github.com/ck526438-lgtm/ci-data",
  demo: "https://ck526438-lgtm.github.io/ci-data/",
  endpoints: [
    "/v1/meta", "/v1/regions?level=region&parent=CI-LG&q=agbo", "/v1/regions/:code",
    "/v1/regions/:code/children", "/v1/regions/:code/path", "/v1/subdivisions?parent=CI-LG-03&level=commune",
    "/v1/holidays?year=2026", "/v1/holidays/2026", "/v1/phone-prefixes?kind=operator_mobile",
    "/v1/phone-prefixes/resolve?number=0711223344", "/data/regions.json", "/data/csv/regions.csv",
  ],
}));

app.get("/v1/meta", (req, res) => res.json({
  name: pkg.name, version: pkg.version, licence: pkg.license, updated: "2026-10-23",
  counts: { ...counts, holidays: holidays.length, phone_prefixes: prefixes.length },
  levels: Object.keys(LEVEL_RANK),
  code_format: "CI-<district ISO 3166-2>[-<région>[-<département>[-<sous-préfecture|-C<commune>>]]]",
  confidence: { official: "reprise directe de la source amont", derived: "rattachement déduit, à confirmer" },
  sources: ["OCHA/UNOSAT — Cod CIV (humdata)", "INS — RGPH 2021", "ISO 3166-2:CI", "Wikipédia fr", "Wikidata", "ARTCI"],
  datasets: { regions: "/v1/regions", holidays: "/v1/holidays", "phone-prefixes": "/v1/phone-prefixes" },
}));

app.get("/v1/regions", (req, res) => {
  const { level, parent, q, capital } = req.query;
  let out = regions;
  if (level) out = out.filter((r) => r.level === level);
  if (parent !== undefined) out = out.filter((r) => r.parent === (parent === "null" ? null : parent));
  if (capital) out = out.filter((r) => (r.capital || "").toLowerCase().includes(String(capital).toLowerCase()));
  if (q) { const s = String(q).toLowerCase(); out = out.filter((r) => r.name.toLowerCase().includes(s)); }
  res.json(paginate(out, req));
});

app.get("/v1/subdivisions", (req, res) => {
  const { parent, level } = req.query;
  if (!parent) return res.status(400).json({ error: "paramètre parent requis, ex: /v1/subdivisions?parent=CI-LG-03&level=commune" });
  if (!byCode.has(parent)) return res.status(404).json({ error: `parent inconnu : ${parent}` });
  let out = descendants(parent);
  if (level) out = out.filter((r) => r.level === level);
  res.json(paginate(out, req));
});

app.get("/v1/regions/:code/path", (req, res) => {
  const item = byCode.get(req.params.code);
  if (!item) return res.status(404).json({ error: `code inconnu : ${req.params.code}` });
  const chain = [item];
  while (chain[0].parent) { const p = byCode.get(chain[0].parent); if (!p) break; chain.unshift(p); }
  res.json(chain);
});

app.get("/v1/regions/:code/children", (req, res) =>
  res.json(regions.filter((r) => r.parent === req.params.code)));

app.get("/v1/regions/:code", (req, res) => {
  const item = byCode.get(req.params.code);
  item ? res.json(item) : res.status(404).json({ error: `code inconnu : ${req.params.code}` });
});

app.get("/v1/holidays/:year", (req, res) => res.json(holidayOn(Number(req.params.year))));
app.get("/v1/holidays", (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (req.query.date) {
    const hit = holidayOn(Number(String(req.query.date).slice(0, 4))).find((h) => h.date === req.query.date);
    return res.json(hit || null);
  }
  res.json(holidayOn(year));
});

app.get("/v1/phone-prefixes/resolve", (req, res) => {
  const raw = String(req.query.number || "").replace(/[^0-9]/g, "").replace(/^225/, "");
  if (!raw) return res.status(400).json({ error: "paramètre number requis, ex: 0711223344 ou +2250711223344" });
  const hits = prefixes.flatMap((p) => p.prefixes.map((x) => ({ p, x })))
    .filter(({ x }) => raw.startsWith(x))
    .sort((a, b) => b.x.length - a.x.length);
  res.json(hits.length ? { number: raw, matched: hits[0].x, ...hits[0].p } : { number: raw, matched: null, entry: null });
});

app.get("/v1/phone-prefixes", (req, res) => {
  let out = prefixes;
  if (req.query.kind) out = out.filter((p) => p.kind === req.query.kind);
  if (req.query.operator) { const s = String(req.query.operator).toLowerCase(); out = out.filter((p) => (p.operator || "").toLowerCase().includes(s)); }
  res.json(out);
});

app.get("/v1/stats", (req, res) => {
  const districtOf = (r) => { let c = r; while (c && c.level !== "district") c = byCode.get(c.parent); return c; };
  const perDistrict = {};
  for (const r of regions.filter((x) => x.level === "commune")) {
    const d = districtOf(r);
    if (d) perDistrict[d.code] = (perDistrict[d.code] || 0) + 1;
  }
  res.json({ levels: counts, communes_par_district: perDistrict });
});

function paginate(list, req) {
  const limit = req.query.limit ? Number(req.query.limit) : 0;
  const offset = Number(req.query.offset || 0);
  if (!(limit > 0)) return list;
  return { total: list.length, offset, limit, items: list.slice(offset, offset + limit) };
}

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log(`ci-data API sur http://localhost:${port}/v1/meta`));
module.exports = app;
