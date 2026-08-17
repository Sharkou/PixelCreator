# ADR-0004 — `update()` / `draw()` sont conservés

- **Statut :** **accepté** (2026-08-12)
- **Décide :** le contrat de cycle de vie d'un Component
- **Répond à :** « faut-il remplacer `Component.draw()` par un RenderSystem ? »

---

## Contexte observé

Il n'existe dans Legacy **aucune classe de base et aucune interface**. Un composant est
une classe quelconque, et le contrat est purement conventionnel, par duck-typing :

```js
// Object.update()
if (this.components[i].active && this.components[i].update)
    this.components[i].update(this);
```

Hooks réellement appelés :

| Hook | Appelé par | Contexte |
|---|---|---|
| `update(self)` | `Object.update()` | chaque frame, client **et serveur** |
| `draw(self)` | `Object.draw()` | client uniquement, si `obj.visible` |
| `preview(self)` | `Object.preview()` | client, si `renderer.inspector` |
| `onCollision(self, other)` | `Object.onCollision()` | |
| `onCollisionStart` / `onCollisionExit` | idem | |
| `constructorAfterLink(self)` | `Object.addComponent()` | |
| `detectMouse(self, x, y)` / `detectSide(self, x, y)` | `Renderer.render()` | éditeur |

**`self` est passé en argument, jamais stocké.** Un composant n'a aucune référence vers
son `Object`. C'est ce qui rend les composants sérialisables en JSON sans cycle, et ce
qui permet à `copyComponent()` de fonctionner par simple recopie de propriétés.

### La séparation update/draw est justifiée par le code, pas par la tradition

`ParticleSystem` (`legacy/src/graphics/particle.js`) est le cas d'école :

```js
update(self) { /* intègre position, vitesse, durée de vie de N particules */ }
draw(self)   { /* dessine les N particules, globalCompositeOperation = 'lighter' */ }
```

Le serveur exécute la boucle suivante — **et n'appelle jamais `draw()`** :

```js
for (let obj of Object.values(scene.objects).sort(...)) {
    if (obj.active) obj.update();
}
```

La simulation de particules peut donc tourner côté serveur et être répliquée, tandis que
le rendu reste client. Aucun autre découpage ne donne cela aussi simplement.

Répartition relevée sur les composants existants :

| | `update` seul | `draw` seul | les deux |
|---|---|---|---|
| Composants | `Controller`, `Body`, `Rotator`, `Collider`, `Animator`, `Timer` | `RectangleRenderer`, `Tilemap`\* | `Texture`, `CircleRenderer`, `Text`, `Light`, `Map`, `ParticleSystem` |

\* `Tilemap` déclare bien un `draw`, mais avec la signature `draw(ctx, camera)` —
incompatible avec `Object.draw()`, qui appelle `draw(this)`. Voir la décision ci-dessous.

---

## Décision

**Le modèle `update(self)` / `draw(self)` est conservé.** Il n'est pas remplacé par une
architecture de Systems.

**VALIDÉ :** un Component peut implémenter `update()`, `draw()`, ou **les deux**.
`ParticleSystem`, `Sprite` et `Tilemap` participent ainsi directement au rendu.

> **Précisé le 2026-08-13 — les quatre formes sont valides**, y compris **aucune des
> deux** : un composant de pure donnée est légitime, et un composant dont le comportement
> est un graphe `.px` n'a souvent aucune méthode (ADR-0015, ADR-0016). Le runtime et le
> `SceneRenderer` **vérifient l'existence du hook avant de l'appeler**, et un composant
> sans `draw()` ne coûte rien au rendu : la transformation d'un objet n'est établie que
> lorsqu'un composant dessine réellement. `draw()` n'est jamais requis côté serveur.
>
> **`preview()` ne fait pas partie du contrat v2.** Legacy l'appelait pour les surcouches
> d'IDE ; en v2 elles appartiennent à `editor/viewport/`, qui dessine par la même
> abstraction de renderer. Rien dans le runtime ne l'appelle, et un contrat lu aussi par
> le serveur n'a pas à porter une méthode d'éditeur.

> **Deux de ces trois cas ne sont pas conformes dans Legacy** — la décision v2 implique
> donc de les corriger, en abandonnant délibérément le comportement historique :
>
> | | Legacy | v2 |
> |---|---|---|
> | `Sprite` | **sous-classe d'`Object`** qui ajoute `Texture` + `Animator` dans son constructeur | **Component** à part entière |
> | `Tilemap` | `draw(ctx, camera)` → `TypeError` masquée si attaché | `draw(self, renderer)`, conforme |
> | `ParticleSystem` | déjà conforme | inchangé |
>
> `Lighting` et `LightSource` ne sont pas non plus des Components (`render(ctx, camera)`,
> `update()` sans `self`). Ils deviennent soit des Components conformes, soit un service
> de rendu explicitement hors du modèle de composition.

**VALIDÉ :** un `Object` ne porte **qu'un seul Component d'un type donné**. La clé de
`object.components` reste **le type**, comme dans Legacy — cela confirme le comportement
historique plutôt que de le changer.

> **Amendé par ADR-0021 (2026-08-14).** La clé reste `componentType(component)`. Ce qui est
> précisé, c'est que ce type est une **identité**, pas nécessairement un nom lisible : pour
> un Component livré c'est son nom de classe, qui est du code et donc stable ; pour un
> Component qu'un créateur fabrique, c'est le `ResourceId` opaque de sa définition, et son
> nom affiché vit dans `static label`. La formule d'origine, « le nom du type, comme dans
> Legacy », supposait un nom lisible et ne tient plus pour ce second cas — renommer aurait
> cassé toutes les instances.

> **Complété par ADR-0018 (2026-08-14).** L'**ordre** de `object.components` est désormais
> signifiant et persistant : c'est l'ordre d'`update`, l'ordre de `draw` à l'intérieur d'un
> objet, et l'ordre d'affichage de l'Inspector. La forme du getter est inchangée ; c'est
> l'ordre de ses clés qui cesse d'être un accident.

Trois précisions sont ajoutées :

### 1. Le contrat devient explicite

Documenté, testé, mais **toujours par duck-typing** : aucune classe de base obligatoire.
Un composant reste `class MonComposant { update(self) {} }`. C'est ce qui permet à un
débutant d'écrire un composant en dix lignes.

### 2. `draw` reçoit une abstraction de rendu

```js
draw(self, renderer)
```

au lieu de lire le singleton global `Graphics.ctx`. Cela permet de tester le rendu, de
rendre hors écran (les vignettes de la Hierarchy, aujourd'hui produites par
`Object.createImage()` qui manipule un canvas offscreen depuis le Core), et de changer
de backend plus tard.

**VALIDÉ :** le backend v2 est **Canvas 2D**. L'abstraction existe pour qu'un backend
WebGL/WebGPU reste possible, sans être conçue pour lui — elle se limite au vocabulaire
réellement utilisé aujourd'hui (`rect`, `circle`, `image`, `text`, `fill`, `stroke`,
`light`, transformations). **Ne pas surarchitecturer** : pas de graphe de commandes, pas
de batching, pas de matériaux tant qu'un besoin réel ne l'exige pas.

Cela **n'implique pas** que les composants deviennent des RenderSystems : un composant
garde sa propre logique de rendu quand c'est pertinent.

### 3. `update` reçoit un contexte

```js
update(self, ctx)   // ctx : { time, deltaTime, scene, runtime, input }
```

C'est ce qui découple `Controller` de `Keyboard` → `Network` (`ctx.input` au lieu du
singleton), et donc ce qui **répare le mode solo hors ligne** (voir `MIGRATION.md` §4.1).

Les deux paramètres sont optionnels : un composant qui ignore le second continue de
fonctionner.

---

## Un « System » n'est introduit que s'il décrit quelque chose de réel

Le mot n'est pas interdit — il est simplement réservé aux cas où un module orchestre
véritablement plusieurs objets. Exemple légitime : la détection de collisions.

**OBSERVÉ :** `Collider.testCollisions(self)` boucle sur `Scene.main.objects` **depuis
un composant**, ce qui donne O(n²) et un couplage du composant à la scène globale
(par ailleurs cassé : `Scene` n'est pas importé dans `collider.js`). `SpatialHash`
existe déjà dans `src/physics/` mais n'est branché à rien.

Un `CollisionSystem` qui balaie une grille spatiale et appelle ensuite
`obj.onCollision(other)` serait un vrai système. Ce n'est pas une case dans un
organigramme : c'est un algorithme qui n'a nulle part ailleurs où vivre.

**Aucun `RenderSystem`, `PhysicsSystem`, `AnimationSystem` ou `ScriptSystem` n'est créé
par principe.**

---

## Conséquences

### Positives

- Continuité totale pour les composants utilisateurs existants.
- Le serveur reste sans rendu, sans effort.
- Le modèle mental « un composant = un comportement » est préservé — c'est le concept
  central pour un public débutant.

### Négatives

- Le duck-typing ne détecte pas les fautes de frappe (`updat()` ne sera jamais appelé,
  silencieusement). Mitigation : mode développement qui signale les méthodes non
  reconnues sur un composant.
- La logique reste dans les composants, donc les optimisations globales (batching de
  rendu, culling) doivent être faites par le renderer sans coopération des composants.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Systems (Physics/Render/Animation/Script)** | Aucun fondement dans le code. Retirerait la logique des composants, cassant le modèle mental débutant et la sérialisabilité. Explicitement écarté par la vision. |
| **ECS (composants = données pures)** | Interdirait `Component.draw()` et `update()`. Pixel Creator vise la lisibilité, pas le débit sur 100 000 entités. |
| **`this.object` au lieu de `self` en argument** | Introduit un cycle : casse `JSON.stringify`, `copyComponent()` et la réplication. |
| **Classe de base `Component` obligatoire** | Ajoute une cérémonie pour zéro bénéfice ; casse les composants utilisateurs existants. |
