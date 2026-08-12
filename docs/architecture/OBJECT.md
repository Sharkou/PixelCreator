# Object

> `Object` — jamais `Entity` (ADR-0001).

## OBSERVÉ — état actuel

```js
class Object {
    id, uid, name, layer, tag, type, active, visible, lock, static, image,
    components{}, childs{}, x, y, width, height, rotation, scale
}
```

680 lignes. Mélange trois responsabilités : modèle de données, hiérarchie de
transformation, et outillage d'éditeur.

### Champs à connaître

| Champ | Réalité |
|---|---|
| `id` | identité de l'objet — `Math.random().toString(36).substr(2,9)` |
| `uid` | **identifiant du joueur propriétaire**, pas de l'objet. Nommage piégeux. |
| `type` | chaîne libre (`'object'`, `'image'`, `'camera'`, `'prefab'`…) pilotant l'icône |
| `image` | `HTMLImageElement` de vignette pour la Hierarchy — **du DOM dans le Core** |
| `childs` | anglais incorrect, mais présent dans le protocole réseau et les sauvegardes |
| `static` | déclaré, jamais lu |
| `lock` | empêche la sélection dans l'éditeur |

### Méthodes d'éditeur portées par le Core

`detectMouse(x, y)`, `detectSide(x, y)`, `select(ctx)`, `createImage(ctx)`, `preview()`.

`createImage()` appelle `document.createElement()` : **`Object` ne peut pas être chargé
proprement côté serveur.** Cela fonctionne aujourd'hui uniquement parce que le serveur
n'appelle jamais ces méthodes.

### `copy()` — le point le plus fragile

```js
copy(obj) {
    for (let prop in obj) {
        if (typeof obj[prop] !== 'object') this[prop] = obj[prop];
        else { /* TODO: Gérer les objets */ }        // ← les enfants ne sont pas copiés
    }
    for (let name in obj.components) {
        this.addComponent(new components[name], false);   // ← recherche par nom dans mod.js
        for (let prop in component) this.components[name][prop] = component[prop];
    }
}
```

- Les propriétés objet ne sont pas copiées → `Scene.init()` doit refaire les liens
  parent/enfant dans une seconde passe.
- `new components[name]` : un composant absent de `mod.js` fait échouer la
  désérialisation, silencieusement.
- `for (let prop in obj)` voit `_x`, `$x`… donc la copie réassigne les doublons ;
  `this['_x'] = …` atteint l'accesseur de prototype `set _x` et **déclenche la
  propagation aux enfants pendant une copie réseau**.
- `copy()` est appelé **par objet et par heartbeat** : recopie complète, jamais un patch.

### `update()` / `draw()`

```js
try { this.components[i].update(this); }
catch (err) { console.error(err); }
```

Le `try/catch` par composant et par frame isole les scripts utilisateur cassés —
**intention légitime, à conserver**. Mais il masque aussi les pannes systématiques :
c'est lui qui cache que le mode solo hors ligne ne fonctionne pas
(`MIGRATION.md` §4.1) et que `Collider.update()` référence un `Scene` non importé.

---

## PROPOSITION V2

`Object` redevient un conteneur.

```js
class Object {
    id             // identité de l'objet
    owner          // ex-`uid` : joueur propriétaire
    name, tag, layer
    active, visible, lock
    components     // Map<string, Component>  — un seul par type
    parent, children

    addComponent / removeComponent / getComponent / hasComponent
    addChild / removeChild
    update(ctx) / draw(renderer)
}
```

**Renommages retenus.** Ils n'étaient bloqués que par la compatibilité des données ;
la décision « aucun projet v1 à migrer » lève ce blocage.

| Legacy | v2 | Raison |
|---|---|---|
| `childs` | `children` | anglais correct |
| `uid` | `owner` | désigne le joueur propriétaire, pas l'objet |
| `static` | *supprimé* | déclaré, jamais lu |

### Ce qui sort

| Sort de `Object` | Vers | Raison |
|---|---|---|
| `x`, `y`, `rotation`, `scaleX`, `scaleY` | composant `Transform` | ADR-0002 |
| `width`, `height` | composants de rendu / collision | une taille n'est pas une transformation |
| `_x` / `__x` et la propagation en delta aux enfants | supprimés | remplacés par une composition de matrices, valeurs locales préservées |
| `detectMouse`, `detectSide`, `select` | `editor/viewport/` | outillage d'IDE |
| `createImage` | `editor/` (rendu hors écran) | supprime le DOM du Core |
| `preview` | `editor/viewport/` | surcouche d'IDE ; retirée du contrat de Component (ADR-0004) |
| `image` | `editor/` (cache de vignettes) | ce n'est pas une donnée de jeu |
| `type` | `editor/` (affichage) ou supprimé | dupliqué par la présence des composants |
| `static` | supprimé | jamais lu |

### Ce qui reste et ne bouge pas

- Le nom `Object`.
- L'identité par id court et opaque.
- `components` indexé par nom de classe, et la hiérarchie parent/enfant.
- `update()` / `draw()` qui itèrent sur les composants et passent `self` en argument
  (ADR-0004).
- Le `try/catch` par composant — mais avec un compteur : un composant qui échoue N fois
  d'affilée est désactivé et signalé, au lieu d'échouer en silence pour toujours.

### Façade Transform

```js
object.x = 100;                          // ces trois lignes sont
object.getComponent('Transform').x = 100; // strictement le même
object.components.Transform.x = 100;      // chemin d'écriture
```

Aucune valeur n'est stockée sur `Object`. Il n'existe pas de `Object._x` (ADR-0002).

### `copy()` et instanciation

Remplacés par `serialize()` / `deserialize()` explicites :

- les composants sont résolus via un **registre** explicite, pas par recherche de nom
  dans `mod.js` ;
- les enfants sont référencés par id, et les liens rétablis en une passe déterministe ;
- aucun doublon `_`/`$` à filtrer, puisqu'il n'y en a plus.

---

## Décisions tranchées (2026-08-12)

| # | Question | Décision |
|---|---|---|
| Q1 | `childs` → `children` ? | **Oui** |
| Q2 | `uid` → `owner` ? | **Oui** |
| Q4 | Deux composants du même type sur un objet ? | **Non** — un seul par type, comme dans Legacy |
| Q6 | Compatibilité des projets Legacy ? | **Aucune** — pas de projets v1 à migrer |

Point mineur restant, tranchable à l'implémentation : `Transform` est-il ajouté par
défaut à la construction d'un `Object` ?
