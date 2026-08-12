# ADR-0005 — Le Runtime s'organise par modules de domaine, pas en « Systems »

- **Statut :** proposé
- **Répond à :** l'hypothèse `Runtime/Systems/{Physics,Animation,Render,Script}System`

## Contexte observé

Une proposition antérieure suggérait :

```
runtime/systems/
├── PhysicsSystem
├── AnimationSystem
├── RenderSystem
└── ScriptSystem
```

Confrontation au code : **Legacy n'a jamais eu de System.**

- La physique est dans `Collider.update()` et `Body.update()`.
- L'animation est dans `Animator.update()`, qui délègue à `Animation.update()`.
- Le rendu est dans `Renderer.render()` **plus** le `draw()` de chaque composant.
- Le scripting est un composant chargé par `import()` dynamique.

L'organisation historique est **par domaine** :

```
src/physics/  src/graphics/  src/anim/  src/input/  src/audio/  src/time/  src/math/
```

Elle se lit bien : on cherche une collision, on ouvre `physics/collider.js`.

Note : `src/runtime/` existe mais ne contient que `environment.js` (détection de
plateforme, 411 lignes) — aucun rapport avec la boucle de jeu. Le dossier est un
faux ami.

## Décision

**Conserver l'organisation par module de domaine.**

```
runtime/
├── loop.js
├── renderer/
├── physics/
├── anim/
├── input/
├── audio/
└── camera/
```

Le mot « System » n'est pas interdit. Il est **réservé aux modules qui orchestrent
réellement plusieurs objets** — et seulement quand l'algorithme n'a nulle part ailleurs
où vivre.

### Le seul candidat identifié

`Collider.testCollisions(self)` boucle sur `Scene.main.objects` depuis un composant :
O(n²), couplage du composant à la scène globale, et référence `Scene` non importée
(bug masqué par le `try/catch` de `Object.update()`). `SpatialHash` existe dans
`src/physics/` et n'est branché à rien.

Un `CollisionSystem` qui balaie une grille spatiale puis appelle `obj.onCollision(other)`
serait un vrai système : il résout un problème algorithmique que le composant ne peut
pas résoudre seul. **C'est le seul cas où le terme est justifié à ce jour.**

## Justification

- Aucune observation ne soutient l'architecture Systems.
- Sortir la logique des composants casserait `Component.update()`/`draw()` (ADR-0004),
  la sérialisabilité, et le modèle mental débutant.
- Une architecture Systems impose un ordre d'exécution global et des requêtes typées —
  de la complexité sans bénéfice à cette échelle.

## Conséquence

Le mot « System » disparaît aussi de `core/system.js`, qui est aujourd'hui un
fourre-tout (ids, aléatoire, réactivité, fichiers, validation d'`<input>`, événements,
logs) et non un système. Son contenu est réparti — voir `architecture/CORE.md`.
