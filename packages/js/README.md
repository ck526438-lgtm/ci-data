# ci-data (paquet Node)

Données administratives, jours fériés et plan de numérotation de la Côte d’Ivoire,
**chargés au démarrage, sans dépendance ni réseau**.

```bash
npm install github:ck526438-lgtm/ci-data#v0.1.0 --prefix ./tmp-ci   # ou voir README du dépôt
```

Le paquet n’est pas encore publié sur npm : installez-le depuis GitHub, ou copiez
`packages/js` + `data/` dans votre projet.

## API

| Fonction | Retourne |
|---|---|
| `getDistricts()` | les 14 districts |
| `getRegions({ level, parent, q, capital })` | filtrage simple sur les 1 609 subdivisions |
| `getRegion("CI-LG-03")` | une subdivision, ou `null` |
| `getChildren(code)` | enfants directs |
| `descendantsOf(code, level?)` | tous les descendants (option : niveau) |
| `getCommunes("CI-AB")` | **cas d’usage n°1** : toutes les communes d’un district/région/département |
| `getPath("CI-AB-01-C09")` | chaîne complète district → … → commune |
| `getHolidays(2026)` | fêtes datées de l’année (`date: null` si non encore proclamée) |
| `isHoliday("2026-08-07")` | la fête ce jour-là, ou `null` (accepte aussi une `Date`) |
| `getPhonePrefixes({ kind, operator })` | entrées du plan de numérotation |
| `resolvePhone("+225 07 11 22 33 44")` | `{ matched, kind, operator \| zone \| service, … }` |
| `LEVELS` | `["district","region","department","sub_prefecture","commune"]` |

```js
const ci = require("./packages/js");

ci.getCommunes("CI-AB").map(c => c.name);
// ['Abobo','Adjamé','Akoupé-Zeudji','Anyama','Attécoubé','Bingerville','Cocody','Le Plateau',
//  'Marcory','Port-Bouët','Treichville','Yopougon', …] — 17 communes pour le district d’Abidjan

ci.getPath("CI-AB-01-C09").map(n => n.name);
// ['District Autonome d\'Abidjan', 'Abidjan', 'Cocody']

ci.isHoliday("2026-08-07");
// { id: 'independence-day', name_fr: 'Fête de l’Indépendance', date: '2026-08-07', … }

ci.resolvePhone("0500112233").operator;
// 'MTN Côte d’Ivoire'
```

Types TypeScript inclus (`index.d.ts`). Les données sont régénérées par `npm run sync` à la
racine du dépôt ; `require("ci-data/data/regions.json")` fonctionne aussi directement.

Repo, démo et contributions : https://github.com/ck526438-lgtm/ci-data
