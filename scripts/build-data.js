// Régénère data/regions.json à partir des sources amont (OCHA/humdata, Wikipédia, Wikidata).
// Usage : npm run build   (réseau requis ; les téléchargements sont mis en cache dans .cache/)
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const YEAR = new Date().toISOString().slice(0, 10);

const SOURCES = {
  ocha: "https://data.humdata.org/dataset/503a9167-ba56-4174-b160-bdb0fb703719/resource/321e55d2-3486-400a-a855-4b749cf9ef88/download/civ_admin_boundaries.geojson.zip",
  pop2: "https://data.humdata.org/dataset/53d768e8-7a66-438c-abcb-8393fa74adf8/resource/ac365c06-3d22-4b0d-9890-fc2613ab2b2e/download/civ_admpop_adm2_v2.csv",
  pop3: "https://data.humdata.org/dataset/53d768e8-7a66-438c-abcb-8393fa74adf8/resource/c49a74aa-9630-4755-9184-b0e5cafa092c/download/civ_admpop_adm3_v2.csv",
  regions: "https://fr.wikipedia.org/w/index.php?title=" + encodeURIComponent("Régions de Côte d'Ivoire") + "&action=raw",
  districts: "https://fr.wikipedia.org/w/index.php?title=" + encodeURIComponent("Districts de Côte d'Ivoire") + "&action=raw",
  communes: "https://query.wikidata.org/sparql",
  communeQuery: `SELECT ?item ?itemLabel ?dept ?deptLabel ?coords ?pop WHERE {
  ?item wdt:P31 wd:Q2679157 ; wdt:P131 ?dept .
  OPTIONAL { ?dept wdt:P131 ?parent } OPTIONAL { ?item wdt:P625 ?coords } OPTIONAL { ?item wdt:P1082 ?pop }
  FILTER NOT EXISTS { ?dept wdt:P31 wd:Q2679157 }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
} LIMIT 8000`,
  // Bouaké, Daloa ou Korhogo ne sont pas typées « commune de Côte d'Ivoire » dans Wikidata : on récupère aussi
  // les agglomérations du pays, dont on ne garde que celles qui portent le nom d'un chef-lieu.
  cityQuery: `SELECT ?item ?itemLabel ?dept ?deptLabel ?coords ?pop WHERE {
  VALUES ?class { wd:Q515 wd:Q1549591 wd:Q486972 }
  ?item wdt:P31 ?class ; wdt:P17 wd:Q1008 ; wdt:P131 ?dept .
  OPTIONAL { ?item wdt:P625 ?coords } OPTIONAL { ?item wdt:P1082 ?pop }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
} LIMIT 20000`,
};

// Codes ISO 3166-2:CI des 14 districts (les régions ne sont plus codées par l'ISO depuis 2013).
const DISTRICT_ISO = {
  Abidjan: "CI-AB", Yamoussoukro: "CI-YM", "Bas-Sassandra": "CI-BS", Comoé: "CI-CM",
  Denguélé: "CI-DN", "Gôh-Djiboua": "CI-GD", Lacs: "CI-LC", Lagunes: "CI-LG",
  Montagnes: "CI-MG", "Sassandra-Marahoué": "CI-SM", Savanes: "CI-SV",
  "Vallée du Bandama": "CI-VB", Woroba: "CI-WR", Zanzan: "CI-ZZ",
};

// Libellé officiel quand aucun article Wikipédia ne le porte (décret n°2011-263 du 28 sept. 2011).
const DISTRICT_LABEL = { Zanzan: "District du Zanzan" };

const stripAccents = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
const norm = (s) => {
  let t = stripAccents(String(s).toLowerCase()).replace(/['’ʼ]/g, " ");
  t = t.replace(/^(ville|commune|region|district|departement|sous[- ]?prefecture) (de|du|des|d|la|le|les) /, "");
  for (let i = 0; i < 3; i++) t = t.replace(/^(de|du|des|la|le|les) /, "");
  return t.replace(/[^a-z0-9]/g, "");
};

async function cached(key, ext, fetcher) {
  const file = path.join(CACHE, key + ext);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(CACHE, { recursive: true });
  const body = await fetcher();
  fs.writeFileSync(file, body);
  return file;
}

const getText = (url) => fetch(url, { headers: { "User-Agent": `ci-data build (${YEAR})` } }).then((r) => {
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
});

function wikiCells(row) {
  return row.replace(/\|\|/g, "\n|").split(/\n/).filter((l) => /^\s*\|/.test(l))
    .map((l) => l.replace(/^\s*\|/, "").replace(/^rowspan="\d+"\s*\|/, "").trim())
    .map((c) => c.replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^/]*\/>/g, "").replace(/\{\{[^}]*\}\}/g, ""))
    .map((c) => { const m = c.match(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/); return (m ? m[1] : c).replace(/'{2,}/g, "").replace(/[_]/g, " ").trim(); })
    .filter((c) => c && c !== "__" && !/^—|-{1,2}$/.test(c));
}

function parseRegionsTable(wikitext) {
  const start = wikitext.indexOf('!scope="col"| District');
  const rows = wikitext.slice(start).split(/\n\|-\n/);
  const out = [];
  let district = null, districtCapital = null;
  for (const row of rows) {
    const cells = wikiCells(row);
    const popIdx = cells.findIndex((c) => /^[\d\s]+$/.test(c) && c.replace(/\D/g, "").length >= 4);
    if (popIdx < 0) continue;
    const population = Number(cells[popIdx].replace(/\D/g, ""));
    if (popIdx === 1) { // district autonome : [Abidjan, population]
      out.push({ district: cells[0], districtCapital: cells[0], region: null, capital: null, population, autonomous: true });
      continue;
    }
    const offset = popIdx - 2; // président en dernier, population avant
    const region = cells[offset]; const capital = cells[offset + 1];
    if (offset >= 2) { district = cells[0]; districtCapital = cells[1]; }
    if (!region) continue;
    out.push({ district, districtCapital, region, capital, population, autonomous: false });
  }
  return out;
}

function parseCsv(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^/, "").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
}

(async () => {
  // --- téléchargements (cache .cache/) ---
  const zipFile = await cached("civ_admin_boundaries", ".zip", () =>
    fetch(SOURCES.ocha).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)));
  const zip = new AdmZip(zipFile);
  const readGeo = (name) => JSON.parse(zip.readAsText(name));

  const pop2file = await cached("civ_admpop_adm2", ".csv", () => getText(SOURCES.pop2));
  const pop3file = await cached("civ_admpop_adm3", ".csv", () => getText(SOURCES.pop3));
  const regionsWiki = await cached("regions_wikipedia", ".wiki", () => getText(SOURCES.regions));
  const districtsWiki = await cached("districts_wikipedia", ".wiki", () => getText(SOURCES.districts));
  const wdFile = await cached("wikidata_communes", ".json", () =>
    getText(SOURCES.communes + "?format=json&query=" + encodeURIComponent(SOURCES.communeQuery)));
  const cityFile = await cached("wikidata_cities", ".json", () =>
    getText(SOURCES.communes + "?format=json&query=" + encodeURIComponent(SOURCES.cityQuery)));

  const geo = (name) => {
    const entry = zip.getEntries().find((e) => e.entryName === name);
    if (!entry) throw new Error(name + " absent de l'archive OCHA");
    return JSON.parse(zip.readAsText(entry)).features.map((f) => f.properties);
  };
  const adm1 = geo("civ_admin1.geojson");
  const adm2 = geo("civ_admin2.geojson");
  const adm3 = geo("civ_admin3.geojson");
  const capitals = geo("civ_admincapitals.geojson");
  const by1 = Object.fromEntries(adm1.map((p) => [p.adm1_pcode, p]));
  const by2 = Object.fromEntries(adm2.map((p) => [p.adm2_pcode, p]));
  const popOf = (file, key) => Object.fromEntries(parseCsv(file).map((r) => [r[key], Number(r.T_TL)]));
  const pop2 = popOf(pop2file, "ADM2_PCODE"), pop3 = popOf(pop3file, "ADM3_PCODE");
  const capOf = {};
  for (const c of capitals) {
    if (c.adm_p_lvl === 1 && c.adm1_pcode) capOf[c.adm1_pcode] = capOf[c.adm1_pcode] || c;
    if (c.adm_p_lvl === 2 && c.adm2_pcode) capOf[c.adm2_pcode] = capOf[c.adm2_pcode] || c;
  }

  // --- régions + districts (noms accentués, chef-lieux, population RGPH 2021) ---
  const wikiRows = parseRegionsTable(fs.readFileSync(regionsWiki, "utf8"));
  const regionByName = {}; const districts = {};
  for (const r of wikiRows) {
    if (r.autonomous) { districts[r.district] = { capital: r.districtCapital, population: r.population }; continue; }
    regionByName[norm(r.region)] = r;
    (districts[r.district] = districts[r.district] || { capital: r.districtCapital, population: 0 }).population += r.population;
  }
  const officialDistrict = {};
  for (const m of fs.readFileSync(districtsWiki, "utf8").matchAll(/\[\[(District (?:de la|du|des|d') [^\]|]+)\|/gi)) {
    const label = m[1][0].toUpperCase() + m[1].slice(1);
    officialDistrict[norm(label)] = label;
  }
  const districtName = (d) => officialDistrict[norm("District de " + d)] || DISTRICT_LABEL[d] || "District de " + d;

  const missingIso = Object.keys(districts).filter((d) => !DISTRICT_ISO[d]);
  if (missingIso.length) throw new Error("District sans code ISO connu : " + missingIso.join(", "));

  // --- hiérarchie OCHA (pcodes, centroïdes, surfaces) ---
  const isoByAdm1 = {}; // CI03 -> { code: 'CI-LG-03', districtCode: 'CI-LG' }
  const nodes = [];
  const num = (pcode) => pcode.replace(/\D/g, "").slice(-2);
  for (const p of adm1) {
    const n = num(p.adm1_pcode);
    const w = regionByName[norm(p.adm1_name)];
    if (!w) continue; // districts autonomes traités ci-dessous
    const districtCode = DISTRICT_ISO[w.district];
    isoByAdm1[p.adm1_pcode] = { regionCode: `${districtCode}-${n}`, districtCode };
    nodes.push({
      code: `${districtCode}-${n}`, name: w.region, level: "region", parent: districtCode,
      capital: w.capital, lat: rnd(p.center_lat), lng: rnd(p.center_lon), area_km2: rnd(p.area_sqkm, 1),
      population: w.population, confidence: "official",
      source: `Wikipédia (RGPH 2021, INS) + OCHA COD CIV ADM1 ${p.adm1_pcode}`,
    });
  }
  for (const p of adm1) {
    if (p.adm1_pcode !== "CI01" && p.adm1_pcode !== "CI02") continue;
    const code = p.adm1_pcode === "CI01" ? "CI-AB" : "CI-YM";
    isoByAdm1[p.adm1_pcode] = { regionCode: code, districtCode: code };
    const d = districts[code === "CI-AB" ? "Abidjan" : "Yamoussoukro"] || {};
    nodes.push({
      code, name: code === "CI-AB" ? "District Autonome d'Abidjan" : "District Autonome de Yamoussoukro",
      level: "district", parent: null, capital: code === "CI-AB" ? "Abidjan" : "Yamoussoukro",
      lat: rnd(p.center_lat), lng: rnd(p.center_lon), area_km2: rnd(p.area_sqkm, 1),
      population: d.population || null, confidence: "official",
      source: `ISO 3166-2:CI + OCHA COD CIV ADM1 ${p.adm1_pcode} + INS RGPH 2021`,
    });
  }
  for (const d of Object.keys(districts)) {
    const code = DISTRICT_ISO[d];
    if (code === "CI-AB" || code === "CI-YM") continue;
    const seat = nodes.find((n) => n.level === "region" && n.parent === code && n.capital === districts[d].capital);
    nodes.push({
      code, name: districtName(d), level: "district", parent: null, capital: districts[d].capital,
      lat: seat ? seat.lat : null, lng: seat ? seat.lng : null,
      population: districts[d].population || null, confidence: "official",
      source: `ISO 3166-2:CI + décret 2011-263 (via Wikipédia) + INS RGPH 2021`,
    });
  }

  for (const p of adm2) {
    const parent = isoByAdm1[p.adm1_pcode];
    if (!parent) continue;
    const code = `${parent.regionCode}-${num(p.adm2_pcode)}`;
    const cap = capOf[p.adm2_pcode];
    parent.deptCode = parent.deptCode || {};
    parent.deptCode[norm(p.adm2_name)] = code;
    nodes.push({
      code, name: p.adm2_name, level: "department", parent: parent.regionCode,
      capital: cap ? cap.name : null,
      lat: cap ? rnd(Number(cap.y_coord)) : rnd(p.center_lat), lng: cap ? rnd(Number(cap.x_coord)) : rnd(p.center_lon),
      area_km2: rnd(p.area_sqkm, 1), population: pop2[p.adm2_pcode] ?? null, confidence: "official",
      source: `OCHA COD CIV ADM2 ${p.adm2_pcode} + INS/RGPH projections (humdata)`,
    });
  }
  const subPrefCodes = {}; // variante d'orthographe OCHA <-> Wikidata + repli sur la sous-préfecture homonyme
  for (const p of adm3) {
    const parent = isoByAdm1[p.adm1_pcode];
    const deptCode = parent && parent.deptCode && parent.deptCode[norm(p.adm2_name)];
    if (!deptCode) continue;
    subPrefCodes[norm(p.adm3_name)] = `${deptCode}-${num(p.adm3_pcode)}`;
    nodes.push({
      code: `${deptCode}-${num(p.adm3_pcode)}`, name: p.adm3_name, level: "sub_prefecture", parent: deptCode,
      lat: rnd(p.center_lat), lng: rnd(p.center_lon), area_km2: rnd(p.area_sqkm, 1),
      population: pop3[p.adm3_pcode] ?? null, confidence: "official",
      source: `OCHA COD CIV ADM3 ${p.adm3_pcode} + INS/RGPH projections (humdata)`,
    });
  }

  // --- communes (Wikidata) ---
  const rows = JSON.parse(fs.readFileSync(wdFile, "utf8")).results.bindings;
  const deptCodes = {};
  for (const key of Object.keys(isoByAdm1)) Object.assign(deptCodes, isoByAdm1[key].deptCode || {});
  // Wikidata rattache parfois une commune à une région ou un district (Gbêkê, La Mé, Yamoussoukro...) : repli.
  const alt = (s) => {
    let t = stripAccents(String(s).toLowerCase()).replace(/['’ˊ]/g, " ");
    for (let i = 0; i < 8; i++) t = t.replace(/^(district|region|departement|autonome|ville|commune|de|du|des|d|l|la|le|les)\s+/, "");
    return t.replace(/[^a-z0-9]/g, "");
  };
  const regionCodes = {}, districtCodes = {};
  for (const n of nodes) {
    const map = n.level === "region" ? regionCodes : n.level === "district" ? districtCodes : null;
    if (!map) continue;
    for (const k of [norm(n.name), alt(n.name)]) if (k && !map[k]) map[k] = n.code;
  }
  // Orthographe OCHA (Niakaramandougou) != Wikidata (Niakaramadougou)
  const SPELL = { niakaramadougou: "niakaramandougou" };
  const SPECIFICITY = { district: 0, region: 1, department: 2, sub_prefecture: 3 };
  const levelByCode = new Map(nodes.map((n) => [n.code, n.level]));
  const districtOf = (code) => { for (let c = code; c; c = parentOf(c)) { if (levelByCode.get(c) === "district") return c; } return code; };
  const parentOf = (code) => { const n = nodes.find((x) => x.code === code); return n ? n.parent : null; };
  // Les libellés Wikidata portent parfois un suffixe d'homonymie pays : "Bakro (localité Côte d'Ivoire)".
  const cleanName = (s) => s.replace(/\s*\((?:localit[eé]\s+)?(?:C[ôo]te[- ]?d.?Ivoire|CIV)\)\s*$/i, "").trim();
  const orphan = new Set(); let badCoords = 0;
  const byQid = new Map();
  for (const r of rows) {
    const name = cleanName((r.itemLabel && r.itemLabel.value) || "");
    const dept = r.deptLabel && r.deptLabel.value;
    if (!name || !dept || typeof dept !== "string") continue;
    const key = SPELL[norm(dept)] || norm(dept);
    const wide = alt(dept);
    const parentCode =
      deptCodes[key] || subPrefCodes[key] || regionCodes[key] || regionCodes[wide] ||
      districtCodes[key] || districtCodes[wide] || null;
    if (!parentCode) { orphan.add(dept); continue; }
    const pt = r.coords && /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coords.value);
    // Wikidata contient quelques coordonnées erronées (autres pays) : on les écarte plutôt que de les publier.
    const lat = pt ? rnd(Number(pt[2])) : null, lng = pt ? rnd(Number(pt[1])) : null;
    const inside = lat !== null && lng !== null && lat >= 4 && lat <= 11.8 && lng >= -11.6 && lng <= -2.1;
    if (pt && !inside) badCoords++;
    const via = deptCodes[key] ? "" : subPrefCodes[key] ? ", rattachement déduit de la sous-préfecture homonyme"
      : regionCodes[key] || regionCodes[wide] ? ", rattachée à la région déclarée par Wikidata"
      : ", rattachée au district déclaré par Wikidata";
    // Wikidata peut déclarer plusieurs P131 pour la même commune (département + district) : garder le plus précis.
    const cand = {
      name, level: "commune", parent: parentCode,
      dedupe: districtOf(parentCode) + "/" + norm(name),
      rank: SPECIFICITY[levelByCode.get(parentCode)] ?? -1,
      lat: inside ? lat : null, lng: inside ? lng : null,
      population: r.pop ? Number(r.pop.value) : null, confidence: "derived",
      source: `Wikidata ${/Q\d+$/.exec(r.item.value)[0]} — commune de Côte d'Ivoire, rattachement déclaré : ${dept}${via}`,
    };
    const prev = byQid.get(r.item.value);
    if (!prev || cand.rank > prev.rank || (cand.rank === prev.rank && cand.parent < prev.parent)) byQid.set(r.item.value, cand);
  }
  const candidates = [...byQid.values()];
  // Une même commune peut être rattachée à la fois à un département et à sa région : on garde le rattachement le plus précis.
  candidates.sort((a, b) => a.dedupe.localeCompare(b.dedupe) || b.rank - a.rank || a.parent.localeCompare(b.parent) || a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
  const byDedupe = new Set(); const byParentSeq = {};
  for (const c of candidates) {
    if (byDedupe.has(c.dedupe)) continue;
    byDedupe.add(c.dedupe);
    byParentSeq[c.parent] = (byParentSeq[c.parent] || 0) + 1;
    const { name, level, parent, rank, dedupe, ...rest } = c;
    nodes.push({ code: `${parent}-C${String(byParentSeq[parent]).padStart(2, "0")}`, name, level, parent, ...rest });
  }
  const dropped = candidates.length - byDedupe.size;

  // --- chef-lieux oubliés par Wikidata : Bouaké, Daloa, Korhogo, San-Pédro... n'y sont pas typés « commune » ---
  const cityRows = JSON.parse(fs.readFileSync(cityFile, "utf8")).results.bindings;
  const resolveParent = (label) => {
    const key = SPELL[norm(label)] || norm(label), wide = alt(label);
    return deptCodes[key] || subPrefCodes[key] || regionCodes[key] || regionCodes[wide] || districtCodes[key] || districtCodes[wide] || null;
  };
  const cityByName = new Map();
  for (const r of cityRows) {
    const label = cleanName((r.itemLabel && r.itemLabel.value) || "");
    if (!label) continue;
    const prev = cityByName.get(norm(label));
    if (!prev || (r.pop && !prev.pop)) {
      cityByName.set(norm(label), { label, item: r.item.value, coords: r.coords, pop: r.pop, wdParent: r.deptLabel ? resolveParent(r.deptLabel.value) : null });
    }
  }
  const nameOf = (code) => { const n = nodes.find((x) => x.code === code); return n ? n.name : code; };
  const parentForSeat = (name) => deptCodes[norm(name)] || deptCodes[alt(name)] || subPrefCodes[norm(name)] || null;
  let seats = 0;
  for (const [key, c] of [...cityByName].sort((a, b) => a[0].localeCompare(b[0]))) {
    const parentCode = parentForSeat(c.label);
    if (!parentCode) continue; // ce n'est pas un chef-lieu : on ne prétend pas qu'il est commune
    if (c.wdParent && districtOf(c.wdParent) !== districtOf(parentCode)) continue; // village homonyme dans un autre district
    const dedupe = districtOf(parentCode) + "/" + key;
    if (byDedupe.has(dedupe)) continue;
    byDedupe.add(dedupe);
    const pt = c.coords && /Point\(([-\d.]+) ([-\d.]+)\)/.exec(c.coords.value);
    const lat = pt ? rnd(Number(pt[2])) : null, lng = pt ? rnd(Number(pt[1])) : null;
    const inside = lat !== null && lng !== null && lat >= 4 && lat <= 11.8 && lng >= -11.6 && lng <= -2.1;
    byParentSeq[parentCode] = (byParentSeq[parentCode] || 0) + 1;
    nodes.push({
      code: `${parentCode}-C${String(byParentSeq[parentCode]).padStart(2, "0")}`, name: c.label, level: "commune", parent: parentCode,
      lat: inside ? lat : null, lng: inside ? lng : null,
      population: c.pop ? Number(c.pop.value) : null, confidence: "derived",
      source: `Wikidata ${/Q\d+$/.exec(c.item)[0]} (agglomération)${c.wdParent ? " rattachée à " + nameOf(c.wdParent) : ""} — nom du chef-lieu (OCHA COD CIV)`,
    });
    seats++;
  }
  if (seats) console.log(`+ ${seats} commune(s) ajoutée(s) à partir des agglomérations Wikidata (chefs-lieux non typés « commune »)`);

  // --- dernier repli : le chef-lieu de chaque département est une commune (Daloa, Tiébissou...) ---
  let capitalsAdded = 0;
  for (const dep of nodes.filter((n) => n.level === "department").sort((a, b) => a.code.localeCompare(b.code))) {
    if (!dep.capital) continue;
    const key = norm(dep.capital);
    const dedupe = districtOf(dep.code) + "/" + key;
    if (byDedupe.has(dedupe)) continue;
    byDedupe.add(dedupe);
    const known = cityByName.get(key);
    byParentSeq[dep.code] = (byParentSeq[dep.code] || 0) + 1;
    nodes.push({
      code: `${dep.code}-C${String(byParentSeq[dep.code]).padStart(2, "0")}`,
      name: (known && known.label) || dep.capital, level: "commune", parent: dep.code,
      lat: dep.lat, lng: dep.lng, population: null, confidence: "derived",
      source: `Chef-lieu du département ${dep.name} (OCHA COD CIV ADM2) — commune déduite, à confirmer`,
    });
    capitalsAdded++;
  }
  if (capitalsAdded) console.log(`+ ${capitalsAdded} commune(s) ajoutée(s) comme chef-lieu de département`);

  // --- précision : une commune rattachée à sa région/district alors qu'elle est chef-lieu d'un département ---
  const deptByDistrict = new Map();
  for (const d of nodes.filter((n) => n.level === "department")) {
    const dist = districtOf(d.code);
    if (!deptByDistrict.has(dist)) deptByDistrict.set(dist, new Map());
    for (const k of [norm(d.name), alt(d.name), d.capital ? norm(d.capital) : null, d.capital ? alt(d.capital) : null]) {
      if (k && !deptByDistrict.get(dist).has(k)) deptByDistrict.get(dist).set(k, d.code);
    }
  }
  const lastSeq = (parentCode) => {
    let max = 0;
    for (const n of nodes) if (n.parent === parentCode) { const m = /-C(\d+)$/.exec(n.code); if (m) max = Math.max(max, Number(m[1])); }
    return max;
  };
  let reparented = 0;
  for (const c of nodes.filter((n) => n.level === "commune")) {
    const lvl = levelByCode.get(c.parent);
    if (lvl !== "region" && lvl !== "district") continue;
    const better = (deptByDistrict.get(districtOf(c.parent)) || new Map()).get(norm(c.name));
    if (!better || better === c.parent) continue;
    byParentSeq[better] = Math.max(byParentSeq[better] || 0, lastSeq(better)) + 1;
    c.parent = better;
    c.code = `${better}-C${String(byParentSeq[better]).padStart(2, "0")}`;
    c.source += " — rattachement précisé au département dont elle est le chef-lieu";
    reparented++;
  }
  if (reparented) console.log(`~ ${reparented} commune(s) rattachée(s) à leur département (chef-lieu homonyme) plutôt qu'à la région/district`);

  if (orphan.size) console.warn("! rattachements Wikidata sans equivalent OCHA :", [...orphan].join(", "));
  if (badCoords) console.warn(`! ${badCoords} commune(s) avec des coordonnées hors de Côte d'Ivoire : lat/lng laissés vides`);
  if (dropped) console.log(`- ${dropped} doublon(s) de rattachement écarté(s) (commune déjà reliée à un parent plus précis)`);

  const order = { district: 0, region: 1, department: 2, sub_prefecture: 3, commune: 4 };
  nodes.sort((a, b) => order[a.level] - order[b.level] || a.code.localeCompare(b.code));
  fs.writeFileSync(path.join(ROOT, "data", "regions.json"), JSON.stringify(nodes, null, 1) + "\n");
  console.log(`✓ data/regions.json — ${nodes.length} entrées (${Object.entries(nodes.reduce((a, n) => ((a[n.level] = (a[n.level] || 0) + 1), a), {})).map(([k, v]) => k + ":" + v).join(", ")})`);
})();

function rnd(v, digits = 4) { return v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(Number(v).toFixed(digits)); }
