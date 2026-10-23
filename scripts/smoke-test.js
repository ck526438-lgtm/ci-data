// Tests de non-régression sur les données et l'API (npm test).
const assert = require("assert");
const ci = require("../packages/js");

const checks = [];
const t = (label, fn) => { checks.push([label, fn]); };

t("paquet npm : hiérarchie complète", () => {
  assert.strictEqual(ci.getDistricts().length, 14, "14 districts attendus");
  assert.strictEqual(ci.getRegions({ level: "region" }).length, 31, "31 régions attendues");
  assert.ok(ci.getRegions({ level: "commune" }).length > 500, "au moins 500 communes");
  assert.strictEqual(ci.getRegion("CI-AB").name, "District Autonome d'Abidjan");
});

t("paquet npm : recherche et cascade", () => {
  const abidjan = ci.getCommunes("CI-AB").map((c) => c.name);
  for (const c of ["Cocody", "Abobo", "Yopougon", "Adjamé"]) assert.ok(abidjan.includes(c), `${c} commune d'Abidjan`);
  assert.deepStrictEqual(ci.getPath("CI-AB-01").map((n) => n.level), ["district", "department"]);
  assert.ok(ci.getRegions({ q: "agbovi" }).length >= 1);
});

t("paquet npm : jours fériés", () => {
  assert.strictEqual(ci.isHoliday("2026-08-07").id, "independence-day");
  assert.strictEqual(ci.isHoliday("2026-08-08"), null);
  const y = ci.getHolidays(2026);
  assert.strictEqual(y.find((h) => h.id === "easter-monday").date, "2026-04-06");
  assert.ok(y.every((h) => h.date), "toutes les fêtes 2026 ont une date");
});

t("paquet npm : numérotation", () => {
  assert.strictEqual(ci.resolvePhone("+225 07 11 22 33 44").operator, "Orange Côte d'Ivoire");
  assert.strictEqual(ci.resolvePhone("0500112233").operator, "MTN Côte d'Ivoire");
  assert.strictEqual(ci.resolvePhone("185").service, "SAMU — aide médicale urgente");
  assert.strictEqual(ci.getPhonePrefixes({ kind: "geographic_zone" }).length, 12);
});

(async () => {
  const app = require("../api/server");
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
  t("API : endpoints", async () => {
    assert.strictEqual((await get("/v1/regions?level=district")).body.length, 14);
    assert.strictEqual((await get("/v1/regions/CI-LG")).body.name, "District des Lagunes");
    assert.strictEqual((await get("/v1/regions/CI-MG/path")).body[0].code, "CI-MG");
    assert.strictEqual((await get("/v1/regions/CI-XX")).status, 404);
    assert.ok((await get("/v1/subdivisions?parent=CI-AB&level=commune")).body.length >= 13);
    assert.ok((await get("/v1/holidays?year=2027")).body.some((h) => h.date && h.date.startsWith("2027")));
    assert.strictEqual((await get("/v1/holidays?date=2026-12-25")).body.id, "christmas");
    assert.strictEqual((await get("/v1/phone-prefixes/resolve?number=0100112233")).body.operator, "Moov Africa Côte d'Ivoire");
    assert.ok((await get("/v1/meta")).body.counts.commune > 500);
    assert.ok((await get("/v1/stats")).body.communes_par_district["CI-AB"] >= 13);
    assert.strictEqual((await get("/v1/subdivisions")).status, 400);
  });

  let failed = 0;
  for (const [label, fn] of checks) {
    try { await fn(); console.log("✓", label); }
    catch (e) { failed++; console.error("✗", label, "→", e.message); }
  }
  server.close();
  console.log(failed ? `\n${failed} test(s) en échec` : `\n✓ ${checks.length} tests passés`);
  process.exit(failed ? 1 : 0);
})();
