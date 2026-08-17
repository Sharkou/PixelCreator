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
└── windows/              hierarchy · inspector · toolbar · project · timeline · search
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

**L4** (`design/README.md`, D8) : la Timeline s'arrête avant l'Inspector, qui garde une
colonne ininterrompue du titlebar au plancher ; quand rien n'est animé, la bande n'est pas
là du tout.

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar                       [hier] [proj] [time] [insp]   │
├─────────────┬───────────────────────────┬───────────────────┤
│ Hierarchy   │                  [outils] │ Inspector         │
│  (loupe)    │       Viewport            │                   │
├─────────────┤                           │                   │
│ Project     │                           │                   │
├─────────────┴───────────────────────────┤                   │
│ Timeline — conditionnelle               │                   │
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
ressource ouverte et les piles d'annulation. C'est **l'`OpenEditor` d'ADR-0020**, jamais
sérialisé dans le projet.

- La scène de démarrage est déclarée comme `Resource` de `kind: 'scene'`, donc listée,
  renommable et enregistrable comme n'importe quelle autre.
- « Il y a du travail non enregistré » est **dérivé** de l'événement `'operation'` du
  pipeline, jamais un drapeau posé à la main. Une écriture simple ne le déclenche pas — ce
  n'est pas une intention (ADR-0003) — et une opération répliquée non plus.
- `Ctrl S` écrit la scène dans le `ResourceStore` (en mémoire pour l'instant : passer à
  IndexedDB est un échange d'implémentation, pas une réécriture d'appelants).
- Deux piles distinctes : celle de la scène et celle du manifeste. `Ctrl Z` dans le panneau
  Project reprend un renommage de ressource, pas une édition de scène (ADR-0024).

`<px-project>` liste le manifeste — groupé par `kind`, renommage sur double-clic,
suppression par ligne — et **rien d'autre** : pas de grille de vignettes, pas de payload
préchargé. La ressource ouverte ne peut pas être supprimée depuis la liste tant que fermer
un éditeur n'existe pas.

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

### Ce qui n'est pas encore là

Play / Pause · barre de commandes `Ctrl K` · Assets réels (import, vignettes) · Timeline
fonctionnelle · Console · Graph · Players · sélection multiple · rotation à la poignée ·
détachement de fenêtre · ouverture d'une seconde scène depuis le panneau Project.

Faits depuis : undo/redo (ADR-0024), Operations structurelles (ADR-0019), reparentage et
réordonnancement par glisser-déposer, liste de ressources réelle et enregistrement.

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
