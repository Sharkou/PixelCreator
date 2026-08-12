# Analyse de Legacy

> **Statut : OBSERVÉ.** Ce document décrit ce que le code fait réellement, vérifié par
> lecture du source et, pour les points marqués ✅, par exécution dans le navigateur
> (serveur statique sur `legacy/`, console).
>
> Il ne contient aucune proposition. Les propositions sont dans `../architecture/*.md`
> et `../decisions/ADR-*.md`.

---

## 1. Inventaire

~13 000 lignes de JavaScript, sans dépendance runtime, sans build, sans tests.

| Zone | Fichiers | Lignes (ordre) | Rôle |
|---|---|---|---|
| `src/core/` | object, scene, system, renderer, camera, loader, resource, player, mod | ~2 400 | Modèle + boucle de rendu |
| `src/graphics/` | graphics, texture, sprite, circle, rectangle, text, light, lighting, map, particle, color | ~1 100 | Rendu Canvas 2D |
| `src/physics/` | collider, controller, body, tilemap, rotator, spatialhash | ~1 100 | Collisions et déplacement |
| `src/network/` | network, socket, room, client, spawner | ~800 | WebSocket + réplication |
| `src/math/`, `time/`, `input/`, `audio/`, `anim/`, `storage/`, `ui/`, `runtime/` | — | ~2 000 | Utilitaires et services |
| `editor/` | windows, system, graph, misc, scripting, lib | ~4 500 | IDE |
| `css/` | 30 feuilles | — | UI |
| `index.html` | 1 fichier | 700 | Structure complète de l'IDE |

Fichiers vides (intentions non réalisées) : `math/noise.js`, `math/fractal.js`,
`math/raytracer.js`, `editor/windows/timeline.js`, `css/picker.css`.

`editor/windows/window.js` contient uniquement `// TODO: Implement base window class`.
C'est l'aveu exact du problème de modularité de l'Editor.

---

## 2. Le Property System

C'est le cœur du projet. Tout le reste en découle.

### 2.1 Mécanisme

`System.sync(object, component?)` (`src/core/system.js:31`) parcourt les propriétés
énumérables de l'objet **au moment de l'appel** et remplace chacune par un couple
accesseurs :

```js
Object.defineProperty(obj, prop, {
    get() { return this['_' + prop]; },
    set(value) {
        this['_' + prop] = value;
        System.dispatchEvent('setProperty', { object, component, prop, value });
    },
    configurable: true, enumerable: true
});

Object.defineProperty(obj, '$' + prop, {   // write-only
    set(value) {
        this[prop] = value;                 // déclenche setProperty
        System.dispatchEvent('syncProperty', { object, component, prop, value });
    },
    configurable: true, enumerable: true
});
```

Il en résulte **trois canaux d'écriture distincts**, tous vérifiés ✅ :

| Écriture | `setProperty` | `syncProperty` | Usage réel |
|---|---|---|---|
| `obj.x = 100` | ✅ émis | ✗ | Runtime, simulation, caméra locale |
| `obj.$x = 100` | ✅ émis | ✅ émis | Editor : drag viewport, saisie Inspector |
| `obj.setProperty('x', 100)` | ✅ émis (manuel) | ✗ | Réception réseau (pas d'écho) |

C'est une distinction **intentionnelle et load-bearing**, pas un accident : elle
empêche la simulation d'inonder le réseau tout en gardant les vues synchronisées.

`obj.syncProperty('x', v)` produit le même effet que `obj.$x = v` : les deux écrivent
via `this[prop]` puis émettent `syncProperty`.

> **⚠ Ceci décrit Legacy, pas la cible v2.** En v2, `$x` et `syncProperty()` sont
> **supprimés** ; leur rôle est repris par `setProperty()`, dont le sens Legacy
> (écriture directe non répliquée) disparaît. Voir ADR-0003.

### 2.2 Chaîne à trois niveaux pour x/y

`Object` définit sur son prototype (`src/core/object.js:56-96`) :

```
obj.x            (accesseur d'instance posé par System.sync)
  → obj._x       (accesseur de prototype : propage le delta aux enfants)
    → obj.__x    (stockage réel)
```

✅ Vérifié : parent `x` 300 → 350 déplace l'enfant de 100 → 150. La double indirection
existe uniquement pour offrir un point d'accroche à la propagation hiérarchique.

> **⚠ `_x` et `__x` sont des détails d'implémentation Legacy.** Ils sont documentés ici
> parce qu'ils expliquent le comportement observable. Ils ne deviennent **pas** une API
> v2 : aucune API publique v2 ne dépend de ces conventions, et ni les utilisateurs ni les
> composants ne les manipulent.

### 2.3 Limites mesurées

**a) Les propriétés ajoutées après construction ne sont pas réactives.** ✅

```js
obj.health = 100;   // simple propriété de données
obj.health = 50;    // → aucun événement émis
```

Toute propriété non présente lors de l'appel à `System.sync()` est muette :
pas d'Inspector, pas de réseau, pas de vue mise à jour. Silencieusement.

**b) Les champs privés `#` sont invisibles.** ✅

`for...in` ne voit pas les champs `#privés`. `Texture` déclare `#scaleX`, `#scaleY`,
`#scaleFromBox` : ces propriétés ne sont **ni synchronisées, ni inspectables, ni
sérialisées**. `Object.keys(texture)` retourne `source, image, flip, name, active`
uniquement.

> Le commit `38906c2` — *« refactor: use ECMAScript # private fields »* — a donc
> silencieusement retiré ces propriétés du Property System. C'est l'illustration
> exacte de ce qu'il ne faut pas refaire : une modernisation appliquée pour elle-même
> a cassé un mécanisme transversal invisible depuis le fichier modifié.

**c) `_prop` et `$prop` sont énumérables et polluent tout.** ✅

Chaque propriété logique coûte trois entrées (`x`, `_x`, `$x`). Conséquences mesurées
sur un objet de test avec un enfant et un composant :

| Sérialisation | Taille | Clés |
|---|---|---|
| `JSON.stringify(obj)` — ce que diffuse le serveur | 1733 o | 38 |
| `obj.stringify()` — filtre `_`/`$`, utilisé par `add` | 560 o | 19 |

**Facteur 3,09.** Le heartbeat serveur (`broadcast('heartbeat', scene.objects)`)
n'applique aucun filtre : il envoie les doublons `_x`, `_name`, `_components`…

**d) Les enfants sont sérialisés deux fois.** ✅ Un enfant apparaît en entier dans
`parent.childs` *et* comme objet racine de `scene.objects`.

**e) `$prop` est en écriture seule.** Aucun getter n'est défini. `obj.$x` retourne
`undefined`, ce qui est asymétrique et déroutant.

**f) Aucun `previous`.** L'événement ne transporte que la nouvelle valeur. Impossible
de construire un undo/redo sans relecture préalable.

**g) Le debounce réseau est neutralisé.** `Network.sync()` implémente une logique de
throttle avec `const delay = 0` (`src/network/network.js:401`). ✅ Vérifié : quatre
frappes produisent **quatre opérations**, sans aucun regroupement. Le nombre de messages
réellement émis dépend en revanche de la milliseconde — donc du hasard.
`syncInputs()` utilise un vrai `delay = 50` pour la souris.

**h) Construire un `Object` émet 19 notifications.** ✅ `System.sync()` réécrit chaque
propriété via son propre setter pour « restaurer la valeur » (`obj[prop] = value` en fin
de boucle), et chaque réécriture émet `setProperty` — avant même que l'objet appartienne
à une scène. Mesuré : **57 clés énumérables pour 19 propriétés publiques**, et
19 notifications à la construction d'un objet vide.

**i) Deux gardes différentes pour la même intention.** Quatre modules protègent leur code
DOM par `if (window.document)` ; `gamepad.js:211` teste `typeof window !== 'undefined'`.
Le second s'exécute donc dans un environnement sans DOM et appelle
`window.addEventListener`.

### 2.4 Performance mesurée ✅

Micro-benchmark, 3 M opérations, Chrome :

| Implémentation | Lecture | Écriture |
|---|---|---|
| Propriété simple | 18,6 ms | 4,8 ms |
| Accesseurs Legacy (`_prop`) | 81,6 ms | **301,5 ms** |
| `Proxy` (get/set traps) | 82,0 ms | **76,9 ms** |

Résultat contre-intuitif et déterminant : un `Proxy` lit **aussi vite** que
l'implémentation actuelle et écrit **~4× plus vite**. Le coût de l'écriture Legacy
vient de la création dynamique de la seconde propriété (`this['_' + prop] = value`).

Le surcoût de réactivité en lecture (×4 vs propriété nue) est **déjà payé aujourd'hui**.

---

## 3. Object

`src/core/object.js`, 680 lignes.

### 3.1 Ce qu'il contient

```js
id, uid, name, layer, tag, type, active, visible, lock, static, image,
components{}, childs{}, x, y, width, height, rotation, scale
```

- `id` : identité de l'objet (`Math.random().toString(36)`, 9 caractères).
- `uid` : **identifiant du joueur propriétaire**, pas de l'objet. Sert à router les
  entrées (voir §6.3). Nommage historiquement piégeux.
- `image` : `HTMLImageElement` de vignette pour la Hierarchy — de l'UI dans le Core.
- `childs` : anglais incorrect, mais présent dans le protocole réseau et la
  sérialisation. Le renommer casse la compatibilité des données.

### 3.2 Responsabilités hors périmètre

`Object` porte du code purement Editor :

| Méthode | Nature |
|---|---|
| `detectMouse(x, y)` | picking souris, lit `Camera.main` |
| `detectSide(x, y)` | poignées de redimensionnement |
| `select(ctx)` | dessine le rectangle de sélection bleu |
| `createImage(ctx)` | crée un `<img>` DOM, manipule un canvas offscreen |
| `preview()` | boucle de rendu éditeur |

`createImage()` importe `document` : **`Object` ne peut pas être chargé côté serveur
sans que ces méthodes soient inertes.** Elles ne sont jamais appelées côté serveur,
donc cela fonctionne par chance, pas par conception.

### 3.3 `copy()` : le point le plus fragile

```js
copy(obj) {
    for (let prop in obj) {
        if (typeof obj[prop] !== 'object') this[prop] = obj[prop];
        else { /* TODO: Gérer les objets */ }
    }
    for (let name in obj.components) {
        this.addComponent(new components[name], false);
        for (let prop in component) this.components[name][prop] = component[prop];
    }
}
```

- Les propriétés objet ne sont **pas** copiées (`TODO` explicite) — donc `childs`
  n'est pas copié par `copy()` ; `Scene.init()` doit refaire les liens dans une
  seconde passe.
- `new components[name]` fait une **recherche par nom dans `mod.js`** : un composant
  dont la classe n'est pas exportée dans `mod.js` fait échouer la désérialisation.
- `for (let prop in obj)` inclut `_x`, `$x`… donc `copy()` réassigne aussi les
  doublons. `this['_x'] = …` court-circuite l'accesseur d'instance mais atteint
  l'accesseur de prototype `set _x` — la propagation aux enfants se déclenche donc
  pendant la copie réseau.
- `copy()` est appelé **par objet et par heartbeat** (`Network.heartbeat`). C'est une
  recopie complète, pas un patch.

#### `copy()` détruit `components`, `childs` et `image` ✅

Vérifié par le harnais de parité (`scene/copy-from-live-object-wipes-containers`).

`for (let prop in obj)` visite aussi les accesseurs `$prop`, qui sont en **écriture
seule**. Lire `obj.$components` donne donc `undefined`, `typeof undefined !== 'object'`,
et la branche « primitive » s'exécute : `this.$components = undefined` → le setter `$`
écrit `this.components = undefined`.

Les primitives survivent parce que `_prop` suit immédiatement `$prop` dans l'ordre des
clés et restaure la valeur. Les conteneurs, eux, sont des objets : la branche de
restauration les saute, et la valeur reste `undefined`.

| Source de `copy()` | Résultat |
|---|---|
| **Object vivant** (Editor, prefab, `instantiate`) | `components`, `childs`, `image` → `undefined` |
| **JSON brut** (message réseau, heartbeat) | correct — le JSON n'a pas d'accesseurs `$` |

Conséquence directe, vérifiée : **`Scene.instantiate()` lève une `TypeError` dès que la
source porte un composant** (`scene/instantiate-throws-with-components`), puisque
`addComponent()` écrit dans `this.components` devenu `undefined`.

Cela casse la création de prefab (`Project` fait `prefab.copy(instance)`) et le chemin
`Network.add`. Le heartbeat, lui, fonctionne — parce qu'il copie depuis du JSON plat.
C'est ce qui a permis au défaut de rester invisible.

### 3.4 `update()` / `draw()` avalent les erreurs

```js
update() {
    for (let i in this.components)
        if (this.components[i].active && this.components[i].update)
            try { this.components[i].update(this); }
            catch (err) { console.error(err); }
}
```

Le `try/catch` par composant et par frame est ce qui permet à un script utilisateur
cassé de ne pas tuer la boucle — **intention légitime**. Mais il masque aussi les
pannes systématiques (voir §6.3).

---

## 4. Scene

`src/core/scene.js`, 292 lignes. Volontairement mince.

- `objects{}` indexé par id, plat. La hiérarchie n'existe que par `parent`/`childs`.
- `current` : objet sélectionné dans l'Editor — **état d'Editor stocké dans le Core**.
  Son setter émet `setCurrentObject`, ce qui pilote Inspector et Hierarchy.
- `currentComponent` : idem, pour la manipulation de composant au viewport.
- `Scene.main` : singleton statique.
- `instantiate()` crée un `new Object()` puis `copy()` — donc **tout objet reçu du
  réseau passe par les limites de `copy()`** décrites en §3.3.
- `refresh()` fait `this.current = this.current` pour forcer un re-render de
  l'Inspector. Idiome à connaître.
- `updateName(el)` lit `el.textContent` : **le Core lit le DOM.**

---

## 5. Components

### 5.1 Contrat réel

Il n'existe **aucune classe de base et aucune interface**. Un composant est une classe
quelconque. Le contrat est purement conventionnel, par duck-typing :

| Hook | Signature | Appelé par |
|---|---|---|
| `update(self)` | `self` = l'`Object` porteur | `Object.update()`, chaque frame |
| `draw(self)` | idem | `Object.draw()`, si `obj.visible` |
| `preview(self)` | idem | `Object.preview()`, si `renderer.inspector` |
| `onCollision(self, other)` | | `Object.onCollision()` |
| `onCollisionStart` / `onCollisionExit` | | idem |
| `constructorAfterLink(self)` | | `Object.addComponent()` |
| `detectMouse(self, x, y)` / `detectSide(self, x, y)` | | `Renderer.render()` (éditeur) |

**Point capital : `self` est passé en argument, jamais stocké.** Un composant n'a pas
de référence à son `Object`. C'est ce qui rend les composants sérialisables en JSON
sans cycle, et ce qui permet à `copyComponent()` de fonctionner.

`component.name` est écrasé par `addComponent()` avec `component.constructor.name`,
et sert de clé dans `object.components{}`. Un objet ne peut donc porter **qu'une seule
instance de chaque type de composant**, et la minification du code casserait tout.

### 5.2 Répartition client / serveur

| Composant | `update` | `draw` | `preview` | Serveur ? |
|---|---|---|---|---|
| `Camera` | — | — | ✅ | non (données seules) |
| `Texture` | ✅ | ✅ | — | inutile (résout une image) |
| `RectangleRenderer`, `CircleRenderer`, `Text` | — | ✅ | — | non |
| `Light`, `Lighting` | ✅ | ✅ | — | partiel (`Light.update` écrit `self.width`) |
| `ParticleSystem` | ✅ | ✅ | — | **oui pour `update`, non pour `draw`** |
| `Collider` / `Rect` / `Circle` | ✅ | — | ✅ | oui |
| `Controller` | ✅ | — | — | oui (lit les entrées réseau) |
| `Body`, `Rotator`, `Tilemap` | ✅ | — | — | oui |
| `Animator`, `Animation` | ✅ | — | — | discutable |

`ParticleSystem` est exactement le cas décrit dans la vision : simulation dans
`update()`, rendu dans `draw()`, le serveur n'appelle jamais `draw()`. **Le modèle
update/draw est justifié par le code, pas seulement par tradition.**

### 5.3 Trois classes exportées comme composants ne le sont pas

`mod.js` exporte au même niveau des classes dont la signature est incompatible avec
`Object.update()` / `Object.draw()` :

| Classe | Signature réelle | Effet si attachée à un `Object` |
|---|---|---|
| `Tilemap` | `draw(ctx, camera)` | `Object.draw()` appelle `draw(this)` → `ctx` reçoit l'Object, `camera` est `undefined` → `TypeError`, **absorbée par le `try/catch`** |
| `Lighting` | `render(ctx, camera)`, `init()`, `addLight()` | jamais appelée — service de rendu, pas composant |
| `LightSource` | `update()` **sans `self`** | fonctionne par hasard, mais viole le contrat |

Rien dans le code ne signale qu'une classe n'est pas attachable : le duck-typing
accepte tout, et le `try/catch` masque l'échec.

Par ailleurs, `Manager` n'expose que **7 composants** dans l'UI (`Camera`, `Texture`,
`CircleRenderer`, `RectangleRenderer`, `Collider`, `Controller`, `Rotator`).
`Light`, `Map`, `Animation`, `Animator` sont commentés ; `Text`, `ParticleSystem`,
`Body`, `Tilemap`, `Timer`, `Sound` ne sont pas listés — bien qu'exportés.

### 5.4 Couplages problématiques

- `Collider.update()` référence `Scene.main` sans l'importer → `ReferenceError` au
  premier appel (`src/physics/collider.js:44`). Le `try/catch` de `Object.update()`
  le masque.
- `Texture.update()` refait `Loader.files[this.source]?.image` **à chaque frame** pour
  chaque objet texturé — une recherche de dictionnaire par frame par objet.
- `Light.update()` écrit `self.width`/`self.height` : un composant redimensionne son
  porteur à chaque frame, écrasant toute valeur saisie dans l'Inspector.

---

## 6. Runtime

### 6.1 Organisation

**Il n'y a pas de dossier `runtime/` fonctionnel.** `src/runtime/` ne contient que
`environment.js` (détection de plateforme, 411 lignes, aucun rapport avec la boucle).

Le runtime réel est constitué de :

- `Renderer.render(scene, camera)` — la boucle unique,
- les modules par domaine : `physics/`, `graphics/`, `anim/`, `input/`, `audio/`, `time/`.

**Il n'existe aucun « System ».** Aucun `PhysicsSystem`, aucun `RenderSystem`.
La physique est dans `Collider.update()`, l'animation dans `Animator.update()`.
L'organisation historique est **par module de domaine**, et la logique est **dans les
composants**.

### 6.2 La boucle

`Renderer.render()` (`src/core/renderer.js:164`) fait, dans une seule passe par objet :

1. tri par `layer` (`Object.values().sort()` — **réalloue un tableau chaque frame**),
2. `obj.update()` si non en pause,
3. **picking souris et détection des poignées de redimensionnement (code Editor)**,
4. `ctx.save()`, projection caméra, zoom, rotation objet,
5. `obj.draw()`, puis `obj.preview()` si `inspector`,
6. `ctx.restore()`,
7. `obj.select(ctx)` si sélectionné.

Update et draw sont donc **entrelacés par objet** : l'objet 2 est mis à jour après que
l'objet 1 a été dessiné. Un composant qui lit la position d'un autre objet lit un état
mixte — source de non-déterminisme, problématique pour un moteur multijoueur.

Le serveur, lui, sépare proprement : il boucle sur tous les `obj.update()` sans dessin.

`src/core/renderer.js:6` :

```js
import { Dnd } from '/editor/system/dnd.js';
```

**Le Core importe l'Editor.** C'est la violation de couche la plus visible du dépôt :
le runtime de jeu ne peut pas être chargé sans le module de drag & drop de l'IDE.

### 6.3 Le runtime est cassé hors ligne ✅

`Keyboard.keys(uid)` retourne `Network.getUser(uid)?.keys`, et `Network.users` n'est
initialisé que dans `Network.init()`. En mode hors ligne (`const online = false` dans
`app.js`) :

```
Controller.update(self)
  → Keyboard.keyPressed(self.uid)      // self.uid === undefined
    → Network.getUser(undefined)
      → this.users[undefined]           // this.users === undefined
        → TypeError
```

Vérifié : `o.update()` lève une `TypeError` **à chaque frame et par composant**,
silencieusement absorbée par le `try/catch` de `Object.update()`. L'objet ne bouge pas.

**Conséquence : le mode solo hors ligne ne fonctionne pas, et rien ne le signale.**
`Input` dépend de `Network`, ce qui est un couplage de couche inversé.

---

## 7. Editor

### 7.1 Comment la synchronisation temps réel fonctionne réellement ✅

Il n'y a **pas** de framework réactif, **pas** de virtual DOM, **pas** d'état dupliqué.
Le mécanisme tient en trois lignes :

1. **Liaison par classe CSS.** Chaque champ éditable porte `class="<objectId>-<prop>"`,
   ou `class="<objectId>-<Component>.<prop>"` pour un composant.
2. **Résolution par requête globale.** `document.getElementsByClassName(obj.id + '-' + p)`
   retourne *toutes* les vues de cette propriété, où qu'elles soient dans le document.
3. **Garde de focus.** `if (el[i] !== document.activeElement)` — le champ en cours de
   saisie n'est jamais réécrit.

Le cycle complet d'une frappe dans l'Inspector :

```
input "P"
  → Properties.updateCurrentObject(el)
    → object.$name = "P"
      → setter $name
        → this.name = "P"        → dispatch setProperty ──┐
        → dispatch syncProperty ─────────────────────┐    │
                                                     │    │
   Network.sync()  ◄──────────────────────────────────┘    │
     → send('update', {id, prop:'name', value:'P'})        │
                                                           │
   Properties + Hierarchy  ◄────────────────────────────────┘
     → getElementsByClassName('<id>-name')
     → écrit dans tous les éléments sauf activeElement
```

✅ Vérifié lettre par lettre (`P`, `Pl`, `Pla`, `Play`) : les deux vues — champ
Inspector et `contenteditable` de la Hierarchy — reflètent chaque frappe.

**Il existe bien une source de vérité unique : l'`Object` lui-même.** Le DOM n'est
qu'une projection. C'est simple, direct, et cela marche. C'est aussi la raison pour
laquelle il ne faut pas introduire de store séparé en v2.

Coût : `getElementsByClassName` sur `document` entier à chaque changement de propriété,
et un identifiant global qui casse si deux panneaux affichent le même objet
différemment.

### 7.2 L'Inspector est déjà générique

`editor/windows/properties.js` **ne contient aucun `if (component === "Health")`.**
Il réfléchit sur l'objet et déduit le widget du type de la valeur :

| Valeur | Widget |
|---|---|
| `number` | `<input type="text">` |
| `boolean` | `<input type="checkbox">` |
| `string` commençant par `#` | `<input type="color">` |
| `string` | `<input type="text">` |
| `Color` | `<input type="color">` |
| autre objet | `<input type="text">` |

Le « schéma » est donc **implicite et inféré de la valeur à l'instant T**.

Limites : liste noire codée en dur (`id`, `uid`, `scale`, `static`, `type`, `active`,
`visible`, `lock`, `image`, `parent`, `components`, `childs`) ; pas de min/max, pas
d'unité, pas d'énumération, pas d'infobulle ; branches `case 'TODO Range'`,
`'TODO Array'`, `'TODO Enumeration'`, `'TODO Image'`, `'TODO Button'` jamais atteintes
(comparées à `value.constructor.name`) ; une propriété `number` initialisée à `0` et
une couleur initialisée à `''` sont mal typées ; `updateProperty` fait `parseInt` sur
les nombres, ce qui **tronque les décimales à l'affichage**.

L'icône de composant est en revanche un `switch` sur le nom (`appendName`) — le seul
endroit réellement spécifique par composant.

### 7.3 Le couplage DOM

Les modules `editor/misc/*.js` s'exécutent au chargement et attaquent des `id` fixes :

```js
document.getElementById('play').addEventListener('click', …)   // play.js
document.getElementById('pause').addEventListener('click', …)  // pause.js
document.getElementById('sync').addEventListener('click', …)   // sync.js
```

`sync.js` référence `#sync`, qui est commenté dans `index.html` — le module lèverait
une erreur, il n'est simplement pas importé par `app.js`. Les fenêtres (`Hierarchy`,
`Properties`, `Project`) reçoivent un `id` de conteneur et supposent que tout le
squelette HTML existe déjà dans `index.html` (700 lignes).

**Conséquence : ajouter une fenêtre exige d'éditer `index.html`, `app.js`, un fichier
CSS et le module.** C'est le vrai problème de modularité de l'Editor — pas le fait
d'utiliser le DOM.

`Handler` (`editor/system/handler.js`, 27 ko) concentre tout le viewport : drop,
sélection, drag, redimensionnement 8 directions (le `switch` de 8 cas est **dupliqué**
entre objet et composant), pan, zoom. Aucune notion d'outil ni de commande.

---

## 8. Network

### 8.1 Topologie

```
Editor (inspector = true)        Joueur (inspector = false)
   │  update / add / remove          │  mousemove / keydown / keyup
   │  addComponent / addChild        │
   ▼                                 ▼
        ┌───────────────────────────────┐
        │  Serveur Deno (privé)         │
        │  import mod.js du client      │
        │  scene = new Scene()          │
        │  setInterval(loop, 16ms)      │  → obj.update()
        │  setInterval(heartbeat, 4000) │  → broadcast(scene.objects)
        └───────────────────────────────┘
```

Le serveur importe **le même `mod.js` que le client**, servi en HTTPS depuis
`editor.pixelcreator.io`. Confirmation directe que le Core est partageable.

### 8.2 Messages réels et besoin fonctionnel derrière

| Message | Sens | Besoin sous-jacent |
|---|---|---|
| `init` | le client demande la scène, le serveur renvoie `scene.objects` | **bootstrap d'état** |
| `getUID`, `getUsers`, `connection`, `disconnection` | présence | **identité et présence** |
| `heartbeat` / `beat` | scène complète toutes les 4 s | **réconciliation d'état** |
| `update` | `{id, type, component, prop, value}` | **mutation de propriété** |
| `add` / `remove` | objet (stringifié) / id | **cycle de vie d'objet** |
| `addComponent` / `removeComponent` | | **composition** |
| `addChild` / `removeChild` | | **hiérarchie** |
| `upload_file` / `update_file` / `delete_file` | | **cycle de vie de ressource** |
| `mousemove` / `mousedown` / `mouseup` / `keydown` / `keyup` | par utilisateur | **entrées joueur** |
| `pause` | démarre/arrête la boucle serveur | **contrôle du runtime** |
| `save` | corps vide côté serveur | **persistance (non implémentée)** |
| `message` | broadcast texte | chat/debug |

**Le message `update` est déjà une opération.** `{id, component, prop, value}` est
littéralement un `SET_PROPERTY` sans nom. `addComponent`, `addChild`, `add`, `remove`
sont déjà `ADD_COMPONENT`, `ADD_CHILD`, `ADD_OBJECT`, `REMOVE_OBJECT`.

Ce qui manque pour en faire des Operations exploitables : la valeur précédente
(pas d'undo), un horodatage/numéro de séquence (pas d'ordre total), un auteur
(pas de collaboration), un regroupement transactionnel (un drag = des centaines
d'opérations indépendantes).

### 8.3 Comportements notables

- **Aucune autorité.** Le serveur applique ce qu'on lui envoie puis rediffuse aux
  autres (`client.broadcast`). N'importe quel client peut modifier n'importe quel objet.
- **Pas d'écho à l'émetteur** : `client.broadcast` exclut l'auteur. C'est la prévention
  de boucle. Combinée à `setProperty()` côté réception (qui n'émet pas `syncProperty`),
  elle évite les allers-retours infinis.
- **Le heartbeat écrase.** `Network.heartbeat` fait `obj.copy(data[id])` sur chaque
  objet, toutes les 4 s, avec les limites de `copy()` (§3.3). Une valeur saisie dans
  l'Inspector peut être écrasée par un heartbeat en vol.
- **Aucune interpolation.** `// TODO: Interpolate the movement` dans `Network.update`.
- **Les entrées sont routées par utilisateur** : `Network.users[uid].keys`. Un objet
  n'est contrôlable que si son `uid` correspond à un utilisateur connecté (§6.3).
- **`Network.sync()` n'est activé que si `inspector === true`** : seul l'Editor pousse
  des mutations ; les joueurs n'envoient que des entrées.
- Une propriété `Camera` reçue est traitée à part et recentrée (`camera.x -= width/2`).

---

## 9. Visual scripting

### 9.1 État réel

`editor/graph/graph.js` + `node.js` : éditeur de nœuds fonctionnel — création par
drag & drop, connecteurs entrée/sortie/erreur, chemins SVG en Bézier, pan et zoom
(récemment améliorés, commits `e35e00b`, `8bd26bd`, `a52633b`).

Palette définie **en HTML** (`index.html`) :

- événements : `init`, `update`, `mouse`, `key`, `collision`, `timer`
- structures : `if`, `repeat`
- fonctions : `math`, `move`, `edit`, `create`, `delete`, `draw`, `print`

### 9.2 Ce qui n'existe pas

- **Aucun modèle de données.** Le graphe **est** le DOM : un nœud est un `<div>`, une
  connexion est un couple de connecteurs liés par des propriétés JS (`connector.other`,
  `connector.path`) posées sur les éléments DOM.
- **Aucune sérialisation.** Rien ne convertit le graphe en JSON. Fermer l'onglet perd tout.
- **Aucune compilation.** `Graph.updateScript()` fait `console.log(this.nodes)` puis
  `this.code = ''`. Les trois lignes utiles sont commentées.
- **Aucun lien avec le runtime.** Aucun objet n'exécute jamais un graphe.
- **Aucune variable, aucune métadonnée.**

`editor/graph/compiler.js` (`Compiler`) n'est **pas** un compilateur de graphe : c'est
un lexer/parser d'un langage textuel à syntaxe Rust (`i32`, `fn`, `let`, `struct`,
`match`, `mod`). Sa méthode `compile()` appelle `lex()`, `parse()`, `transpile()`,
`evaluate()` **sans préfixe `Compiler.`** et `evaluate` n'existe pas → toujours
`ReferenceError`. Code mort.

`editor/graph/component.js` définit une classe `Component` (id/name/type) sans rapport
avec les composants de jeu — collision de nom à éviter en v2.

### 9.3 `.px` aujourd'hui

**Contrairement à l'intention affichée, `.px` est traité comme du JavaScript.**
`Loader.allowedScriptsTypes` contient `'application/px'` à côté de
`'text/javascript'` ; un fichier `.px` suit donc exactement le chemin d'un `.js` :
lu en texte, transformé en Blob URL, passé à `import()`. Le serveur, lui, connaît
`application/pixelscript` — deux types MIME divergents pour la même idée.

---

## 10. Ressources

`Loader` (statique) est le registre unique : `Loader.files[id]`, `id = path + name`.

- Un fichier est un `File` natif **augmenté** par `System.createFile()` : `name`,
  `extension`, `path`, `id`, `value`, puis `System.sync()` dessus. Une ressource est
  donc réactive comme un `Object`, et transite par les mêmes événements.
- `Resource` (`src/core/resource.js`) existe mais **n'est jamais utilisée** — `Loader`
  fabrique des `File` augmentés à la place.
- Images : lues en DataURL (`readAsDataURL`) → `file.value` contient le base64 complet.
  Ces ressources partent donc **en base64 dans le JSON** vers le serveur.
- Scripts : lus en texte, puis `createScriptComponent()` → `URL.createObjectURL` →
  `import()` → `module.default` est la classe de composant.
- **Hot reload réel** : `Loader.import()` émet `import`, `Scene` l'écoute et réinjecte
  le composant dans tous les objets qui le portent. Renommer un script réécrit même la
  déclaration `class` par expression régulière.
- Persistance : `XMLHttpRequest` POST/PUT/DELETE vers le serveur, qui écrit sur disque.
  `Store`/`Database` (IndexedDB) existent mais ne sont câblés à rien.
- Les Blob URL créées ne sont jamais révoquées (fuite mémoire à chaque réimport).

---

## 11. Chargement dynamique de composants

Le mécanisme fonctionne et mérite d'être conservé :

```
fichier .js du projet → Blob URL → import() → module.default → new Component()
                                                  │
                                        dispatch('import') → Scene.update()
                                                  │
                                        réinjection dans les objets concernés
```

Limite : `plugins/test.js` — le seul exemple de plugin — importe `Manager` depuis
`/editor/system/manager.js` et appelle `Manager.addComponent(Test, …)` en **statique**,
alors que `addComponent` est une **méthode d'instance**. Le plugin d'exemple est cassé,
et il couple un composant de jeu à l'IDE.

---

## 12. Logging

Aucun logger. Des `console.log` avec styles CSS inline, dispersés :

| Couleur | Motif | Sens |
|---|---|---|
| `#11AB0D` vert | `[SERVER] …` | trafic réseau |
| `#3b78ff` bleu | `info: …` | information moteur |
| `#F9F1A5` jaune | `warn: …` | avertissement |

Codifié partiellement dans `System.log/debug/warn`, mais **la plupart des appels
n'utilisent pas ces helpers** et réécrivent le style à la main. `System.getDate()`
formate un horodatage qui n'est jamais utilisé.

L'identité visuelle (catégories colorées) est un acquis à conserver.

---

## 13. Tests, outillage, dépendances

- **Aucun test.** Aucun framework, aucun fichier de test. `plugins/test.js` est un
  exemple de composant, pas un test.
- **Aucun build, aucun bundler, aucun `package.json`** dans `engine/`.
- **Zéro dépendance runtime.** Seuls Font Awesome (CSS local) et des polices Google
  (CDN) sont externes.
- **Imports absolus** (`/src/core/...`) : l'application doit être servie depuis la
  racine de `legacy/`.
- Outillage : `tools/dev-server.sh` (python http.server) — il sert la racine `engine/`,
  alors que l'application a besoin de la racine `legacy/`. À corriger.

### Documentation existante

- `docs/architecture.md`, `docs/coding-guidelines.md`, `docs/project-vision.md`,
  `docs/documentation.md` : décrivent des **intentions**, dont plusieurs sont
  contredites par le code.
  - « The editor never mutates engine state directly » — faux : `Handler` écrit
    `scene.current.$x = …` directement.
  - « Local update: `obj.setProperty('x', 100)` / Network: `obj.syncProperty('x', 100)` » —
    ces méthodes existent mais l'Editor utilise en réalité l'accesseur `$`.
  - « No component-to-component coupling » — faux : `Animator` pilote `Animation`,
    `Controller` appelle `self.translate()` qui appelle `components.collider.update()`.
- `reference/*.md` : documentation d'API décrivant une **API souhaitée**, pas l'actuelle
  (ex. `new Object({name, x, y})` en objet d'options, alors que le constructeur réel est
  positionnel). `reference/editor/collab.md` documente un module `Collab` (Socket.IO)
  **absent du code**.

Ces documents sont donc à traiter comme des sources d'intention, jamais comme des
descriptions du comportement.

---

## 14. Synthèse des couplages

```
 Core ──────► Editor      renderer.js importe editor/system/dnd.js        ❌ inversion
 Core ──────► DOM         object.createImage(), scene.updateName(el)      ❌ inversion
 Core ──────► Editor      scene.current, scene.currentComponent           ⚠ état d'IDE
 Input ─────► Network     Keyboard.keys(uid) → Network.users              ❌ casse le solo
 Loader ────► Network     URL du serveur codée dans le loader             ⚠
 Component ─► Editor      plugins/test.js importe Manager                 ❌
 Editor ────► index.html  getElementById sur ids fixes, partout           ⚠ modularité
 Serveur ───► HTTPS       import du mod.js du client par URL              ✅ acquis
```

---

## 15. Ce qui marche et qu'il faut protéger

1. Le triple canal d'écriture `x` / `$x` / `setProperty()` — la distinction est juste.
2. La synchronisation lettre par lettre par classe CSS + garde `activeElement`.
3. Le Core partagé client/serveur, prouvé en production.
4. `update(self)` / `draw(self)` avec `self` en argument — composants sérialisables,
   serveur sans rendu.
5. L'Inspector générique par réflexion.
6. Le hot reload de composants par `import()` dynamique + événement `import`.
7. Le `try/catch` par composant qui isole les scripts utilisateur.
8. Les ressources réactives (un fichier se comporte comme un objet).
9. Les entrées routées par `uid` — le modèle multijoueur est dans le moteur, pas à côté.
10. Le vocabulaire : `Object`, `Component`, `Scene`, `Resource`.
