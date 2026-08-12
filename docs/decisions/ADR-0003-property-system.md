# ADR-0003 — Property System : Proxy, canal explicite, ergonomie inchangée

- **Statut :** proposé
- **Décide :** comment intercepter les écritures de propriétés en v2
- **Remplace :** `System.sync()` (`legacy/src/core/system.js:31`)

---

## Contexte observé

`System.sync(object, component?)` parcourt les propriétés énumérables **au moment de
l'appel** et remplace chacune par un couple d'accesseurs, plus un accesseur `$prop` en
écriture seule. Il en résulte trois canaux d'écriture, tous intentionnels :

| Écriture | `setProperty` | `syncProperty` | Usage |
|---|---|---|---|
| `obj.x = 100` | ✅ | ✗ | simulation, caméra locale |
| `obj.$x = 100` | ✅ | ✅ | édition utilisateur (Inspector, viewport) |
| `obj.setProperty('x', 100)` | ✅ | ✗ | réception réseau, sans écho |

Cette distinction est **la raison pour laquelle la simulation n'inonde pas le réseau**
tout en gardant l'Inspector synchronisé lettre par lettre. Elle doit survivre.

### Défauts mesurés

1. Une propriété ajoutée après construction n'est **jamais** réactive — silencieusement.
2. Les champs `#privés` sont invisibles (`for...in` ne les voit pas). Le commit `38906c2`
   a ainsi retiré `scaleX`, `scaleY`, `scaleFromBox` de `Texture` du Property System
   sans que personne ne le remarque.
3. `_prop` et `$prop` sont énumérables : chaque propriété logique occupe 3 entrées.
   Sérialisation mesurée **1733 o brut vs 560 o filtré — facteur 3,09**.
4. `$prop` est en écriture seule : `obj.$x` retourne `undefined`.
5. L'événement ne transporte pas la valeur précédente → undo/redo impossible.
6. Le seul moyen de savoir *pourquoi* une valeur a changé est de savoir *quelle méthode*
   a été appelée. Fragile et non transmissible.

### Mesure de performance

3 M opérations, Chrome :

| Implémentation | Lecture | Écriture |
|---|---|---|
| Propriété simple | 18,6 ms | 4,8 ms |
| Accesseurs Legacy | 81,6 ms | **301,5 ms** |
| `Proxy` | 82,0 ms | **76,9 ms** |

Le `Proxy` lit aussi vite que l'existant et **écrit 4× plus vite**. Le coût de
l'écriture Legacy vient de `this['_' + prop] = value` (concaténation + création de
propriété dynamique). Le surcoût de réactivité en lecture est déjà payé aujourd'hui.

---

## Décision

Un **`Proxy` par objet et par composant**, remplaçant `Object.defineProperty` par
propriété.

### L'ergonomie ne change pas

```js
object.x = 100;      // change + notifie les vues            (inchangé)
object.$x = 100;     // change + notifie + réplique          (inchangé)
object.name = 'Player';
component.speed = 4;
```

Aucun code utilisateur n'écrit `network.updateProperty(...)`. La magie reste dans l'API.

### Ce qui change à l'intérieur

Le trap `set` émet un **Change** au lieu de deux événements distincts :

```js
{
  object,      // l'Object concerné
  component,   // le Component, ou null
  prop,
  value,       // nouvelle valeur
  previous,    // ancienne valeur          ← nouveau
  origin       // 'local' | 'editor' | 'runtime' | 'network'   ← nouveau
}
```

`origin` remplace l'inférence par méthode appelée :

| Origine | Émetteur | Réseau réplique ? | Vues réagissent ? |
|---|---|---|---|
| `runtime` | `update()` d'un composant | non | oui |
| `editor` | saisie Inspector, drag viewport (`$`) | oui | oui |
| `network` | message entrant | **non** (pas d'écho) | oui |
| `local` | script utilisateur | non | oui |

La règle « ne pas renvoyer au réseau ce qui en vient » devient une donnée explicite
plutôt qu'un effet de bord de `setProperty(prop, value, dispatch=false)`.

### Ce que cela corrige mécaniquement

| Défaut | Corrigé par |
|---|---|
| Propriétés dynamiques muettes | le trap intercepte toute clé, connue ou non |
| Champs `#` invisibles | ils sortent du modèle : état interne, non sérialisé, non inspecté — par conception et non par accident |
| Sérialisation ×3 | il n'existe plus de `_prop` ni de `$prop` stockés |
| Écriture lente | 77 ms au lieu de 301 ms |
| Pas de `previous` | lu avant écriture dans le trap |

---

## Conséquences

### Positives

- Le Property System devient testable en isolation (aucune dépendance DOM ni réseau).
- Base directe pour les Operations (ADR-0008) : un `Change` avec `previous` **est** un
  `SET_PROPERTY` réversible.
- La sérialisation devient explicite et compacte.
- Undo/redo devient possible sans réécriture.

### Négatives et limites

- **Identité :** `proxy !== target`. Toute comparaison par référence (`obj === other`,
  clés de `Map`/`Set`, `scene.objects[id] === obj`) doit manipuler **le proxy partout**,
  jamais la cible. Règle : la cible ne sort jamais de `core/properties`.
- **Lecture toujours 4× plus lente** qu'une propriété nue. Identique à aujourd'hui, mais
  cela contraint le rendu : lire `transform` une fois par objet plutôt que `self.x`,
  `self.y`, `self.width`… répétés.
- **Les objets imbriqués** (`Vector`, `Color`, `animations`) ne sont pas interceptés en
  profondeur par défaut. Legacy ne les gérait pas non plus (`// TODO: Gérer les objets`).
  Décision : interception **peu profonde** au départ ; les types valeur (`Vector`,
  `Color`) sont remplacés en entier, pas mutés en place.
- `Proxy` n'existe pas en ES5 — sans objet ici, la cible est le navigateur moderne.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder `defineProperty`, corriger les bugs** | Ne résout ni les propriétés dynamiques ni la pollution `_`/`$`, et reste 4× plus lent en écriture. |
| **API explicite `obj.set('x', 100)`** | Détruit l'ergonomie, qui est le cœur du produit. Explicitement exclu par la vision. |
| **Signaux / observables** | Impose de déclarer chaque propriété, change l'écriture utilisateur, ajoute un concept. |
| **Dirty checking par frame** | Perd l'immédiateté lettre par lettre et la valeur précédente. |
| **Immuabilité + structural sharing** | Incompatible avec `self.x += vx` dans les composants. Réécriture totale du modèle. |

---

## Validation requise

Avant de considérer cette décision comme acquise :

1. Un harnais qui exécute une même séquence d'écritures sur Legacy et sur v2 et compare
   la **séquence d'événements émis** (ordre inclus).
2. Un benchmark en CI sur une scène réaliste (≥ 500 objets, 60 fps).
3. Vérification que l'édition lettre par lettre reste identique (Inspector + Hierarchy).

Question ouverte : **conserve-t-on le sigil `$`** (`ARCHITECTURE.md` §10, Q3) ?
Cet ADR suppose que oui — c'est un idiome Pixel Creator identifiable et très court.
La décision peut changer sans invalider le reste de l'ADR.
