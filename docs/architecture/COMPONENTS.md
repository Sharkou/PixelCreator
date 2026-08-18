# Components

> Voir ADR-0004 (lifecycle) et ADR-0007 (schéma).

## OBSERVÉ — le contrat réel

Aucune classe de base, aucune interface. Un composant est une classe quelconque ;
le contrat est du **duck-typing** :

```js
export class Rotator {
    constructor(speed = 2) { this.rotation = 0; this.speed = speed; }
    update(self) {
        this.rotation = (this.rotation + this.speed * Time.deltaTime) % 360;
        self.rotate(this.rotation);
    }
}
```

**`self` est passé en argument, jamais stocké.** C'est ce qui rend les composants
sérialisables sans cycle et permet à `copyComponent()` de fonctionner par recopie.

`component.name` est écrasé par `addComponent()` avec `component.constructor.name`, et
sert de clé dans `object.components{}`. Conséquences : **un seul composant par type**,
et **la minification casserait tout**.

### Hooks appelés

| Hook | Appelé par | Contexte |
|---|---|---|
| `update(self)` | `Object.update()` | chaque frame, client **et serveur** |
| `draw(self)` | `Object.draw()` | client, si `obj.visible` |
| `preview(self)` | `Object.preview()` | client, si `renderer.inspector` |
| `onCollision(self, other)` | `Object.onCollision()` | |
| `onCollisionStart` / `onCollisionExit` | idem | |
| `constructorAfterLink(self)` | `Object.addComponent()` | seul « après attachement » |
| `detectMouse(self, x, y)` / `detectSide(self, x, y)` | `Renderer.render()` | éditeur |

`active` est posé à `true` par `addComponent()` et testé avant chaque hook.

---

## Inventaire

Relevé systématique des hooks réellement déclarés.

| Composant | `update` | `draw` | `preview` | Serveur | Notes |
|---|:--:|:--:|:--:|:--:|---|
| `Camera` | | | ✅ | données | `Camera.main` contient un **Object**, pas un `Camera` |
| `Texture` | ✅ | ✅ | | non | recherche `Loader.files` **à chaque frame** |
| `RectangleRenderer` | | ✅ | | non | |
| `CircleRenderer` | ✅ | ✅ | | non | |
| `Text` | ✅ | ✅ | | non | |
| `Light` | ✅ | ✅ | | partiel | `update` **écrase `self.width`/`self.height`** chaque frame |
| `Map` | ✅ | ✅ | | non | |
| `ParticleSystem` | ✅ | ✅ | | **oui pour `update`** | cas d'école du split update/draw |
| `Collider` | ✅ | | ✅ | oui | référence `Scene.main` **sans import** → erreur masquée |
| `RectCollider` / `CircleCollider` | ✅ | | ✅ | oui | portent aussi `detectMouse`/`detectSide` |
| `Controller` | ✅ | | | oui | lit `Keyboard.keys(self.uid)` → **dépend de Network** |
| `Body` | ✅ | | | oui | écrit `self.x`/`self.y` |
| `Rotator` | ✅ | | | oui | |
| `Animator` | ✅ | | | discutable | délègue à `Animation` |
| `Animation` | ✅ | | | discutable | appelé par `Animator`, pas par `Object` |
| `Timer` | ✅ | | | oui | |
| `Sound` / `Audio` | | | | non | services statiques, pas des composants |
| `SpatialHash` | | | | oui | exporté dans `mod.js`, **instancié nulle part** |

### Trois « composants » ne respectent pas le contrat

Exportés par `mod.js` au même titre que les autres, mais avec des signatures
incompatibles avec `Object.update()` / `Object.draw()` :

| Classe | Signature réelle | Ce qui se passe si on l'attache à un `Object` |
|---|---|---|
| `Tilemap` | `draw(ctx, camera)` | `Object.draw()` appelle `draw(this)` → `ctx` reçoit l'**Object**, `camera` est `undefined` → `TypeError` immédiate, **absorbée par le `try/catch`** |
| `Lighting` | `render(ctx, camera)`, `init`, `addLight` | jamais appelée — ce n'est pas un composant mais un service de rendu |
| `LightSource` | `update()` **sans `self`** | fonctionne par hasard (n'utilise pas `self`), mais viole le contrat |

C'est la conséquence directe de l'absence de contrat explicite : rien ne signale
qu'une classe n'est pas attachable. Le duck-typing accepte tout, et le `try/catch`
masque l'échec.

### Seuls 7 composants sont accessibles depuis l'UI

`Manager` n'expose que `Camera`, `Texture`, `CircleRenderer`, `RectangleRenderer`,
`Collider`, `Controller`, `Rotator`. `Light`, `Map`, `Animation` et `Animator` sont
**commentés** ; `Text`, `ParticleSystem`, `Body`, `Tilemap`, `Timer`, `Sound` ne sont pas
listés du tout — bien qu'exportés et fonctionnels pour la plupart.

### Pourquoi le split update/draw est justifié

`ParticleSystem` simule N particules dans `update()` et les dessine dans `draw()`.
Le serveur exécute :

```js
for (let obj of Object.values(scene.objects).sort(...))
    if (obj.active) obj.update();      // jamais draw()
```

La simulation tourne côté serveur et se réplique ; le rendu reste client. **Aucun autre
découpage ne donne cela aussi simplement.** C'est une observation, pas une préférence.

### Couplages à corriger

| Problème | Fichier |
|---|---|
| `Collider.update()` référence `Scene.main` non importé → `ReferenceError` masquée | `physics/collider.js:44` |
| `Controller` → `Keyboard` → `Network` : **casse le solo hors ligne** | `physics/controller.js` |
| `Texture.update()` : recherche de dictionnaire par frame et par objet | `graphics/texture.js` |
| `Light.update()` écrase `self.width`/`self.height`, annulant l'Inspector | `graphics/light.js` |
| Champs `#privés` invisibles au Property System (`Texture`, `Collider`) | ADR-0003 |
| `plugins/test.js` appelle `Manager.addComponent()` en statique (c'est une méthode d'instance) et couple un composant à l'IDE | `plugins/test.js` |

---

## PROPOSITION V2

### Contrat

```js
update(self, ctx)        // ctx : { time, deltaTime, scene, runtime, input }
draw(self, renderer)
bounds(self)             // géométrie optionnelle — voir ci-dessous
onCollision(self, other) / onCollisionStart / onCollisionExit
onAttach(self) / onDetach(self)   // remplace constructorAfterLink
```

Les deux paramètres sont optionnels : un composant qui ignore le second continue de
fonctionner. **Toujours du duck-typing, aucune classe de base obligatoire** — écrire un
composant doit rester une affaire de dix lignes.

**Les quatre formes sont toutes valides**, et le runtime vérifie l'existence du hook avant
de l'appeler :

| Forme | Simulation | Rendu |
|---|---|---|
| aucune méthode | — | aucun coût |
| `update()` seul | client **et serveur** | aucun coût |
| `draw()` seul | — | client uniquement |
| `update()` + `draw()` | client **et serveur** | client uniquement |

Un composant sans `draw()` ne coûte **rien** au rendu : le `SceneRenderer` n'établit la
transformation d'un objet que lorsqu'un composant dessine réellement. `draw()` n'est jamais
requis côté serveur, qui ne construit pas de renderer.

> **`preview()` ne fait pas partie du contrat v2.** Legacy l'appelait depuis
> `Renderer.render()` pour les surcouches d'IDE ; en v2 ces surcouches appartiennent à
> `editor/viewport/`, qui dessine par la même abstraction de renderer et définira son
> propre crochet s'il en a besoin. Un contrat de runtime, lu aussi par le serveur, n'a pas
> à porter une méthode d'éditeur que rien n'appelle.

`ctx.input` remplace le singleton `Keyboard` : c'est ce qui découple les entrées du
réseau et **répare le mode solo**. Il est indexé par owner (ADR-0014) :

```js
update(self, ctx) {
    const input = ctx.input.of(self.owner);
    if (input.isDown('ArrowRight')) self.x += this.speed * ctx.deltaTime;
}
```

### Un Component peut avoir un graphe `.px` (ADR-0015)

Un type de Component concret — `Controller`, `Health`, `Weapon` — peut voir son
comportement défini par un graphe portant son nom :

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

`Controller.px` est le **comportement interprété** du Component, pas un composant :
**il n'existe pas de Component `Script`**, et un `.px` ne génère aucun type de composant.

Le graphe est lié au **type** (`behaviors.bind(Controller, graph)`), donc rien du graphe
n'entre dans les données sérialisées d'un composant : un `Controller` sérialise `speed`,
et c'est tout. Chaque instance reçoit son propre comportement, si bien que deux
`Controller` ne partagent jamais leurs variables ni leurs minuteurs.

Le graphe reçoit le composant tel que l'Object le détient — le `Proxy` réactif — donc une
écriture depuis un graphe est une écriture ordinaire : même `Change`, même réplication,
même Inspector qu'une écriture de code écrit à la main.

Le runtime exécute, pour un composant actif, son `update` **puis** le graphe lié à son
type. Dessiner reste l'affaire du type de Component, qui déclare `draw` (ADR-0015 §9).

Le point d'entrée temporel du graphe est le nœud **`On Update`** : ce qu'il déclenche
participe à la **même simulation** que `update()`, donc au même pas fixe, au même ordre
déterministe, et tourne **côté serveur comme côté client**.

### Un Component créé par un utilisateur (ADR-0016)

Un Component est **propriétés + comportement**. Un composant livré avec le moteur écrit
cela en JavaScript ; un composant qu'un créateur fabrique dans l'éditeur le décrit comme
une **définition**, en JSON :

```json
{
  "type": "res_c3",
  "label": "Controller",
  "properties": { "speed": { "id": "p7", "type": "number", "default": 120 } },
  "graph": { "version": 1, "nodes": [], "connections": [] }
}
```

```js
const Controller = components.register(defineComponent(definition));
behaviors.bind(Controller, definition.graph);   // le graphe RÉSOLU, jamais un identifiant
```

**`type` est le `ResourceId` de la définition, `label` le nom affiché** (ADR-0021) : un
renommage réécrit un champ d'une ressource et ne touche ni instance, ni scène, ni projet
enregistré.

**Chaque propriété porte un `id`, et c'est lui qu'un nœud du graphe stocke** (ADR-0027). Le
schéma reste indexé par nom — c'est ce que lit `defineComponent()` et ce qu'affiche
l'Inspector — mais renommer `speed` en `walkSpeed` laisse le graphe câblé, parce que ce qui
est référencé est l'identité. Le Core ignore ce champ : il ne valide que `type`.

Une propriété supprimée ne laisse **jamais** de référence pendante : `validateGraph()` rend
`MISSING_PROPERTY`, la fenêtre Graph cerne le nœud, et l'interprète lève un `GraphError` que
le runtime rapporte (ADR-0012). Le graphe n'est pas réécrit — un geste ne doit pas modifier
deux choses que le créateur voit, et l'undo devrait alors deviner laquelle rendre.

`defineComponent()` en fait une **classe de composant ordinaire** : registre,
`addComponent()`, Inspector, sérialisation — rien en aval ne distingue un composant né
d'une donnée d'un composant écrit à la main. Toute clé du schéma existe sur une instance
neuve avec son défaut, donc l'Inspector, la sérialisation et le graphe s'accordent sur ce
qu'est un `Controller`.

La définition appartient au **type** : mille `Controller` dans une scène, c'est mille
`speed` et **un seul** graphe.

### `active` — qui lit, qui écrit (ADR-0012)

`active` est une **propriété réactive ordinaire**. Aucun mécanisme spécial ne lui est
attaché. Seule la direction d'usage est normative :

| | |
|---|---|
| **Lue** | par le Runtime et le SceneRenderer, pour décider d'exécuter `update()` / `draw()`. Propriété absente = actif |
| **Écrite** | par le code utilisateur, un Component ou l'Editor, via le Property System normal |
| **Jamais écrite** | par le Runtime — y compris en réaction à une exception |

Une écriture de `active` est un `Change` comme un autre, donc réplicable. Un Runtime qui
désactiverait un composant fautif ferait dépendre l'état de simulation du fait qu'un
script a levé une exception sur telle machine, à telle frame. Voir ADR-0012.

### `bounds(self)` — capacité géométrique optionnelle, **pas** une API de picking

Un composant qui possède réellement une étendue peut la déclarer, **en espace local** de
l'objet, sous la forme `{ x, y, width, height }`. C'est le cas de `RectangleRenderer`,
`Sprite` et `Tilemap`. Ce n'est pas le cas de `ParticleSystem` ni d'un composant de pure
logique, et **il ne faut pas les y forcer** : `bounds()` n'est pas généralisé à tous les
Components.

**Ce n'est pas le système de sélection.** Le picking de l'Editor doit aussi atteindre des
objets qui ne portent aucune géométrie de jeu, ce qu'une représentation éditoriale seule
permet de déterminer. Trois géométries restent distinctes :

- géométrie de **gameplay** (collision) ;
- géométrie de **rendu** ;
- géométrie de **picking Editor**.

Aucun code du runtime n'appelle `bounds()` aujourd'hui, et **rien ne doit être construit
dessus** tant que le modèle de sélection de l'Editor n'est pas conçu. Le picking
appartient à l'Editor (`architecture/EDITOR.md`), pas au Core.

`ctx.input` remplace le singleton `Keyboard` : c'est ce qui découple les entrées du
réseau et **répare le mode solo**.

`renderer` remplace le singleton `Graphics.ctx` : rend le rendu testable et permet le
rendu hors écran (vignettes de la Hierarchy, aujourd'hui produites par
`Object.createImage()` depuis le Core).

### Schéma optionnel

```js
export class Controller {
    static schema = {
        speed:  { type: 'number', default: 2, min: 0, max: 20 },
        layout: { type: 'enum', values: ['wasd', 'zqsd', 'arrows'], default: 'zqsd' }
    };
    static icon = 'fas fa-gamepad';
    static category = 'physics';
}
```

Sans `schema`, l'Inspector retombe sur l'inférence réflexive actuelle (ADR-0007).
`icon` et `category` remplacent le `switch` codé en dur de `properties.js` et la liste
codée en dur de `Manager`.

### Registre

Un registre explicite remplace la résolution par recherche de nom dans `mod.js` :

```js
components.register(Controller);       // composants du moteur
components.register(await import(url)); // composants du projet, chargés dynamiquement
```

Cela conserve le **hot reload** de Legacy (`import()` → événement `import` → réinjection
dans tous les objets porteurs), qui fonctionne bien, tout en supprimant le couplage des
plugins à `editor/system/manager.js`.

**VALIDÉ (Q4) :** un `Object` ne porte **qu'un seul Component d'un type donné**. La clé
de `components` reste le nom du type. Le comportement Legacy est confirmé, pas modifié.

### Composants non conformes à corriger — VALIDÉ

La décision « un Component peut faire `update()`, `draw()` ou les deux, et participer
directement au rendu » nomme explicitement `ParticleSystem`, `Sprite` et `Tilemap`.
Deux de ces trois ne sont pas conformes aujourd'hui :

| | Legacy | v2 |
|---|---|---|
| `ParticleSystem` | conforme | inchangé |
| `Sprite` | **sous-classe d'`Object`**, pas un Component | devient un **Component** |
| `Tilemap` | `draw(ctx, camera)` → `TypeError` masquée | `draw(self, renderer)` |
| `Lighting` / `LightSource` | hors contrat | Components conformes, ou service de rendu explicitement hors modèle |

C'est un abandon délibéré de comportements Legacy erronés, autorisé par la décision
« pas de migration de projets v1 ».
