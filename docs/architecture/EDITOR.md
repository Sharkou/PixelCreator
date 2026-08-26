# Editor

> Voir ADR-0006 (Web Components), ADR-0007 (Inspector à schéma) et ADR-0017 (sélection).

## IMPLÉMENTÉ — état au 2026-08-13 (phase UX-2)

`src/editor/` s'ouvre : `src/editor/index.html`, servi depuis la racine du dépôt (voir
`../development/DEVELOPMENT.md`). Aucune dépendance, aucun build.

```
src/editor/
├── index.html            point de montage — un <script type="module">, rien d'autre
├── editor.js             racine de composition : modèle, caméra, sélection, shell
├── layout.js             tailles et visibilité des fenêtres, persistées
├── selection.js          la sélection, locale à l'Editor (ADR-0017)
├── commands.js           créer / supprimer un Object, ajouter / retirer un Component
├── registry.js           enregistrement des types + présentation du menu Add
├── project/starter.js    la scène d'ouverture, en attendant le chargement de projet
├── ui/                   element · styles · icons · window · tabs · splitter
│                         menu · field · number-input · scrub · empty-state
├── inspector/schema.js   schéma → descripteurs, unités d'affichage, appariement (pur)
├── viewport/             viewport · surface · picking · resize · grid · overlay · guides
│   └── tools/            select-tool · pan-tool
└── windows/              hierarchy · inspector · toolbar · project · timeline · graph
                          workbench (pur) · search · drop (pur)
```

### Convention de nommage

Les classes de l'Editor **ne portent aucun préfixe** : `Element`, `Window`, `Field`,
`Viewport`, `Hierarchy`. Les custom elements gardent leur préfixe obligatoire `px-`.

Trois de ces noms masquent quelque chose : `Element` et `Window` masquent des globaux DOM,
`Viewport` entre en collision avec l'export du runtime. La règle est celle que
`core/object.js` applique déjà à `Object` (`CONVENTIONS.md`) : **un module qui importe le
nôtre passe par `globalThis` pour le global, ou alias à l'import.**

> **Piège vécu.** `Element.prototype.prefix` est un getter en lecture seule. Poser
> `this.prefix = …` sur un élément lève une `TypeError` — silencieuse, parce qu'elle
> partait d'un écouteur d'`Emitter`. L'état interne d'un élément va dans un champ `#privé`,
> jamais dans une propriété publique dont le nom pourrait exister côté DOM.

### Disposition

**L4** (`design/README.md`, D8) : la bande basse s'arrête avant l'Inspector, qui garde une
colonne ininterrompue du titlebar au plancher ; quand rien n'est animé et qu'aucun `.px`
n'est ouvert, la bande n'est pas là du tout.

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar                       [hier] [proj] [time] [insp]   │
├─────────────┬───────────────────────────┬───────────────────┤
│ Hierarchy   │                  [outils] │ Inspector         │
│  (loupe)    │       zone haute          │                   │
├─────────────┤                           │                   │
│ Project     │                           │                   │
├─────────────┴───────────────────────────┤                   │
│ Timeline │ Player.px │ …                │                   │
├─────────────────────────────────────────┤                   │
│ bande basse — repliée quand elle est vide│                   │
└─────────────────────────────────────────┴───────────────────┘
```

Flex imbriqué, tailles en variables CSS écrites par `layout.js`, seams déplaçables par
`<px-splitter>` (double-clic = valeur par défaut). La Hierarchy prend ce que le Project
laisse — une liste grandit avec la scène, une étagère est une étagère. Sous 760 px de
large, l'Inspector passe en survol au lieu d'écraser la scène — **même Editor, pas une
version mobile**.

### Le rail de création a été supprimé — décision du 2026-08-14

Ce document défendait le rail de gauche ainsi : « il est conservé parce qu'il porte une
capacité que le menu ne remplace pas : l'objet naît exactement au point de dépose ». **Cet
argument portait sur le glisser, pas sur la position**, et c'est là que le raisonnement
s'arrêtait trop tôt : il concluait « donc le rail reste » alors qu'il n'établissait que
« donc le glisser reste ».

Les trois outils de création sont maintenant dans le groupe de contrôles du Viewport, en
haut à droite, avec *Frame selection* et *Reset view* :

- **le glisser est inchangé** — `<px-toolbar>` garde exactement sa logique Pointer Events,
  son fantôme sur `document.body` et son appel à `viewport.worldAt()` ; l'objet naît
  toujours exactement au point de dépose, et le tap crée toujours au centre de la vue ;
- l'élément est **inséré dans un `<slot name="tools">`** du Viewport plutôt que dans le
  shell : le Viewport héberge le groupe, il n'apprend rien de ce que les outils font, et
  aucun import ne traverse `windows/` → `viewport/` ;
- ce qui disparaît est **44 px de chrome sur toute la hauteur** pour trois boutons. Mesuré
  dans le navigateur à 1440 px de large : le Viewport passe de 854 à 898 px, soit
  exactement les 44 px du rail, et son bord gauche de 281 à 237.

Un contrôle qui agit sur la scène appartient à la scène. C'est la même règle qui plaçait
déjà le cadrage et la remise à zéro dans le Viewport plutôt que sur une barre à côté.

### Ce qui fonctionne

| Capacité | Comment |
|---|---|
| Voir une Scene réelle | `Runtime` + `SceneRenderer` + Canvas 2D — **le moteur, pas un rendu d'IDE** |
| Naviguer | molette (zoom lissé, ancré au pointeur), glisser droit ou milieu, `F` ou le bouton de cadrage |
| Repères | position du curseur sur les bords, en DOM — le contrat de renderer n'a pas de texte |
| Sélectionner | clic Viewport ou Hierarchy, contour + pivot + huit poignées |
| Déplacer | glisser l'objet, arrondi à l'unité, une `batch` par geste |
| Redimensionner | huit poignées, l'arête opposée reste ancrée, rotation et parents compris |
| Hierarchy | recherche derrière la loupe conservant les ancêtres, plier/déplier, `lock` / `visible` / delete par ligne |
| Renommer | **second** clic sur le nom d'une ligne *déjà sélectionnée avant l'appui*, suivi d'une pause de `RENAME_DELAY` (400 ms) · `F2` le fait immédiatement · `Entrée` valide · `Échap` annule |
| Cadrer | double-clic sur une ligne — **jamais un renommage**, y compris sur le nom |
| Inspector | piloté par `componentSchema()` : nombre, entier, slider, booléen, enum, couleur |
| Créer | glisser un outil du groupe du Viewport → l'objet naît **exactement au point de dépose** |
| Components | menu groupé (`Rendering ▸ Rectangle`), toggle `active`, retrait |

### Les décisions locales à connaître

1. **La caméra de l'Editor est un `Object` hors scène.** Transform + Camera comme
   n'importe quelle caméra (ADR-0013), simplement jamais ajoutée : absente de la
   Hierarchy, jamais sérialisée, impossible à supprimer. Pan et zoom l'écrivent en direct
   — pas d'Operation.
2. **Deux canvas empilés.** `SceneRenderer.render()` commence par effacer ; la grille vit
   donc sur une surface en dessous et la scène efface en transparent. Rien n'est ajouté au
   contrat de renderer.
3. **Le Viewport détient le `Runtime`.** `Runtime` reçoit son renderer à la construction et
   le canvas appartient à l'élément. `running` reste `false` : en édition rien ne simule,
   `render()` dessine quand même.
4. **Un outil, trois gestes.** Ce document esquissait `SelectTool` + `MoveTool` +
   `ResizeTool` ; en faire trois obligerait à choisir un mode avant de pouvoir tirer quoi
   que ce soit. Le `SelectTool` distingue par l'endroit du clic : sur une poignée il
   redimensionne, sur la forme il déplace, sur le vide il désélectionne. `PanTool` est
   **transitoire** — entré au bouton milieu ou droit, quitté au relâchement. `ZoomTool`
   n'existe pas : la molette est un geste, pas un mode.
5. **Le calcul est hors des éléments.** `picking.js`, `resize.js`, `grid.js`, `search.js` et
   `inspector/schema.js` sont purs et testés sous Node. C'est ce qui a évité que
   `viewport.js` redevienne les 27 ko de `handler.js`.
6. **Un glisser = une Operation par frame, groupées par `batch`** (ADR-0008). La fusion en
   une entrée d'historique appartiendra à l'historique.
7. **Déplacement et redimensionnement arrondissent à l'unité.** Legacy le faisait (`~~`) et
   c'est juste pour un outil 2D : l'UI n'arrondit pas l'affichage — elle n'écrit que des
   entiers, donc il n'y a rien à cacher.
8. **Pointer Events partout, jamais le Drag & Drop HTML5.** C'est la seule API qui couvre
   souris, stylet et doigt ; Legacy en dépendait et n'a donc jamais fonctionné au tactile.
9. **Le monde dessine l'objet, l'écran dessine les outils.** Un gizmo suit la position et
   la géométrie de l'objet, jamais son échelle. `overlay.js` porte donc toute sa géométrie
   en pixels écran via `matrix.apply()` puis dessine à plat — comme `handles()` le faisait
   déjà, et comme `outline()` ne le faisait pas. L'ancienne version divisait un scalaire
   unique, `matrixScale()` = `sqrt(|det|)`, hors de l'épaisseur du trait : c'est la
   *moyenne géométrique* des deux échelles d'axe, donc elle ne compense un transform non
   uniforme dans aucune des deux directions. Mesuré sur un objet à l'échelle 1 × 4, pour
   une cible de 1,5 px : arêtes horizontales à 3 px, verticales à 0,75 px, et croix de
   pivot à 3,5 px en largeur pour 14 px en hauteur — **la croix était étirée par l'objet
   qu'elle marque**. Vérifié dans le navigateur par différence d'images (rendu sélectionné
   moins rendu non sélectionné) : bras de 8 × 28 px avant, 14 × 14 px après, identiques
   aux échelles 1, 3, 0,25, 1 × 4 et 4 × 1.

   Corollaire : les tailles d'`overlay.js` sont en **pixels CSS multipliés par la densité**,
   comme `handles()` le faisait seul jusqu'ici. Sur un écran 2x le contour était sinon
   dessiné à la moitié du poids visuel des poignées posées dessus.

10. **Le zoom a un cran à 100 %.** Une molette multiplie — le même geste couvre la même
   distance visuelle à 20 % comme à 400 % — mais l'orbite d'une application
   multiplicative ne contient pas 1. Mesuré sur le code précédent : en balayant toute la
   plage cran par cran, 42 crans de `MIN_ZOOM` à `MAX_ZOOM`, le zoom ne vaut **jamais**
   exactement 1, et depuis une position atteinte par défilements mélangés la meilleure
   approche en défilant vers 100 % est 0,990446. `Math.round(zoom * 100)` affichait alors
   « 100 % » sur une scène décalée d'un pour cent : corriger l'affichage aurait été
   corriger le mauvais nombre. Un cran qui *traverserait* 1 s'y arrête donc ; le cran
   suivant repart normalement, puisqu'un pas qui part de 1 ne le traverse pas. Les bornes
   ne bougent pas et restent le seul écrêtage. `viewport/zoom.js`, pur et testé
   (`zoom.test.js`) : c'est la décision 5 appliquée à un nombre sur lequel on pouvait
   rester coincé.

11. **Une ligne de liste n'a qu'un surlignage, et il est partagé.** La primitive `.line`
   de `ui/styles.js` déclare ensemble l'état survolé et l'état sélectionné, dans cet
   ordre, de sorte que **survoler une ligne déjà sélectionnée ne pose pas un second fond
   par-dessus le premier**. Ce n'était pas un accident de spécificité à rattraper au point
   d'appel : c'est un fait sur ce que ces deux états signifient. Une ligne de Hierarchy et
   une entrée de dropdown l'adoptent toutes les deux — pleine largeur, sans arrondi, le
   rail d'accent affleurant le bord.

### Unités et présentation, sans toucher au modèle

Le Core garde ses unités ; l'Inspector convertit à l'affichage, en un seul endroit
(`inspector/schema.js`) :

- `unit: 'rad'` → affiché en degrés, converti exactement dans les deux sens ;
- un `number` borné **des deux côtés** devient un slider — la conclusion d'ADR-0007 sur le
  type `range`, atteinte depuis les contraintes que les composants déclarent déjà ;
- `x`/`y`, `width`/`height`, `scaleX`/`scaleY` sont appariés en une ligne, par **table de
  noms de propriétés** — donc n'importe quel composant avec `width` et `height` obtient une
  ligne Size sans que l'Inspector connaisse son type.

### `Transform` est un Component ordinaire, et l'Inspector le traite comme tel

Question posée le 2026-08-14, tranchée par lecture du modèle et vérification navigateur :
**`Transform` est supprimable, et son bouton de retrait reste.**

- `localMatrix()` renvoie explicitement l'identité quand l'objet n'a pas de `Transform`
  (`core/components/transform.js`) — l'absence est un cas prévu, pas un état invalide.
- Le picking passe par `worldMatrix()` et continue donc de fonctionner.
- `SelectTool` teste `getComponent('Transform')` et **sort** s'il n'y en a pas : un objet
  sans placement ne se déplace pas, il ne s'écrit pas de propriété fantôme.
- Le registre l'offre à nouveau dans *Add Component*, catégorie `Scene`.
- **Vérifié** : retrait depuis l'Inspector, aucune erreur console, l'objet reste
  sélectionné et listé, glisser dans le viewport sans effet, `Transform` remis en place.

C'est aussi l'intention d'ADR-0002 : le défaut de Legacy qu'il corrige est que « tout
`Object` porte une position, même un objet purement logique ». Un gestionnaire de score n'a
pas de place dans la scène. Retirer le bouton pour imposer une symétrie contredirait la
décision qui a fait de `Transform` un Component.

Ce que `createObject()` fait — en ajouter un à chaque création — reste juste : c'est un
défaut d'outil, pas une contrainte de modèle.

### Ce qui reste hors de l'Inspector, délibérément

`visible` et `lock` de l'Object vivent dans la ligne de Hierarchy, où ils sont accessibles
pour tous les objets à la fois ; les répéter ferait deux contrôles pour une valeur.
L'`id` technique n'est affiché nulle part. Un Component n'expose qu'`active` : le modèle n'a
pas de `visible` par Component, et en inventer un afficherait un contrôle sans effet.

### Réordonnancement et reparentage — IMPLÉMENTÉ (2026-08-17)

L'ordre est un état du modèle : il se sérialise, se réplique et s'annule (ADR-0018). Le
Core l'expose depuis la passe précédente ; l'Editor le manipule depuis celle-ci.

| Geste | Ce qui part | Où |
|---|---|---|
| Glisser une ligne **entre** deux lignes | `REPARENT { parent, index }` | Hierarchy |
| Glisser une ligne **sur** une ligne | `REPARENT` vers ce parent, en fin de liste | Hierarchy |
| Glisser sous la dernière ligne | `REPARENT { parent: null }` — la seule façon de désimbriquer en un geste | Hierarchy |
| Glisser l'en-tête d'un Component | `MOVE_COMPONENT { index, previousIndex }` | Inspector |

Un dépôt de Hierarchy est **un lot** : le `REPARENT` plus les cinq `SET_PROPERTY` qui
conservent le placement monde (ADR-0022). Un `Ctrl Z` le reprend en entier.

**La géométrie du dépôt est un module à part, `editor/windows/drop.js`, et il est pur.**
Rectangles et scène en entrée, `{ parent, index }` en sortie : la règle qui décide entre
« dans » et « après » se teste sous Node au lieu de se découvrir en traînant des lignes.
C'est là aussi que vit la seule subtilité : le rang affiché compte l'objet lui-même, alors
que les primitives du Core retirent avant d'insérer — un déplacement vers le bas dans une
même collection tombe donc une place trop loin sans `insertionIndex()`.

Deux marques différentes, parce que ce sont deux réponses différentes : une ligne d'accent
au bord pour « entre », un contour pour « dans ». Le tiers central d'une ligne imbrique, le
tiers haut et le tiers bas insèrent — l'imbrication a la plus grosse zone parce que c'est
elle qui coûte le plus cher à rater.

L'ancien contournement « retirer puis rattacher » est définitivement écarté : pour un
Component il **détruit ses valeurs** (mesuré : un `Transform` revenait à `0, 0`). Un
`MOVE_COMPONENT` est un splice sur la collection ordonnée — rien n'est détaché, aucune
valeur n'est touchée.

### Le projet, les ressources et ce qui est ouvert — IMPLÉMENTÉ (2026-08-17)

`Workspace` (`editor/project/workspace.js`) tient le `Project` de la couche `project/`, la
ressource ouverte, **la ressource sélectionnée** et les piles d'annulation. C'est
**l'`OpenEditor` d'ADR-0020**, jamais sérialisé dans le projet.

- La scène de démarrage est déclarée comme `Resource` de `kind: 'scene'`, donc listée,
  renommable et enregistrable comme n'importe quelle autre.
- « Il y a du travail non enregistré » est **dérivé** de l'événement `'operation'` du
  pipeline, jamais un drapeau posé à la main. Une écriture simple ne le déclenche pas — ce
  n'est pas une intention (ADR-0003) — et une opération répliquée non plus.
- `Ctrl S` écrit la scène dans le `ResourceStore` (en mémoire pour l'instant : passer à
  IndexedDB est un échange d'implémentation, pas une réécriture d'appelants).
- Deux piles distinctes : celle de la scène et celle du manifeste. `Ctrl Z` vise **celle où
  la dernière intention a été émise** — pas celle que la sélection désigne, parce qu'une
  suppression efface la sélection et l'undo qui la restaure viserait alors la scène
  (ADR-0024, ADR-0025).

### Le Project est un gestionnaire de ressources — IMPLÉMENTÉ (2026-08-17)

Un dossier est une `Resource` de `kind: 'folder'`, et la hiérarchie est un lien `parent`,
jamais une chaîne de caractères (ADR-0025). Tout ce que le panneau fait passe par les
Operations existantes :

| Geste | Ce qui part |
|---|---|
| `+` ▸ Folder / Scene / Component / Image… | `ADD_RESOURCE` (deux, en un `batch`, pour un Component et son graphe) |
| Renommer (double-clic, `F2`, ou l'Inspector) | **un** `SET_PROPERTY name`, à la validation |
| Glisser sur un dossier, ou sur un fil d'Ariane | `SET_PROPERTY parent` |
| Supprimer | `REMOVE_RESOURCE`, payload embarqué ; un dossier emporte son contenu en un `batch` |

**Le menu `+` est une table, pas une suite de branches** (`editor/project/commands.js`).
Un kind y déclare son libellé, son icône, sa fonction de création, et éventuellement
`pick` — « il me faut un fichier d'abord ». Le panneau lit ce drapeau ; il n'apprend jamais
ce qu'est une image.

**Navigation :** un dossier à la fois, avec un fil d'Ariane `Project / Assets / Images`.
Pas un second arbre à côté de celui de la Hierarchy : on **parcourt** un projet, on
**arrange** une scène, et ce ne sont pas les mêmes gestes. Le fil d'Ariane est aussi une
cible de dépôt — c'est ainsi qu'une ressource sort d'un dossier en un geste.

**La recherche sort du dossier ouvert**, délibérément : un filtre qui ne regarderait que le
dossier courant répondrait « aucun résultat » pour une ressource qui existe.

**Désélectionner** est un clic dans le vide de la liste, ou `Échap`. La ressource ouverte —
et tout dossier qui la contient — ne peut pas être supprimée tant que fermer un éditeur
n'existe pas : le bouton est désactivé **et dit pourquoi**.

### L'Inspector inspecte aussi les ressources — IMPLÉMENTÉ (2026-08-17)

Sélectionner une ressource affiche un panneau `Resource` construit des **mêmes primitives**
que le panneau d'`Object` : en-tête d'identité, sections, lignes, `<px-field>`.

```
Resource ─── Name        [ Opening Level ]
Details  ─── Type        Scene
             Location    Scenes
             Objects     6
             Size        2.2 KB
             Revision    1
             Created     17 août 2026, 22:50
             Modified    17 août 2026, 22:50
             Identifier  w4389jnjrq9e
Content  ─── [ aperçu ]  [ Replace… ]        (uniquement pour un kind qui a du contenu)
```

Ce qui change d'un `kind` à l'autre est **une ligne de table** dans
`editor/inspector/resource.js` — des champs en plus, et de quoi montrer le contenu. Un kind
absent de la table s'inspecte quand même : la table ajoute, elle n'autorise pas. Il n'y a
donc **aucun** `if (kind === 'image')` dans la fenêtre, et il ne doit jamais y en avoir.

`describeResource()` est pur et testé sous Node, comme `describeComponent()` (ADR-0007).

**Un seul Inspector, donc un seul sujet :** sélectionner un objet efface la sélection de
ressource et réciproquement. L'exclusion est câblée dans `editor.js`, pas dans les
fenêtres — aucune n'a besoin de savoir que l'autre existe.

**Le nom d'une ressource se valide, il ne se propage pas lettre par lettre.** C'est
l'exception à la règle du produit, et elle est énoncée : une opération par caractère, ce
sont onze entrées d'historique et onze messages réseau pour un mot (ADR-0025 §6).

### Drag & drop — une capacité, pas trois bricolages — IMPLÉMENTÉ (2026-08-18)

`editor/dnd/` décrit ce qu'un dépôt **signifie** (ADR-0026 §6) :

| Fichier | Rôle |
|---|---|
| `payload.js` | ce qui est porté : `files`, `resource`, `object`, `component` |
| `rules.js` | ce qu'un dépôt fait, **pur**, testé sous Node |
| `files.js` | la seule partie qui a besoin d'un navigateur (`DataTransfer`) |

| Geste | Effet |
|---|---|
| Fichier(s) du bureau → Project | import dans le dossier ouvert, sélection de la dernière |
| Fichier(s) → scène | import **puis** instanciation au point du dépôt |
| Fichier(s) → Hierarchy | import puis instanciation à `(0, 0)` |
| Fichier → section Content | remplacement du payload, même chemin que `Replace…` |
| Image du Project → scène | `Object + Transform + Sprite(source)` au point du dépôt |
| Image du Project → Hierarchy | idem, à `(0, 0)` |
| Image du Project → propriété `resource` | affectation de la référence |
| Ressource → dossier / entre deux tuiles | `MOVE_RESOURCE` (dossier **et** rang) |
| Object → Project | **refusé, avec sa raison** : le prefab n'est pas conçu (ADR-0026 §7) |

Une propriété n'accepte une ressource que si son schéma déclare `type: 'resource'`, et peut
restreindre par `kind` ou par `mime` : dropper une image sur un nombre est un refus visible,
jamais une valeur corrompue.

Deux transports, un vocabulaire : un fichier arrive par `DataTransfer`, une ressource par un
geste de pointeur (un drag HTML5 ne traverse pas proprement plusieurs Shadow Roots). Le shell
convertit les deux en payload et pose la même question aux mêmes règles.

### Project est un navigateur d'assets — IMPLÉMENTÉ (2026-08-18)

Grille de tuiles à la densité du prototype, vignette en damier, **aperçu réel** pour une
image, glyphe de type sinon. Fil d'Ariane, navigation par dossier, recherche et sélection
conservés.

Les gestes sont ceux de la Hierarchy, délibérément (ADR-0026 §3) : clic sélectionne, second
clic sur une tuile déjà sélectionnée renomme après la même pause de 400 ms, `F2` renomme tout
de suite, **double-clic ouvre** — un dossier s'ouvre, et pour le reste l'intention est émise
et attend l'éditeur correspondant.

Le renommage édite la **base** : l'extension est décidée par le type et affichée à côté du
champ dans l'Inspector (ADR-0026 §4).

### Un seul état de vie : `active` — IMPLÉMENTÉ (2026-08-18)

L'œil de la Hierarchy et la case `Active` de l'Inspector écrivent **le même champ**. `visible`
a été supprimé du contrat d'`Object` : le Runtime ignorait un objet inactif, le renderer en
ignorait un invisible, aucun contrôle n'exposait la différence, et les deux vues étaient en
désaccord (ADR-0026 §2).

### `+` et `…` dans chaque fenêtre — IMPLÉMENTÉ (2026-08-18)

Le menu de création du Project est le **même** dropdown catégorisé que Add Object et Add
Component. `…` tient ce qu'une fenêtre peut faire au-delà de son action principale, et rien
d'inventé : importer et remonter (Project), tout déplier / replier et désélectionner
(Hierarchy), tout déplier / replier (Inspector).

Le titlebar porte `Share` et un bouton de profil, à la place que la maquette leur donne. Ni
l'un ni l'autre n'est branché, et **tous deux le disent** — il n'existe ni pipeline de
publication ni système de comptes.

### Le renommage attend, et c'est la seule chose qui attend

Question tranchée le 2026-08-14. La règle précédente était juste — seule une ligne *déjà
sélectionnée avant l'appui* peut passer en édition — et posait quand même un curseur là où
personne ne l'avait demandé, parce que `click` se déclenche **aussi sur le premier clic
d'un double-clic**. Cadrer un objet qu'on venait de sélectionner ouvrait donc son nom en
passant, et il fallait que le nom avale `dblclick` pour empêcher le cadrage — ce qui coûtait
au double-clic sa signification sur la moitié de la ligne.

Les deux symptômes sont le même fait manquant : **au moment du premier clic, on ne sait pas
encore si un second arrive**. Le seul moyen de le savoir est d'attendre. On attend donc,
une fois, brièvement (400 ms, le seuil de double-clic des plateformes est de 500 ms et
n'est pas lisible depuis un navigateur), et uniquement sur une ligne déjà sélectionnée.
Tout le reste est immédiat, et `F2` renomme sans aucune attente.

C'est un **timer nommé, pas un blur** : un renommage en attente est annulé explicitement
par ce qui signifie « autre chose s'est passé » — un second clic, un autre appui, un
changement de sélection, une reconstruction de l'arbre. Rien ne dépend de l'ordre dans
lequel le focus s'en va. La valeur, elle, est écrite à chaque frappe comme dans
l'Inspector, donc même un `blur` qui n'arriverait jamais laisse le modèle correct.

Vérifié dans le navigateur, les huit cas : clic sur objet non sélectionné (sélectionne,
n'édite pas) · second clic après la pause (édite) · double-clic sur le nom (cadre, n'édite
pas) · clic sur un autre objet (termine l'édition) · `Entrée` · `Échap` (nom restauré) ·
renommage valide · sélectionner puis cadrer sans que le nom change. Plus `F2`.

### Les lignes de Hierarchy survivent au rendu

`#renderTree()` réutilise les lignes existantes, indexées par id d'objet, et réconcilie les
enfants du conteneur au lieu de faire un `replaceChildren`. Ce n'est pas une optimisation :
**un chevron qui est un élément neuf à chaque rendu ne peut pas s'animer**, faute d'état
précédent d'où partir. Garder la ligne fait du changement de classe une vraie transition —
mesuré à 2 frames du clic, le chevron est à un angle intermédiaire, entre 90° et 0°. Un
`replaceChildren` détacherait la ligne, et la transition d'un élément détaché ne survit pas
à sa remise en place ; la réconciliation ne touche pas une ligne déjà bien placée.

Effet de bord bienvenu : une reconstruction ne jette plus un renommage en cours ni les
abonnements de chaque ligne, qui sont désormais relâchés par ligne (`row:<id>`) au moment
où elle disparaît réellement.

### La fenêtre Graph — IMPLÉMENTÉ (2026-08-18, ADR-0027)

Un double-clic sur un `.px` dans Project **ouvre** son graphe. Le geste était réservé depuis
ADR-0026 (`px-open-resource`) ; il est maintenant branché, et c'est `editor.js` — pas le
panneau — qui décide qu'un `.px` ouvre une toile. Un `kind` sans éditeur est refusé **en le
disant**, jamais ignoré.

```
core/graph/              le modèle : nœuds, ports, connexions, Operations
     ↓
editor/graph/view.js     l'arithmétique : boîtes, ports, courbes, pointage — testée sous Node
     ↓
editor/windows/graph.js  le rendu : un seul SVG, des événements pointeur
```

**Un seul SVG, et c'est la leçon de Legacy.** Legacy dessinait les nœuds en `<div>` et les
fils en SVG : deux arbres DOM à tenir d'accord, et la position d'un port lue par
`getBoundingClientRect()` à chaque `mousemove` — donc connaissable seulement tant que le
nœud était affiché. Une seule couche donne un seul espace de coordonnées : la position d'un
port est de l'arithmétique, la même qui le pointe, et le zoom est un attribut. Ce qui est
repris de Legacy l'est explicitement : la Bézier horizontale au décalage
`max(50, distance × 0.4)`, et le pan/zoom par transformation de vue qui ne touche jamais aux
coordonnées des nœuds.

| Geste | Effet |
|---|---|
| Double-clic sur la toile, ou le `+` | menu de création catégorisé — **le même dropdown** qu'Add Object, Add Component et le `+` du Project |
| Glisser un nœud | `SET_PROPERTY x` + `SET_PROPERTY y` sous **un** `batch` : un drag est **un** `Ctrl Z` |
| Tirer d'un port à un autre | connexion, si les règles l'acceptent ; sinon un **refus qui dit pourquoi** |
| Déposer un fil sur un port occupé | remplace, en un seul geste et une seule entrée d'historique |
| Clic sur un fil | déconnecte |
| `Suppr` sur un nœud sélectionné | le supprime **avec ses fils** ; l'undo rend les deux |
| Molette, bouton du milieu ou droit | zoom autour du curseur, pan |

Un port de **flux** est un triangle, un port de **donnée** un disque : c'est la seule règle
que la toile fait respecter, donc la montrer n'est pas de la décoration. Un nœud en erreur
est cerné, et la phrase du validateur s'affiche en bas de la toile.

### Une seule barre d'onglets, et la Timeline reste seule en bas — IMPLÉMENTÉ (2026-08-26)

La structure des fenêtres **ne bouge pas** : Hierarchy et Project empilés à gauche,
Inspector pleine hauteur à droite, et la bande basse sous Hierarchy + Project + zone
centrale, arrêtée avant l'Inspector. C'est L4 exactement (design/README.md, D8).

```
┌──────────────┬──────────────────────────────────┬──────────────┐
│  HIERARCHY   │  Scene │ Player.px │ Enemy.px    │              │
│              ├──────────────────────────────────┤              │
├──────────────┤                                  │  INSPECTOR   │
│   PROJECT    │         DOCUMENT ACTIF           │              │
│              │                                  │              │
├──────────────┴──────────────────────────────────┤              │
│                    TIMELINE                     │              │
└─────────────────────────────────────────────────┴──────────────┘
```

```
editor/windows/documents.js      quels documents, et lequel est montré — PUR
editor/editor.js documentArea()  la barre d'onglets, le corps, une surface par document
```

#### Le modèle

**Un document est un onglet de la zone centrale.** La Scene en est un, chaque `.px` ouvert
en est un, les Fichiers en seront. Un seul est affiché à la fois.

| | Réordonnable | Fermable |
|---|---|---|
| **Scene** | oui | **non** — permanente |
| **`.px`** (et Fichiers plus tard) | oui | oui |

Il n'y a **pas de seconde barre d'onglets**, donc pas de notion de zone pour un document,
pas de transfert, pas de cible de dépôt, pas d'état à mémoriser. **La barre EST
`opened()`, rang pour rang** : seuls les kinds ayant une surface peuvent être ouverts
(table `EDITORS` du `Workspace`), donc rien n'est perdu au passage et réordonner un onglet
est `Workspace.reorder(id, rang)` — sans traduction, parce qu'il n'y a pas de second ordre.
Un test épingle cette correspondance plutôt que de lui faire confiance.

**La Timeline n'est pas un document** et n'est donc pas un onglet : pas de ressource, pas de
modèle, pas de pile d'undo, rien à fermer — et elle veut une bande horizontale, pas le corps
des documents. Elle garde la zone basse et la bascule du titlebar qu'elle a toujours eues.

- Timeline ouverte → elle occupe la bande ; le Project s'arrête à son seam.
- Timeline fermée → la bande disparaît ; la zone centrale prend toute la hauteur et le
  Project descend jusqu'au plancher.

C'est ce qui remplace un bouton « maximize » : **fermer la Timeline donne au graphe toute la
hauteur**, et c'est un contrôle qui existait déjà. **Mesuré** : Inspector 795 dans les deux
cas ; zone centrale 602 avec la Timeline, 795 sans ; bande à x 0–1165, Inspector à 1166.

#### Une surface par document, gardée branchée

Une toile tient son pan, son zoom et sa sélection : elle est **masquée** quand un autre
onglet est choisi, jamais détachée — détacher relâche tout ce que l'élément a souscrit
(`ui/element.js`). Elle n'est retirée qu'à la fermeture de la ressource, c'est-à-dire au
moment où le `Workspace` libère son modèle et sa pile. **Vérifié** : deux toiles gardent
chacune sa vue à travers six changements d'onglet.

Une toile qui n'est pas affichée n'a **pas de boîte** : elle refuse de cadrer sur du vide, et
`wake()` le lui redemande quand elle revient à l'écran.

#### Ce que deux documents ouverts obligent à tenir

- **`Ctrl S` enregistre l'éditeur dans lequel on travaille**, pas l'onglet montré — la
  réponse que `Ctrl Z` utilise depuis toujours (`activeHistory`, ADR-0024). Sélectionner un
  `.px` dans Project l'**attache** sans l'afficher (ADR-0027 §10) : sans cette règle, éditer
  ses propriétés puis enregistrer visait la mauvaise ressource.
- **La pastille « non enregistré » est par onglet** (`Workspace.dirtyOf()`), sinon un `.px`
  modifié devient muet dès qu'un autre onglet est montré.
- **`Play` ramène l'onglet Scene au premier plan**, parce que c'est ce que Play veut dire :
  lancer la scène derrière un graphe cacherait ce qu'on vient de lancer, et ADR-0029 §4 en
  fait un danger. **`Stop` ne remet rien** — le graphe est à un onglet.

#### Deux pièges du glisser, gardés parce qu'ils restent vrais

Le réordonnancement est le seul geste de glisser de la barre. Deux corrections trouvées à
l'usage restent nécessaires et sont écrites dans `editor.js` :

1. **Le seuil mesurait le déplacement horizontal seul**, donc une pression partant en biais
   devait être poussée de côté avant que la barre ne réponde. C'est une distance
   (`Math.hypot`), comme dans `windows/project.js` depuis toujours.
2. **Les écouteurs `pointermove` / `pointerup` vivaient sur l'onglet.** Une pression relâchée
   ailleurs laissait le geste en place, et comme une souris annonce toujours le même
   `pointerId`, **l'onglet suivant que le pointeur touchait reprenait le geste abandonné**.
   Le geste possède des écouteurs au niveau de la fenêtre, pour exactement sa durée.

### Ouvrir et fermer une ressource — IMPLÉMENTÉ (2026-08-18, ADR-0027)

`Workspace` tient une **carte** d'éditeurs ouverts, chacun avec son modèle, sa pipeline et
sa pile d'undo (ADR-0024). Une bande d'onglets dit ce qui est ouvert — **au bas du shell
depuis le 2026-08-25**, plus au-dessus de la scène, et la scène n'y a plus d'onglet du tout
(voir la section précédente).

- **« Attaché » n'est pas « ouvert ».** Sélectionner un `.px` donne à l'Inspector un modèle
  vivant pour éditer ses propriétés ; seul un double-clic l'ouvre, et **seule une ressource
  ouverte refuse d'être supprimée**. Sans cette distinction, cliquer une fois sur un
  Component le rendrait indestructible.
- **Fermer libère la pile** et rend la ressource supprimable — ce qu'ADR-0025 refusait faute
  de fermeture.
- **Une seule scène à la fois**, toujours : chaque fenêtre est liée à un `Scene`. Plusieurs
  `.px` peuvent être ouverts ensemble.
- Le bouton de fermeture d'un onglet est **toujours** présent, y compris quand la pastille
  « non enregistré » s'affiche : c'est exactement l'état où le créateur a le plus besoin du
  choix.

### L'Inspector déclare les propriétés d'un Component — IMPLÉMENTÉ (2026-08-18, ADR-0027)

Quand un `.px` est sélectionné, une section **Properties** permet de créer, renommer,
retyper, redéfinir et supprimer ses propriétés.

- **le sujet est le schéma, pas une valeur** : une propriété est donc trois champs — nom,
  type, valeur par défaut — et non un ;
- la liste des types est celle du Core, ses huit membres (ADR-0023) ; le contrôle qui édite
  la valeur par défaut est **dérivé** du type choisi par la correspondance qui existe déjà ;
- changer le type réinitialise le défaut, **en un seul `batch`** : un défaut `number` n'est
  pas un `boolean` légal ;
- le renommage est réactif, lettre par lettre, et coûte **une** entrée d'historique
  (ADR-0026 §3) ;
- une propriété porte un `id` frappé une fois, et c'est lui qu'un nœud stocke : **renommer ne
  casse pas le graphe**. La supprimer ne laisse jamais de référence pendante — le validateur
  la signale, la toile cerne le nœud, l'interprète lève une erreur structurée.

Quand un **nœud** est sélectionné, le même panneau montre ses params, ses ports et ses
faits. Il n'y a pas de chaîne de `if` : `inspector/node.js` répond « quels champs, de quel
type », exactement comme `describeResource()` et `describeComponent()` le font pour les deux
autres sujets. Un type de nœud ajouté demain s'inspecte sans que `windows/inspector.js` change.

**Glisser une propriété vers la toile est refusé, avec sa raison** (ADR-0027 §11) : un dépôt
pourrait vouloir dire `Get Property` **ou** `Set Property`, et choisir à la place du créateur
est le comportement magique qu'ADR-0026 demande d'éviter. Le menu de création propose les
deux, et le nœud choisi liste les propriétés par leur nom.

### Ce qui n'est pas encore là

Play / Pause · barre de commandes `Ctrl K` · Timeline fonctionnelle · Console · Players ·
sélection multiple (scène et graphe) · rotation à la poignée · détachement de fenêtre ·
valeur en ligne sur une entrée de nœud non connectée · copier/coller dans le graphe.

Faits depuis : undo/redo (ADR-0024), Operations structurelles (ADR-0019), reparentage et
réordonnancement par glisser-déposer, enregistrement, le Project comme véritable
gestionnaire de ressources (ADR-0025), le drag & drop transverse et l'ordre dans un dossier
(ADR-0026), **le graphe `.px` : modèle, propriétés utilisateur, validation, interprète,
fenêtre, ouverture et fermeture** (ADR-0027), et **la barre d'onglets de documents : la
Scene et chaque `.px` ouvert y sont des onglets, la Timeline garde sa bande à part**.

Le titlebar ne porte **ni transport ni barre de commandes**, bien que la maquette dessine
les deux : Play demande l'instantané de scène restauré à l'arrêt, `Ctrl K` demande un
registre de commandes à interroger. Un bouton visible dont rien n'est derrière est la seule
chose que cet Editor a toujours refusée.

## OBSERVÉ — la synchronisation temps réel, en détail

C'est le mécanisme le plus important de l'Editor, et il est **plus simple qu'on ne
l'imagine**. Ni framework réactif, ni virtual DOM, ni état dupliqué.

### Les trois mécanismes

1. **Liaison par classe CSS.** Chaque champ éditable porte
   `class="<objectId>-<prop>"`, ou `class="<objectId>-<Component>.<prop>"`.

   ```html
   <input class="w4ubqjkgw-x">              <!-- Object.x -->
   <input class="w4ubqjkgw-Controller.speed"> <!-- Controller.speed -->
   ```

2. **Résolution globale.** `document.getElementsByClassName(obj.id + '-' + prop)`
   retourne **toutes** les vues de cette propriété, où qu'elles soient.

3. **Garde de focus.** `if (el[i] !== document.activeElement)` — le champ en cours de
   saisie n'est jamais réécrit. C'est ce qui rend l'édition lettre par lettre possible
   sans que le curseur ne saute.

### Le cycle complet d'une frappe

```
saisie "P" dans l'Inspector
  → Properties.updateCurrentObject(el)
    → object.$name = "P"
      ├─ this.name = "P"  → dispatch setProperty ──────────┐
      └─ dispatch syncProperty ───────────┐                │
                                          ▼                ▼
                              Network.sync()      Properties + Hierarchy
                              send('update', …)   getElementsByClassName('<id>-name')
                                                  écrit dans toutes les vues
                                                  sauf document.activeElement
```

**Vérifié** en exécutant l'éditeur : taper `P`, `Pl`, `Pla`, `Play` met à jour
simultanément le champ Inspector **et** le `contenteditable` de la Hierarchy, à chaque
frappe.

### Il y a bien une source de vérité unique

C'est l'**`Object`**. Le DOM n'est qu'une projection. Il n'existe aucune copie d'état
dans l'Editor. **C'est correct et il ne faut surtout pas introduire de store séparé.**

### Coûts

- `getElementsByClassName` sur `document` entier à chaque changement de propriété ;
- un espace de noms d'identifiants global, qui casse si deux panneaux veulent afficher
  la même propriété différemment ;
- **incompatible avec le Shadow DOM** — point critique pour la v2 (risque R2).

---

## OBSERVÉ — l'Inspector est déjà générique

`editor/windows/properties.js` ne contient **aucun** `if (component === 'Health')`.
Il réfléchit sur l'objet et déduit le widget de `typeof value`. Voir ADR-0007 pour le
tableau complet et les limites (liste noire codée en dur, `parseInt` qui tronque les
décimales, branches `TODO Range`/`TODO Array` mortes).

Le seul endroit réellement spécifique par composant est le `switch` d'icônes de
`appendName()`.

---

## OBSERVÉ — le vrai problème de modularité

Ce n'est pas l'usage du DOM. C'est la structure :

- `index.html` fait **700 lignes** et contient tout le squelette de l'IDE ;
- les modules `editor/misc/*.js` s'exécutent au chargement et attaquent des `id` fixes :

  ```js
  document.getElementById('play').addEventListener('click', …)
  ```

- `sync.js` cible `#sync`, **commenté dans le HTML** — il lèverait une erreur, il n'est
  simplement pas importé par `app.js` ;
- les fenêtres reçoivent un id de conteneur et supposent que leur balisage existe déjà ;
- 30 feuilles CSS dans un espace de noms global ;
- **`editor/windows/window.js` contient uniquement `// TODO: Implement base window class`.**

**Ajouter une fenêtre exige de modifier `index.html`, `app.js`, un CSS et le module.**

### Handler

`editor/system/handler.js`, 27 ko — le plus gros fichier du dépôt. Concentre drop,
sélection, drag, redimensionnement 8 directions, pan, zoom. Le `switch` de 8 cas est
**dupliqué intégralement** entre le cas « objet » et le cas « composant » (~120 lignes
en double). Aucune notion d'outil ni de commande.

Les écritures viewport passent par `$` (`scene.current.$x = …`) donc **répliquent**,
tandis que le pan caméra passe par `camera.x = …` donc reste local. La distinction est
juste et intentionnelle.

---

## PROPOSITION V2

### Structure

```
editor/
├── ui/            primitives Web Components
├── windows/       fenêtres construites sur les primitives
├── viewport/      outils : select, move, resize, pan, zoom
├── inspector/     rendu piloté par schéma (ADR-0007)
├── graph/         éditeur de nœuds, pilotant un modèle .px (ADR-0009)
├── selection.js   ex-scene.current / currentComponent
└── layout.js      agencement, persistance de la disposition
```

### Primitives et fenêtres

```
<px-window> <px-panel> <px-split> <px-tabs> <px-toolbar>
<px-tree>   <px-list>  <px-property> <px-viewport> <px-modal> <px-menu>

<px-hierarchy> <px-inspector> <px-assets> <px-scene>
<px-graph>     <px-players>   <px-console>
```

Une fenêtre = un fichier, portant son balisage, ses styles et son cycle de vie.
`index.html` se réduit à un point de montage.

### Le binding devient scopé

Le Shadow DOM **casse `getElementsByClassName`**. Remplacement à comportement
observable identique :

```js
connectedCallback() {
    this.unsubscribe = properties.observe(this.target, this.prop, change => {
        if (this.input !== this.shadowRoot.activeElement) {   // garde conservée
            this.input.value = format(change.value, this.schema);
        }
    });
}
disconnectedCallback() { this.unsubscribe(); }
```

Préservé : édition lettre par lettre, source de vérité unique, garde de focus.
Ajouté : désabonnement (aujourd'hui inexistant — les écouteurs s'accumulent), fin des
requêtes DOM globales, formatage correct des décimales.

**Ordre impératif : migrer le binding AVANT d'encapsuler en Shadow DOM.** L'inverse
casse la synchronisation sans aucune erreur visible.

### Viewport en outils

`Handler` est découpé : `SelectTool`, `MoveTool`, `ResizeTool`, `PanTool`, `ZoomTool`.
Un seul outil actif, interface commune. Le redimensionnement 8 directions devient une
fonction unique paramétrée par le côté — les ~120 lignes dupliquées disparaissent.

Le picking souris et les poignées, aujourd'hui dans `Renderer.render()`, remontent ici.

### Fenêtre « Players »

Prévue par la vision (« voir les joueurs ») et absente de Legacy, alors que les données
existent déjà : `Network.users[uid]` contient `keys` et `mouse` par joueur. La fenêtre
est essentiellement une vue sur un état déjà répliqué.

---

### Le modèle est central, les vues réagissent — VALIDÉ

Règle explicite : **aucune fonctionnalité de l'Editor ne modifie arbitrairement le DOM.**
Les données restent dans le modèle Pixel Creator ; les vues s'abonnent aux `Change` et
se mettent à jour elles-mêmes.

**OBSERVÉ :** Legacy respecte déjà cet esprit — la source de vérité est l'`Object` — mais
l'applique par une requête DOM globale depuis le module qui écrit. La v2 inverse la
direction : ce n'est plus l'écrivain qui va chercher les vues, c'est chaque vue qui
écoute sa propriété.

Ce que cela ne change pas : **le comportement historique où une propriété modifiée dans
l'Inspector est immédiatement reflétée partout ailleurs — notamment lettre par lettre
dans la Hierarchy — est explicitement conservé.** C'est une exigence, pas un effet de
bord.

### Mutations et autorité

L'Editor émet des **Operations autorisées** (ADR-0011) via `object.setProperty('x', …)`
— la seule API de mutation contrôlée en v2 ; `object.$x` n'existe plus. L'application
reste **optimiste** — la valeur apparaît immédiatement dans toutes les vues — et se
réconcilie si le serveur refuse. Le pan caméra reste une mutation directe
(`camera.x = …`), sans Operation.

---

## Ce qui ne change pas

- La source de vérité reste l'`Object` — **pas de store**.
- L'édition lettre par lettre.
- La garde `activeElement`.
- L'Inspector générique, avec repli réflexif pour les composants sans schéma.
- La distinction entre écriture contrôlée depuis le viewport et pan caméra local —
  avec `setProperty()` à la place du `$` historique.
- Le DOM et le Canvas, sans framework.
