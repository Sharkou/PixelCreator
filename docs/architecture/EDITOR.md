# Editor

> Voir ADR-0006 (Web Components), ADR-0007 (Inspector à schéma) et ADR-0017 (sélection).

## IMPLÉMENTÉ — première tranche verticale (2026-08-13)

`src/editor/` existe et s'ouvre : `src/editor/index.html`, servi depuis la racine du
dépôt (voir `../development/DEVELOPMENT.md`). Aucune dépendance, aucun build.

```
src/editor/
├── index.html          point de montage — un <script type="module">, rien d'autre
├── editor.js           racine de composition : modèle, caméra, sélection, raccourcis
├── selection.js        la sélection, locale à l'Editor (ADR-0017)
├── commands.js         créer / supprimer un Object, ajouter / retirer un Component
├── registry.js         enregistrement des types livrés — un acte applicatif
├── project/starter.js  la scène d'ouverture, en attendant le chargement de projet
├── ui/                 element · styles · icons · panel · menu · field
├── inspector/schema.js schéma → descripteurs de champs (pur, testé)
├── viewport/           viewport · picking · grid · overlay
└── windows/            hierarchy · inspector
```

### Ce qui fonctionne

| Capacité | Comment |
|---|---|
| Voir une Scene réelle | `Runtime` + `SceneRenderer` + backend Canvas 2D — **le moteur, pas un rendu d'IDE** |
| Naviguer | molette (zoom ancré sur le pointeur), glisser droit ou milieu (pan), `F` (cadrer) |
| Sélectionner | clic dans le Viewport ou dans la Hierarchy, contour + pivot en surcouche |
| Hierarchy | arbre réel, plier/déplier, créer, supprimer, renommer, basculer la visibilité |
| Inspector | en-tête Object + un bloc par Component, **piloté par `componentSchema()`** |
| Modifier | `setProperty()` — répercuté dans le Viewport et la Hierarchy à la frappe |
| Components | ajouter depuis le `ComponentRegistry`, retirer par bloc |

### Les cinq décisions locales à connaître

1. **La caméra de l'Editor est un `Object` hors scène.** Transform + Camera comme
   n'importe quelle caméra (ADR-0013), simplement jamais ajoutée : absente de la
   Hierarchy, jamais sérialisée, impossible à supprimer par accident. Le pan et le zoom
   l'écrivent en direct — pas d'Operation.
2. **Deux canvas empilés.** `SceneRenderer.render()` commence par effacer ; la grille est
   donc sur une surface en dessous, la scène efface en transparent. Rien n'est ajouté au
   contrat de renderer.
3. **Le Viewport détient le `Runtime`.** `Runtime` reçoit son renderer à la construction,
   et le canvas appartient à l'élément. `running` reste `false` : en mode édition rien ne
   simule, `render()` dessine quand même.
4. **Un glisser est une Operation par frame, groupée par `batch`.** C'est le champ prévu
   par ADR-0008 ; la fusion en une entrée d'historique appartiendra à l'historique.
5. **Trois primitives UI seulement** — `<px-panel>`, `<px-field>`, `<px-menu>`. Les
   autres arriveront quand une fenêtre en aura besoin.

### Ce qui n'est pas encore là

Play / Pause · Assets · Console · Graph · Players · undo/redo · sélection multiple ·
reparentage par glisser-déposer · outils de redimensionnement et de rotation ·
disposition persistante · Operations structurelles.

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
