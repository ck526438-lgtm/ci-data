"use strict";
const regions = require("./data/regions.json");
const holidays = require("./data/holidays.json");
const prefixes = require("./data/phone-prefixes.json");

const LEVELS = ["district", "region", "department", "sub_prefecture", "commune"];
const byCode = new Map(regions.map((r) => [r.code, r]));

function filter(list, { level, parent, q, capital } = {}) {
  let out = list;
  if (level) out = out.filter((r) => r.level === level);
  if (parent !== undefined) out = out.filter((r) => r.parent === (parent === null ? null : parent));
  if (capital) out = out.filter((r) => (r.capital || "").toLowerCase().includes(String(capital).toLowerCase()));
  if (q) { const s = String(q).toLowerCase(); out = out.filter((r) => r.name.toLowerCase().includes(s)); }
  return out;
}

const getRegions = (opts = {}) => filter(regions, opts);
const getDistricts = () => regions.filter((r) => r.level === "district");
const getRegion = (code) => byCode.get(code) || null;
const getChildren = (code) => regions.filter((r) => r.parent === code);
const getPath = (code) => {
  const chain = [];
  for (let c = byCode.get(code); c; c = byCode.get(c.parent)) chain.unshift(c);
  return chain.length ? chain : null;
};
function descendantsOf(code, level) {
  const out = [];
  const walk = (p) => { for (const c of regions) if (c.parent === p) { out.push(c); walk(c.code); } };
  if (!byCode.has(code)) return [];
  walk(code);
  return level ? out.filter((r) => r.level === level) : out;
}
// Communes d'une région, d'un district ou d'un département — le cas d'usage n°1 des formulaires.
const getCommunes = (parentCode) => descendantsOf(parentCode, "commune");

function getHolidays(year = new Date().getFullYear()) {
  const y = String(year);
  return holidays.map((h) => ({
    id: h.id, name_fr: h.name_fr, name_en: h.name_en, type: h.type, confidence: h.confidence,
    date: h.type === "fixed" ? `${y}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}` : (h.dates || {})[y] || null,
  })).sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
}

// date : "YYYY-MM-DD" (recommandé) ou objet Date (heure locale)
function isHoliday(date) {
  let iso = date;
  if (date instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    iso = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }
  return getHolidays(iso.slice(0, 4)).find((h) => h.date === iso) || null;
}

const getPhonePrefixes = ({ kind, operator } = {}) =>
  prefixes.filter((p) => (!kind || p.kind === kind) && (!operator || (p.operator || "").toLowerCase().includes(String(operator).toLowerCase())));

// 0711223344 | +225 07 11 22 33 44 | 2120345678 -> entrée de numérotation correspondante
function resolvePhone(number) {
  const raw = String(number || "").replace(/[^0-9]/g, "").replace(/^225/, "");
  const hit = prefixes.flatMap((p) => p.prefixes.map((x) => ({ p, x })))
    .filter(({ x }) => raw.startsWith(x)).sort((a, b) => b.x.length - a.x.length)[0];
  return hit ? { number: raw, matched: hit.x, ...hit.p } : null;
}

module.exports = {
  LEVELS, getRegions, getDistricts, getRegion, getChildren, getPath, getCommunes, descendantsOf,
  getHolidays, isHoliday, getPhonePrefixes, resolvePhone,
};
