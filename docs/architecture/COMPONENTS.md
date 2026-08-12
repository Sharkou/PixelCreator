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
update(self, ctx)        // ctx : { time, deltaTime, scene, runtime, input, scripting }
draw(self, renderer)
bounds(self)             // géométrie optionnelle — voir ci-dessous
preview(self, renderer)  // éditeur uniquement
onCollision(self, other) / onCollisionStart / onCollisionExit
onAttach(self) / onDetach(self)   // remplace constructorAfterLink
```

Les deux paramètres sont optionnels : un composant qui ignore le second continue de
fonctionner. **Toujours du duck-typing, aucune classe de base obligatoire** — écrire un
composant doit rester une affaire de dix lignes.

`ctx.input` remplace le singleton `Keyboard` : c'est ce qui découple les entrées du
réseau et **répare le mode solo**. Il est indexé par owner (ADR-0014) :

```js
update(self, ctx) {
    const input = ctx.input.of(self.owner);
    if (input.isDown('ArrowRight')) self.x += this.speed * ctx.deltaTime;
}
```

`ctx.scripting` est l'hôte de scripting, ou `null` quand le runtime n'exécute aucun
script (ADR-0015).

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
