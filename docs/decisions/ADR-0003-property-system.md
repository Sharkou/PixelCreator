# ADR-0003 — Property System : Proxy, deux API de mutation répliquée

- **Statut :** **accepté** (2026-08-12)
- **Décide :** comment intercepter les écritures de propriétés en v2
- **Remplace :** `System.sync()` (`legacy/src/core/system.js:31`)
- **Lié à :** ADR-0008 (Operations), ADR-0011 (autorité)

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
propriété. **Deux formes d'écriture, et une seule est publique pour la mutation
contrôlée.**

### Les deux formes d'écriture

```js
object.x = 100;                   // mutation directe de l'état de l'objet
object.setProperty('x', 100);     // mutation contrôlée, via le Property System
```

**`object.$x` est supprimé.** Le sigil était trop implicite et trop spécifique à Pixel
Creator pour constituer une API publique. Il n'existe ni en v2, ni comme syntaxe cible
du harnais de parité.

### Ce que fait chaque forme

| Forme | Effet |
|---|---|
| `object.x = 100` | met à jour l'état, émet un `Change` — les vues réagissent. **Aucune Operation.** |
| `object.setProperty('x', 100)` | passe par le Property System, émet un `Change` **et produit une Operation** |

```
setProperty()
    ↓
Property System
    ↓
Operation
    ↓
contexte / autorité / destination
```

**`setProperty()` n'est pas « la méthode réseau ».** C'est le chemin contrôlé du modèle.
Ce que devient l'Operation ensuite dépend du contexte : elle peut être validée par
l'autorité, répliquée, enregistrée dans l'historique, annulée/refaite, partagée en
collaboration, ou transmise à un autre système. Le réseau n'est qu'une destination
possible parmi d'autres.

Aucun code utilisateur n'écrit `network.updateProperty(...)`, et **aucun point d'appel
ne porte de drapeau de synchronisation**. Le choix du chemin se fait une seule fois, à
l'écriture, par le choix de la forme.

### L'origine reste explicite

Une Operation venue du réseau doit rester identifiable :

```js
{ …, origin: 'network' }
```

C'est ce qui empêche l'écho, sans recourir au drapeau `dispatch = false` de Legacy.
`origin` ∈ `runtime` | `local` | `editor` | `player` | `network`.

### ⚠ `setProperty()` ne veut pas dire la même chose dans Legacy

C'est le piège principal, et il concerne un nom identique de part et d'autre.

| | Legacy | v2 |
|---|---|---|
| `object.x = v` | écrit l'état, émet `setProperty` | écrit l'état, émet un `Change` — **proche** |
| `object.setProperty('x', v)` | écrit `_x` directement, émet `setProperty` — **ne réplique pas** | **chemin contrôlé** — `Change` + Operation |
| `object.$x = v` | écrit + émet `syncProperty` (répliqué) | **n'existe pas** |
| `object.syncProperty('x', v)` | écrit + émet `syncProperty` (répliqué) | remplacé par `setProperty()` |

Le rôle historique de `$x` / `syncProperty()` est donc **repris par `setProperty()`**,
tandis que le `setProperty()` de Legacy — un écrivain direct sans réplication —
disparaît en tant que tel.

Quiconque lit `legacy/` et raisonne par analogie se trompera. Rappelé dans
`CONVENTIONS.md`, dans le JSDoc de `setProperty()`, et **encodé explicitement dans le
mapping du harnais de parité**.

### Le sens de `object.x = 100`

L'axe de distinction **n'est pas** « répliqué / non répliqué » : c'est
**« sortie de simulation » contre « intention »**.

| Forme | Nature | Qui fait autorité |
|---|---|---|
| `object.x = 100` | sortie de simulation — un composant intègre une vitesse, une caméra suit une cible | les deux côtés calculent ; le serveur tranche par la réplication d'état |
| `object.setProperty('x', 100)` | **intention** — un humain (ou une IA) décide d'une valeur | l'autorité valide, puis propage |

Ce cadrage vaut mieux que « non répliqué », pour trois raisons :

1. Il explique pourquoi `self.x += vx` dans `Controller.update()` ne doit **pas**
   produire d'Operation : ce n'est pas une décision, c'est un résultat.
2. Il s'aligne sur l'autorité serveur (ADR-0011) : une intention client est *soumise*,
   une sortie de simulation est *prédite*.
3. Il donne une règle simple :
   **un Component n'appelle jamais `setProperty()` ; l'Editor n'écrit jamais sans.**

**Le mode d'échec est asymétrique.** Appeler `setProperty()` là où `=` suffisait coûte
du trafic et une entrée d'historique. Écrire `=` là où `setProperty()` était requis
produit une modification qui **ne se réplique pas et ne s'annule pas** —
silencieusement. C'est ce second cas qu'il faut détecter.

**Garde (développement uniquement).** Le Property System connaît l'origine active
(`editor`, `runtime`, `player`). Une écriture directe `=` survenant dans un contexte
`editor` émet un avertissement nommant la propriété et son fichier. Pas de blocage,
aucun coût en production — juste la fin d'une classe de bugs invisibles.

### Les couches internes ne sont pas une API

Legacy empile `object.x` → `object._x` → `object.__x`. Ces niveaux sont documentés
(`../migration/LEGACY_ANALYSIS.md` §2.2) parce qu'ils expliquent le comportement
observable, notamment la propagation hiérarchique.

**Ils ne deviennent pas une API v2.** `_x` et `__x` restent des possibilités
d'implémentation interne ; ni les utilisateurs ni les composants n'ont à les manipuler,
et **aucune API publique v2 ne dépend de ces conventions**. Le `Proxy` rend d'ailleurs
le stockage parasite inutile (voir plus bas).

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
4. Test que `object.setProperty('x', v)` produit un `Change` **et** une Operation.
5. Test que `object.x = v` produit un `Change` et **aucune** Operation.
6. Test qu'une Operation `origin: 'network'` appliquée ne produit **pas** d'Operation
   sortante (absence d'écho).

> **Attention au harnais de parité (point 1).** Il compare la *forme* et l'*ordre* des
> notifications, pas la sémantique de `setProperty()`, dont le nom est identique de part
> et d'autre mais le sens différent. Le mapping doit être explicite :
>
> | Legacy | v2 |
> |---|---|
> | `obj.x = v` | `obj.x = v` |
> | `obj.$x = v` / `obj.syncProperty('x', v)` | `obj.setProperty('x', v)` |
> | `obj.setProperty('x', v)` | *sonde Legacy uniquement* — pas d'équivalent v2 |
> | plain assign à la réception réseau | `applyOperation({ origin: 'network' })` |
>
> **Aucun scénario v2 n'utilise `.$x`.** Sans ce mapping, le harnais signalerait de
> fausses régressions.

Le sigil `$` est **supprimé** (décision définitive, 2026-08-12).
