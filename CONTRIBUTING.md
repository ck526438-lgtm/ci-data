# Contribuer / Contributing

## 🇫🇷 Corriger une donnée

1. **Fork**, puis branche depuis `main`.
2. **Ne modifie pas `data/*.json` à la main** : ce sont des fichiers générés. Corrige la règle dans
   `scripts/build-data.js` (rattachement, orthographe, alias) ou `scripts/build-holidays.js` (règle
   de date), puis régénère :

   ```bash
   npm install
   npm run build   # requiert un accès réseau, met en cache dans .cache/
   npm run sync    # copies dans packages/js/ + exports CSV
   npm test        # schémas, hiérarchie, assertions paquet + API
   ```

3. Si la correction est un fait ponctuel qui ne peut pas venir d'une source amont (un chef-lieu
   renommé, une faute dans le COD OCHA), ajoute-la dans la table d'alias du script concerné
   (`SPELL`, `DISTRICT_LABEL`…) **avec la source en commentaire**.
4. Ouvre la pull request **avec la source** (décret, page INS, item Wikidata) et le lien vers la
   ligne concernée dans `data/SOURCES.md` s'il faut documenter la méthode.

La CI (`npm run validate`) refuse : un enregistrement sans `source`, un `code` hors du schéma,
une hiérarchie incohérente (parent inconnu, niveau qui remonte), un doublon de code ou d'ID,
une date de jour férié hors de l'année demandée.

## 🇫🇷 Ajouter un jeu de données

`data/banks.json`, les circonscriptions électorales, les aires protégées… sont des idées ouvertes.

1. `data/<jeu>.schema.json` (JSON Schema draft 2020-12, `source` et `confidence` obligatoires).
2. `scripts/build-<jeu>.js` qui télécharge, normalise et écrit le JSON trié de façon déterministe.
3. Enregistre le schéma et le jeu dans `scripts/validate.js`, ajoute le chemin dans
   `scripts/export-csv.js` et `scripts/sync-data.js`, documente la provenance dans `data/SOURCES.md`.
4. Une ou deux assertions dans `scripts/smoke-test.js`, et un bloc dans la démo `docs/index.html`.

## 🇬🇧 Fixing a data point

Generated files are the output, not the source of truth: patch the builder in `scripts/`, run
`npm run build && npm run sync && npm test`, and open a pull request **with the upstream source**
(decree, INS page, Wikidata item). CI validates schemas, hierarchy, duplicates and holiday dates.

## 🇬🇧 Adding a dataset

Ship `data/<dataset>.schema.json` (every record must carry `source` and `confidence`), a
deterministic `scripts/build-<dataset>.js`, hooks in `validate.js` / `export-csv.js` /
`sync-data.js`, provenance notes in `data/SOURCES.md`, smoke assertions and a demo section.

## Style

Code en CommonJS, sans dépendance runtime hors `express` (les téléchargements utilisent le
`fetch` global de Node ≥ 18). Pas de commentaire qui raconte le code : seulement les **pourquoi**
(non-sens d'une source, workaround d'API, règle de déduction).

Les issues `good first issue` sont idéales pour commencer. Licence : MIT — en contribuant, tu
acceptes que ton travail soit distribué sous la même licence.
