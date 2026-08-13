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
│                         menu · field · number-input
├── inspector/schema.js   schéma → descripteurs, unités d'affichage, appariement (pur)
├── viewport/             viewport · picking · resize · grid · overlay · guides
│   └── tools/            select-tool · pan-tool
└── windows/              hierarchy · inspector · toolbar · dock · search
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

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar                              [hier] [insp] [dock]   │
├────┬──────────────────────────────┬──────────────────────────┤
│ T  │                              │ Hierarchy  (recherche)   │
│ o  │          Viewport            ├──────────────────────────┤
│ o  │                              │ Inspector                │
│ l  │                              │                          │
├────┴──────────────────────────────┴──────────────────────────┤
│ Project | Timeline                                           │
└──────────────────────────────────────────────────────────────┘
```

Flex imbriqué, tailles en variables CSS écrites par `layout.js`, seams déplaçables par
`<px-splitter>` (double-clic = valeur par défaut). La Hierarchy est bornée à la moitié de
la colonne : elle liste, l'Inspector édite. Sous 760 px de large, la colonne droite passe
en survol au lieu d'écraser la scène — **même Editor, pas une version mobile**.

### Ce qui fonctionne

| Capacité | Comment |
|---|---|
| Voir une Scene réelle | `Runtime` + `SceneRenderer` + Canvas 2D — **le moteur, pas un rendu d'IDE** |
| Naviguer | molette (zoom lissé, ancré au pointeur), glisser droit ou milieu, `F` ou le bouton de cadrage |
| Repères | position du curseur sur les bords, en DOM — le contrat de renderer n'a pas de texte |
| Sélectionner | clic Viewport ou Hierarchy, contour + pivot + huit poignées |
| Déplacer | glisser l'objet, arrondi à l'unité, une `batch` par geste |
| Redimensionner | huit poignées, l'arête opposée reste ancrée, rotation et parents compris |
| Hierarchy | recherche conservant les ancêtres, plier/déplier, `lock` / `visible` / delete par ligne |
| Renommer | clic sur le nom d'une ligne déjà sélectionnée · `Entrée` valide · `Échap` annule |
| Cadrer | double-clic sur une ligne — **jamais un renommage**, comme Legacy |
| Inspector | piloté par `componentSchema()` : nombre, entier, slider, booléen, enum, couleur |
| Créer | glisser un outil de la toolbar → l'objet naît **exactement au point de dépose** |
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

### Unités et présentation, sans toucher au modèle

Le Core garde ses unités ; l'Inspector convertit à l'affichage, en un seul endroit
(`inspector/schema.js`) :

- `unit: 'rad'` → affiché en degrés, converti exactement dans les deux sens ;
- un `number` borné **des deux côtés** devient un slider — la conclusion d'ADR-0007 sur le
  type `range`, atteinte depuis les contraintes que les composants déclarent déjà ;
- `x`/`y`, `width`/`height`, `scaleX`/`scaleY` sont appariés en une ligne, par **table de
  noms de propriétés** — donc n'importe quel composant avec `width` et `height` obtient une
  ligne Size sans que l'Inspector connaisse son type.

### Ce qui reste hors de l'Inspector, délibérément

`visible` et `lock` de l'Object vivent dans la ligne de Hierarchy, où ils sont accessibles
pour tous les objets à la fois ; les répéter ferait deux contrôles pour une valeur.
L'`id` technique n'est affiché nulle part. Un Component n'expose qu'`active` : le modèle n'a
pas de `visible` par Component, et en inventer un afficherait un contrôle sans effet.

### Ce qui n'est pas encore là

Play / Pause · Resources et Assets réels · Timeline fonctionnelle · Console · Graph ·
Players · undo/redo · sélection multiple · reparentage par glisser-déposer · rotation à la
poignée · détachement de fenêtre · Operations structurelles.

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
