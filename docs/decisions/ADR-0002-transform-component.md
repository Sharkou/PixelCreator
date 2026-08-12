# ADR-0002 — Transform devient un Component, `object.x` reste une façade

- **Statut :** **accepté** (2026-08-12)
- **Décide :** où vivent `x`, `y`, `width`, `height`, `rotation`, `scale`

---

## Contexte observé

Dans Legacy, la transformation est **codée en dur dans `Object`** :

```js
this.x = x; this.y = y;
this.width = width; this.height = height;
this.rotation = 0.0; this.scale = 1.0;
```

`x` et `y` passent par une chaîne à trois niveaux (`legacy/src/core/object.js:56-96`) :

```
obj.x     accesseur d'instance posé par System.sync  → émet setProperty
  → obj._x   accesseur de prototype                  → propage le delta aux enfants
    → obj.__x  stockage réel
```

Le niveau intermédiaire `_x` n'existe que pour offrir un point d'accroche à la
propagation hiérarchique. `width`, `height`, `rotation`, `scale` n'en ont pas et ne se
propagent donc **pas** aux enfants — asymétrie non documentée.

Conséquences observées :

- tout `Object` porte une position, même un objet purement logique (gestionnaire de
  score, minuteur, spawner) ;
- la logique de hiérarchie est dans `Object` et ne peut pas être remplacée ;
- l'Inspector liste `x`/`y`/`width`/`height`/`rotation` comme propriétés d'objet et
  masque `scale` par une liste noire codée en dur ;
- la sérialisation expose `__x`, `__y` (visibles dans le heartbeat).

---

## Décision

`Transform` devient un composant. Il détient les valeurs. `Object` expose une **façade**.

```js
// Source de vérité unique
object.components.get('Transform').x

// Façade sur Object — lecture ET écriture délèguent, aucune copie
get x()  { return this.components.get('Transform').x; }
set x(v) {        this.components.get('Transform').x = v; }
```

Les trois écritures suivantes sont le même chemin :

```js
object.x = 100;
object.getComponent('Transform').x = 100;
object.components.Transform.x = 100;
```

**Il n'existe jamais `Object._x` et `Transform.x` comme deux valeurs.** La façade ne
stocke rien.

`Transform` porte aussi la propagation hiérarchique, de façon uniforme pour toutes ses
propriétés — ce qui corrige l'asymétrie actuelle (`x`/`y` propagés, `width`/`rotation`
non).

---

## Conséquences

### Positives

- Un objet sans `Transform` est légitime (logique pure, sans position).
- La hiérarchie de transformation devient remplaçable (pivot, transform locale/globale,
  matrices) sans toucher à `Object`.
- L'Inspector affiche `Transform` comme n'importe quel composant : plus de liste noire.
- La chaîne `x → _x → __x` disparaît.

### Négatives

- **Deux indirections par lecture de `x`** : façade → composant → trap Proxy. Sur
  `Renderer.render()`, `self.x` est lu plusieurs fois par objet et par frame.
  Mitigation : le rendu et la physique lisent `const t = self.transform` une fois, puis
  `t.x`, `t.y`. C'est une contrainte de style à inscrire dans `CONVENTIONS.md`.
- **Tout code Legacy suppose que `Transform` existe.** `object.x` doit lever une erreur
  claire (« Object has no Transform component ») plutôt que `undefined`, sinon les bugs
  deviennent silencieux.
- Le format de sérialisation change : `x` passe de propriété d'objet à propriété de
  composant. Impacte le protocole réseau — mais **pas** les projets existants : il n'y a
  aucun projet v1 à migrer (Q6 tranchée).

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder la transform dans `Object`** | Statu quo. Conserve la chaîne à 3 niveaux, l'asymétrie de propagation et l'impossibilité d'un objet sans position. |
| **`Transform` composant, sans façade** | Casse `object.x`, qui est dans toute la documentation, tous les scripts utilisateurs et l'esprit du produit. Exclu par la vision. |
| **Façade avec cache** (`Object.x` copie `Transform.x`) | Recrée exactement les deux sources de vérité que l'on veut éviter. |
| **`Transform` implicite, ajouté à la construction** | Envisageable, mais annule le bénéfice « objet sans position ». À reconsidérer si le coût ergonomique s'avère trop élevé. |

---

## Validation requise

1. Test d'identité sur **tous** les chemins d'écriture :
   `object.x === object.getComponent('Transform').x` après écriture via la façade,
   via le composant, via le réseau, via l'Inspector.
2. Benchmark de rendu avant/après sur une scène ≥ 500 objets.
3. Décider si `Transform` est ajouté par défaut à la construction (point mineur, non
   bloquant — tranchable à l'implémentation).
