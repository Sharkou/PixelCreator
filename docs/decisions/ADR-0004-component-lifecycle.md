# ADR-0004 — `update()` / `draw()` sont conservés

- **Statut :** proposé
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

Répartition mesurée sur les composants existants :

| | `update` seul | `draw` seul | les deux |
|---|---|---|---|
| Composants | `Controller`, `Body`, `Rotator`, `Collider`, `Animator`, `Tilemap` | `RectangleRenderer`, `CircleRenderer`, `Text` | `Texture`, `Light`, `ParticleSystem`, `Lighting` |

---

## Décision

**Le modèle `update(self)` / `draw(self)` est conservé.** Il n'est pas remplacé par une
architecture de Systems.

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
changer de backend, et de rendre hors écran (les vignettes de la Hierarchy, aujourd'hui
produites par `Object.createImage()` qui manipule un canvas offscreen depuis le Core).

Cela **n'implique pas** que les composants deviennent des RenderSystems : un composant
garde sa propre logique de rendu quand c'est pertinent.

### 3. `update` reçoit un contexte

```js
update(self, ctx)   // ctx : { time, input, scene, environment }
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
