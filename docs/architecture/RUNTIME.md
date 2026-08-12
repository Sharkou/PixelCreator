# Runtime

> Organisation par **modules de domaine**, pas en « Systems » (ADR-0005).

## OBSERVÉ

### Il n'y a pas de runtime identifié

`src/runtime/` ne contient que `environment.js` — 411 lignes de détection de plateforme
(WebGL, WebGPU, IndexedDB, mobile…), sans rapport avec la boucle de jeu. Le dossier est
un faux ami.

Le runtime réel est :

- `Renderer.render(scene, camera)` — la boucle unique ;
- les modules de domaine : `physics/`, `graphics/`, `anim/`, `input/`, `audio/`, `time/`.

**Aucun « System » n'existe.** La physique est dans `Collider.update()`, l'animation dans
`Animator.update()`. La logique vit dans les composants.

### La boucle client

`app.js` :

```js
Stats.begin();
Dnd.update();
Time.deltaTime = (Time.now() - Time.last) / (1000 / 60);
Performance.update();
requestAnimationFrame(loop);
renderer.render(scene, camera);
Ruler.active  ? Ruler.update(...) : false;
Grid.active   ? Grid.draw(...)    : false;
Stats.end();
```

`Renderer.render()` fait, **dans une seule passe par objet** :

1. tri par `layer` — `Object.values(...).sort()`, **réalloué à chaque frame** ;
2. `obj.update()` si non en pause ;
3. **picking souris et détection des poignées de redimensionnement — code Editor** ;
4. `ctx.save()`, projection caméra, zoom, rotation ;
5. `obj.draw()`, puis `obj.preview()` si `inspector` ;
6. `ctx.restore()` ;
7. `obj.select(ctx)` si sélectionné.

### Deux problèmes structurels

**a) Update et draw sont entrelacés par objet.** L'objet 2 est mis à jour *après* que
l'objet 1 a été dessiné. Un composant qui lit la position d'un autre objet lit un état
mixte, dépendant de l'ordre de tri par `layer`. Pour un moteur multijoueur, c'est une
source de non-déterminisme.

Le serveur, lui, sépare proprement : il boucle sur tous les `update()` sans dessiner.

**b) Le Core importe l'Editor.**

```js
// src/core/renderer.js:6
import { Dnd } from '/editor/system/dnd.js';
```

Le runtime de jeu ne peut pas être chargé sans le module de drag & drop de l'IDE.
C'est la violation de couche la plus visible du dépôt.

### Ambiguïté de Camera

`Camera` est une **classe de composant** (`background`, `max_x`, `offset`, `preview()`),
mais `Camera.main` contient un **`Object`** qui porte ce composant. Le renderer écrit
`camera.getComponent('Camera').background` tout en lisant `camera.x`, `camera.scale`.
Le même identifiant désigne deux choses selon le contexte.

### Le runtime est cassé hors ligne

Voir `MIGRATION.md` §4.1. `Controller` → `Keyboard` → `Network.users` (undefined) →
`TypeError` par frame, absorbée par le `try/catch` de `Object.update()`.
**Le mode solo ne fonctionne pas et rien ne le signale.**

---

## DÉCISIONS V2

**VALIDÉ :** domaines directement sous `runtime/`, sans couche `Systems/`.

```
runtime/
├── clock/           temps, delta-time, timers
├── physics/         collisions, corps, spatial hash
├── animation/       animator, animation, tween
├── rendering/       Canvas 2D, projection, abstraction de rendu
├── input/           état des entrées par owner, sans dépendance réseau
├── scripting/       exécution .px et .js
├── loop.js          orchestration des phases
└── mod.js           point d'entrée client (le serveur ne l'importe pas)
```

`audio/` et `camera/` s'ajoutent selon le besoin ; la liste n'est pas figée, c'est le
principe qui l'est : **un dossier = un domaine, pas de couche d'abstraction au-dessus.**

### Rendering — VALIDÉ

Backend v2 : **Canvas 2D**. Une abstraction légère est interposée pour qu'un backend
WebGL ou WebGPU reste possible plus tard, sans être conçue pour lui aujourd'hui.

Concrètement : `draw(self, renderer)` reçoit un objet `renderer` au lieu de lire le
singleton `Graphics.ctx`. Le vocabulaire se limite à ce que les composants utilisent
déjà (`rect`, `circle`, `image`, `text`, `fill`, `stroke`, `light`, transformations).

**Ne pas surarchitecturer** : pas de graphe de commandes, pas de batching, pas de
matériaux, pas de passes tant qu'un besoin réel ne l'exige pas.

### Phases séparées

```
frame:
  input.poll()
  for each object: object.update(ctx)     ← toute la simulation
  collisions.resolve()
  renderer.render(scene, camera)          ← puis tout le rendu
  editor.overlay()                        ← puis les surcouches IDE
```

C'est ce que le serveur fait déjà. Le client s'aligne.

**Attention (risque R7)** : séparer update et draw change l'ordre d'observation.
Un jeu Legacy peut dépendre involontairement de l'entrelacement. À vérifier sur une
scène de référence.

### Ce qui sort du renderer

`Dnd`, le picking souris, la détection des poignées, le rectangle de sélection et
`preview()` partent vers `editor/viewport/`. **C'est ce qui supprime l'import
`/editor/...` du Core.**

Le renderer expose une abstraction passée aux composants (`draw(self, renderer)`,
ADR-0004) au lieu du singleton `Graphics.ctx`.

### Corrections attendues

| Problème | Correction |
|---|---|
| `sort()` par frame | tri mis en cache, invalidé sur changement de `layer` |
| Update/draw entrelacés | phases séparées |
| `Core → Editor` | picking et surcouches déplacés |
| `Input → Network` | `ctx.input`, owner « local » toujours présent |
| Ambiguïté `Camera` | `Camera` = composant ; `Viewport` = projection ; `camera.main` = l'Object porteur, nommé sans ambiguïté |
| `Collider` O(n²) | `CollisionSystem` sur grille spatiale — **le seul « System » justifié** (ADR-0005) ; `SpatialHash` existe déjà et n'est branché à rien |
| `environment.js` mal rangé | vers `core/` ou `platform/` — ce n'est pas du runtime |

### Client vs serveur

La différence n'est pas dans le modèle mais dans les **modules chargés** :

| | Client | Serveur |
|---|---|---|
| `core/` | ✅ | ✅ |
| `runtime/physics`, `input`, `animation`, `clock` | ✅ | ✅ |
| `runtime/rendering`, `audio` | ✅ | ❌ |
| `component.update()` | ✅ | ✅ |
| `component.draw()` | ✅ | ❌ |
| `editor/` | optionnel | ❌ |

`ParticleSystem` illustre la coupure : `update()` des deux côtés, `draw()` client
uniquement.
