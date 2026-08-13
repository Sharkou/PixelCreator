# `design/` — prototype de décision UX-2.5

**Ce dossier est jetable.** Il sert à trancher deux décisions ouvertes de la phase
DESIGN V2 :

- **D7** — direction artistique : A *Modern Pixel* / B *Pixel Studio* / C *Minimal Game Dev*
- **D8** — layout : L2 / L4

Une fois les décisions prises, `rm -rf design/` suffit. Rien d'autre n'est à défaire.

## Ouvrir

Depuis la racine du dépôt (`engine/`) :

```bash
tools/dev-server.sh 8099 .
```

puis <http://localhost:8099/design/index.html>.

Équivalent direct : `python -m http.server 8099` à la racine du dépôt.

## Piloter

| Geste | Effet |
|---|---|
| `1` `2` `3` | direction A / B / C |
| `4` `5` | layout L2 / L4 |
| barre du haut | mêmes bascules, plus l'affichage de la Timeline (L4) |
| clic sur une ligne de Hierarchy | sélection |
| loupe | ouvre le champ de recherche avec transition, un seul contrôle de clear |
| `+` | menu Create Object catégorisé |
| **Add Component** | dropdown catégorisé, filtrable, navigable aux flèches |
| clic sur un en-tête de section | plier / déplier |
| survol d'un champ numérique | fait apparaître les steppers `▴ ▾` |
| **maintenir** `▴` / `▾` | répétition automatique après 320 ms |
| glisser le préfixe `X` / `Y` | scrub de la valeur (4 px = 1 pas) |
| `↑` / `↓` dans un champ | ±1, `Shift` ×10 |
| glisser les seams | redimensionne les colonnes et les bandes |
| recherche du Project | filtre les assets ; sans résultat, montre l'empty state centré |

L'Inspector et le Viewport sont liés dans un seul sens : changer `Position` ou `Size`
déplace la sélection, la croix, les libellés `px` et le readout. C'est une ficelle de
prototype, pas le binding réel.

## Fichiers

```
design/
├── index.html      la barre de sélection du prototype + le point de montage
├── prototype.css   tokens des trois directions, structure partagée, deux layouts
├── prototype.js    construction du DOM factice et interactions
├── icons.js        les 24 glyphes de src/editor/ui/icons.js, COPIÉS, plus 17 nouveaux
└── README.md       ce fichier
```

## Règles respectées

- Aucun fichier de `src/`, du Runtime, du Core ou des ADR n'est modifié.
- Aucun import depuis `src/` — les icônes sont copiées, pas référencées, précisément
  pour que la suppression du dossier n'ait aucun effet de bord.
- HTML / CSS / JS natifs, aucune dépendance, aucun build.
- Aucune donnée réelle : tout est littéral, il n'y a ni `Scene`, ni `Object`, ni
  Property System.

## Ce que le prototype ne prouve pas

- Il ne dit rien du **rendu Canvas** : le viewport est du DOM et du CSS. Les problèmes
  de DPR et de flou identifiés dans l'audit ne se reproduisent pas ici et ne se
  jugent pas ici.
- La direction **B** utilise une famille monospace tracée pour les libellés en petites
  capitales, **pas** une vraie police bitmap. Une police bitmap réelle n'existe qu'à des
  tailles entières (8 / 16 px) et casse aux DPI fractionnaires de Windows (125 % / 150 %) —
  c'est le risque documenté dans l'audit, et il doit être accepté explicitement avant de
  choisir B.
- Les densités sont réglées pour un écran ~1440 px de large. Le responsive n'est pas
  traité.
