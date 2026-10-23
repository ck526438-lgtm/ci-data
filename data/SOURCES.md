# Provenance des données · Data sources & method

Toutes les données sont **générées** (`npm run build`, scripts dans `scripts/`) puis **validées**
(`npm run validate` : schémas JSON + cohérence de la hiérarchie). Les téléchargements sont mis en
cache dans `.cache/` (hors dépôt). Dernière régénération : **2026-10-23**.

## `data/regions.json` — découpage administratif

| Champ | Source |
|---|---|
| Hiérarchie districts → régions → départements → sous-préfectures, `code` partiel, `lat`/`lng` (centroïdes), `area_km2` | **OCHA / UNOSAT — Côte d'Ivoire Subnational Administrative Boundaries** (COD, cuvée `valid_on: 2018-07-06`), [humdata.org `cod-ab-civ`](https://data.humdata.org/dataset/503a9167-ba56-4174-b160-bdb0fb703719) — 33 ADM1 (31 régions + 2 districts autonomes), 108 ADM2, 510 ADM3 + `civ_admincapitals.geojson` |
| Population départements et sous-préfectures | **INS / UNFPA** — `civ_admpop_adm2_v2.csv`, `civ_admpop_adm3_v2.csv` ([humdata `cod-ps-civ`](https://data.humdata.org/dataset/53d768e8-7a66-438c-abcb-8393fa74adf8)) |
| Nom accentué, chef-lieu et population (RGPH 2021) des 31 régions ; rattachement région → district | **Wikipédia fr** — [Régions de Côte d'Ivoire](https://fr.wikipedia.org/wiki/R%C3%A9gions_de_C%C3%B4te_d%27Ivoire), données `[1]` issues des résultats globaux du [RGPH 2021 de l'INS](https://www.ins.ci/RGPH2021/RGPH2021-RESULTATS%20GLOBAUX_VF.pdf) |
| Codes et libellés des 14 districts | **ISO 3166-2:CI** + décret n°2011-263 du 28 septembre 2011, repris par [Wikipédia fr — Districts de Côte d'Ivoire](https://fr.wikipedia.org/wiki/Districts_de_C%C3%B4te_d%27Ivoire) |
| Communes (nom, parent, coordonnées, population) | **Wikidata** — items `P31 = Q2679157` (commune de Côte d'Ivoire), rattachement `P131`, coordonnées `P625`, population `P1082` ; completées par les agglomérations `P31 ∈ {Q515 ville, Q1549591 grande ville, Q486972 établissement humain}` et `P17 = Q1008` dont le nom est celui d'un chef-lieu (Bouaké, Daloa, Korhogo, San-Pédro… ne sont pas typées « commune » dans Wikidata) |

### Codes ci-data

```
CI-AB                     district (code ISO 3166-2:CI)
CI-LG-03                  région   (03 = p-code OCHA CI03)
CI-LG-03-01               département  (01 = p-code OCHA CI0301)
CI-LG-03-01-02            sous-préfecture (02 = p-code OCHA CI030102)
CI-LG-03-01-C02           commune  (numérotée dans son département)
```

Les régions ne sont plus codées par ISO 3166-2 depuis 2013 : les deux chiffres sont donc repris des
**p-codes OCHA**, ce qui garantit un code court, stable et sans ambiguïté.

### Règles de rattachement des communes

Appliquées dans cet ordre par `scripts/build-data.js`, une seule fois par item Wikidata (`Q…` figure
dans le champ `source` de chaque commune, donc toute attribution est vérifiable) :

1. `P131` dont le libellé correspond (nom accentué ou non, articles ignorés) à un **département** OCHA.
2. À défaut, à une **sous-préfecture** homonyme.
3. À défaut, à la **région** ou au **district** déclaré par Wikidata (18 cas, surtout des localités
   rurales que Wikidata rattache à une entité de niveau trop élevé).
4. Si une commune est déjà rattachée à une région ou à un district alors qu'elle porte le nom d'un
   chef-lieu de département du même district, elle est **re-rattachée au département** (3 cas).
5. Les **chefs-lieux de département** absents de Wikidata sont ajoutés comme commune (5 cas) et les
   **agglomérations** reprenant le nom d'un chef-lieu sont ajoutées (37 cas).
6. Homonymie : une commune n'est conservée qu'une fois par **district** ; les homonymes d'un district
   à l'autre (deux communes « Bodo », deux « Ananguié »…) restent bien distincts.
7. Coordonnées hors de l'emprise du pays (2 items Wikidata erronés) : `lat`/`lng` laissés vides.

### `confidence`

- `official` (663 entrées) : districts, régions, départements, sous-préfectures — reprise directe OCHA/INS/Wikipédia.
- `derived` (946 entrées) : communes — Wikidata ne garantit ni l'exhaustivité ni le rattachement
  officiel après la réforme communale (décrets 2005-314 et 2023). **À confirmer avant usage
  contractuel** ; les corrections se font par pull request.

### Limites connues

1. Les noms de départements et sous-préfectures viennent du COD OCHA, qui **supprime les accents**
   (`Gbokle`, `Bere`, `Niakaramandougou`). Les noms de régions et districts sont accentués.
2. Cuvée OCHA 2018 = 108 départements. **Bonon** et **Gohitafla** (érigés en départements après la
   cuvée) n'existent que comme sous-préfectures : leurs communes sont rattachées à la
   sous-préfecture homonyme.
3. La maille communale a été réformée en 2012 (création de communes rurales) puis en 2023 : aucune
   source ouverte ne publie la liste officielle complète avec les décrets. Ce jeu couvre les
   **946 entités communales documentées par Wikidata** — utile pour un formulaire, pas pour un acte
   administratif. Le recensement par décret est une **contribution à venir**.
4. Aucune donnée d'emprise géographique (polygones) n'est incluse : seule la cuvée OCHA est
   redistribuée sous licence humanitaire. Voir « Pour aller plus loin ».

## `data/holidays.json` — jours fériés

- Liste de référence : [Wikipédia — Public holidays in Ivory Coast](https://en.wikipedia.org/wiki/Public_holidays_in_Ivory_Coast)
  (fêtes fixes + fêtes chrétiennes mobiles + 4 fêtes islamiques : Korité, Tabaski, Maouloud, Nuit du Destin).
- Fêtes chrétiennes : date de Pâques calculée par **computus grégorien** (offsets +1 jour = lundi de
  Pâques, +39 = Ascension, +50 = lundi de Pentecôte) → `confidence: official`.
- Fêtes islamiques : conversion hégirien → grégorien via [AlAdhan API](https://aladhan.com/hijri-gregorian-converter)
  (calendrier tabulaire). `confidence: derived` : en Côte d'Ivoire la date est proclamée après
  **observation de la lune**, l'écart réel est de ±1-2 jours.
- Couverture : **2023 → 2032**, extensible en changeant `FROM`/`TO` dans `scripts/build-holidays.js`.

## `data/phone-prefixes.json` — numérotation

**ARTCI** (Autorité de régulation des télécommunications/TIC de Côte d'Ivoire) — plan national de
numérotation, décision n°2020-0569 du 10 juin 2020 (passage à 10 chiffres le 31 janvier 2021), repris
par [Wikipédia fr — Liste des indicatifs téléphoniques en Côte d'Ivoire](https://fr.wikipedia.org/wiki/Liste_des_indicatifs_t%C3%A9l%C3%A9phoniques_en_C%C3%B4te_d%27Ivoire).
Numéros mobiles : `0X XX XX XX XX` avec X∈{1 (Moov), 5 (MTN), 7 (Orange)} ; fixes : `2X …` (opérateur)
puis 3e-4e chiffres = zone géographique.

## `data/csv/`

Exports CSV (séparateur virgule, CRLF, en-têtes) régénérés par `npm run csv` — pour Excel, Google
Sheets, `pandas.read_csv`, `PostgreSQL \copy`.

## Licence des sources

`ci-data` est MIT. Les données amont : OCHA/humdata (usage humanitaire, réattribution demandée),
INS-RGPH (statistique publique), Wikipédia/Wikidata (CC BY-SA / CC0), ARTCI (plan de numérotation
officiel). En réutilisant ces jeux vous acceptez d'en citer les sources.
