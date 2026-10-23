// Régénère data/holidays.json : fêtes fixes (loi ivoirienne), fêtes chrétiennes mobiles
// (règle ecclésiastique, calcul exact) et fêtes islamiques (AlAdhan, indicatif — la date
// officielle est fixée en Côte d'Ivoire après l'observation de la lune).
// Usage : npm run build   (réseau requis au premier lancement, cache dans .cache/)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const FROM = 2023, TO = 2032;
const SOURCE = "Liste des jours fériés en Côte d'Ivoire (Wikipédia: Public holidays in Ivory Coast / loi ivoirienne)";

const FIXED = [
  { id: "new-year", name_fr: "Jour de l'An", name_en: "New Year's Day", month: 1, day: 1 },
  { id: "labour-day", name_fr: "Fête du Travail", name_en: "Labour Day", month: 5, day: 1 },
  { id: "independence-day", name_fr: "Fête de l'Indépendance", name_en: "Independence Day", month: 8, day: 7 },
  { id: "assumption", name_fr: "Assomption", name_en: "Assumption", month: 8, day: 15 },
  { id: "all-saints", name_fr: "Toussaint", name_en: "All Saints' Day", month: 11, day: 1 },
  { id: "peace-day", name_fr: "Journée nationale de la Paix", name_en: "National Peace Day", month: 11, day: 15 },
  { id: "christmas", name_fr: "Noël", name_en: "Christmas", month: 12, day: 25 },
];
const CHRISTIAN = [
  { id: "easter-monday", name_fr: "Lundi de Pâques", name_en: "Easter Monday", offset: 1 },
  { id: "ascension", name_fr: "Ascension", name_en: "Ascension Day", offset: 39 },
  { id: "whit-monday", name_fr: "Lundi de Pentecôte", name_en: "Whit Monday", offset: 50 },
];
const ISLAMIC = [
  { id: "korite", name_fr: "Korité (Aïd el-Fitr)", name_en: "Eid al-Fitr", hijri: [1, 10], name_hijri: "1 Shawwal" },
  { id: "lailat", name_fr: "Nuit du Destin (Lailatoul Kadr)", name_en: "Laylat al-Qadr", hijri: [27, 9], name_hijri: "27 Ramadan" },
  { id: "tabaski", name_fr: "Tabaski (Aïd el-Kébir)", name_en: "Eid al-Adha", hijri: [10, 12], name_hijri: "10 Dhul Hijjah" },
  { id: "maouloud", name_fr: "Maouloud (Naissance du Prophète)", name_en: "Mawlid", hijri: [12, 3], name_hijri: "12 Rabi' al-awwal" },
];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function easter(year) { // computus grégorien (algorithme de Gauss/Meeus)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function hijriToGregorian(day, month, hy) {
  const file = path.join(CACHE, "islamic.json");
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const key = `${day}-${month}-${hy}`;
  if (cache[key]) return cache[key];
  fs.mkdirSync(CACHE, { recursive: true });
  await sleep(3300); // limite publique : ~20 requêtes/minute
  const url = `https://api.aladhan.com/v1/hToG/${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${hy}`;
  const r = await fetch(url).then((x) => x.json()).catch(() => null);
  const g = r && r.data && r.data.gregorian;
  if (!g || !g.date) throw new Error("AlAdhan indisponible pour " + key + " — relancez npm run build");
  const [dd, mm, yyyy] = g.date.split("-"); // DD-MM-YYYY
  cache[key] = `${yyyy}-${mm}-${dd}`;
  fs.writeFileSync(file, JSON.stringify(cache, null, 1));
  return cache[key];
}

(async () => {
  const out = FIXED.map((h) => ({ ...h, type: "fixed", source: SOURCE, confidence: "official" }));

  for (const h of CHRISTIAN) {
    const dates = {};
    for (let y = FROM; y <= TO; y++) dates[y] = iso(addDays(easter(y), h.offset));
    out.push({
      id: h.id, name_fr: h.name_fr, name_en: h.name_en, type: "movable_christian",
      rule: { easter_offset_days: h.offset }, dates, source: SOURCE + " — date calculée à partir de Pâques",
      confidence: "official",
    });
  }

  for (const h of ISLAMIC) {
    const dates = {};
    for (let y = FROM; y <= TO; y++) {
      for (const hy of [y - 579, y - 578]) {
        const d = await hijriToGregorian(h.hijri[0], h.hijri[1], hy);
        if (Number(d.slice(0, 4)) === y) dates[y] = d;
      }
    }
    out.push({
      id: h.id, name_fr: h.name_fr, name_en: h.name_en, type: "movable_islamic",
      rule: { hijri_day: h.hijri[0], hijri_month: h.hijri[1], label: h.name_hijri }, dates,
      source: SOURCE + " — dates via AlAdhan (calcul astronomique)",
      confidence: "derived",
      note: "Date indicative : la fête est officiellement fixée en Côte d'Ivoire après l'observation de la lune (±1-2 jours).",
    });
  }

  const sorted = out.sort((a, b) => (a.type === "fixed" ? 0 : 1) - (b.type === "fixed" ? 0 : 1) || a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(ROOT, "data", "holidays.json"), JSON.stringify(sorted, null, 1) + "\n");
  const n = Object.keys(sorted.find((h) => h.id === "korite").dates).length;
  console.log(`✓ data/holidays.json — ${sorted.length} fêtes, années ${FROM}-${TO} (${n} dates/an pour les fêtes mobiles)`);
})();
