# ADR-0022 — Le reparentage préserve le monde, et cette politique appartient à l'Editor

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0002 (valeurs locales, monde dérivé), ADR-0012 (le Runtime rapporte, il ne corrige pas), ADR-0019 (`REPARENT`)

## Contexte observé

`Object.addChild()` conservait le **Transform local**. Déposer un objet dans une autre
branche de la Hierarchy le faisait donc sauter à l'écran, là où son nouveau parent le
plaçait.

`Matrix` n'avait pas de `decompose()` : rien ne permettait de repasser d'une matrice aux
cinq valeurs qu'un `Transform` stocke.

## Décision

### 1. Le monde est préservé par défaut, et la politique vit dans l'Editor

```
Geste dans la Hierarchy  =  batch {
                              REPARENT      { object, parent, index, previous… }
                              SET_PROPERTY  x
                              SET_PROPERTY  y
                              SET_PROPERTY  rotation
                              SET_PROPERTY  scaleX
                              SET_PROPERTY  scaleY
                            }
```

Ranger son arborescence, c'est ranger — pas déplacer. Unity, Godot et Blender font tous
cela, et pour la même raison.

**Cinq raisons de composer ce recalcul dans l'Editor plutôt que dans le Core :**

1. **`REPARENT` reste inversible par sa seule structure.** Un `REPARENT` qui recalculerait
   le Transform devrait aussi transporter les cinq valeurs précédentes pour être annulable ;
   il porterait deux mutations sous un seul nom.
2. **La réplication reste exacte.** Les valeurs recalculées voyagent comme des nombres. Si
   chaque nœud recalculait sa propre décomposition, deux machines divergeraient sur des
   flottants — le genre de désynchronisation qu'on ne diagnostique jamais.
3. **`batch` existe déjà** (ADR-0008) et fait exactement cela : un dépôt = **une** entrée
   d'historique, six opérations.
4. **Le Core garde une seule loi.** `parent.addChild(child)` depuis un script conserve le
   local — c'est ce qu'un script attend, et ce que `editor/project/starter.js` utilise. La
   préservation du monde est une **politique d'éditeur**, écrite dans `editor/commands.js`.
5. **ADR-0002 est respecté** : les valeurs restent locales, le monde reste dérivé, rien
   n'est stocké en double.

`reparentObject(scene, object, parent, index, { preserveWorld })` : `preserveWorld: false`
conserve le local, ce que fera un jour une case « conserver la position locale » dans l'UI.

### 2. `Matrix.decompose()` est pure, et exacte hors cisaillement

```
x, y     = e, f
scaleX   = hypot(a, b)
rotation = atan2(b, a)
scaleY   = (a·d − b·c) / scaleX        signé : un parent miroir reste miroir
skew     = (a·c + b·d) / scaleX²       nul exactement quand les colonnes sont orthogonales
```

`scaleY` est dérivé du **déterminant** et non de `hypot(c, d)` : `hypot` renverrait une
valeur positive et perdrait silencieusement le retournement.

### 3. Le cisaillement est signalé, jamais corrigé en silence

`(x, y, rotation, scaleX, scaleY)` décrit une translation, une rotation et une échelle
d'axes — **cinq nombres pour une transformation affine qui en a six**. Le sixième est le
cisaillement, et il apparaît dès qu'un ancêtre porte une **échelle non uniforme** *et*
qu'un nœud intermédiaire est **tourné**. C'est le même mur que la `lossyScale` d'Unity, et
il n'a pas de solution propre dans un modèle local à cinq valeurs.

**Politique retenue :**

- `decompose()` renvoie la meilleure approximation sans cisaillement, **et** `sheared: true`
  avec le `skew` mesuré ;
- le reparentage **a lieu** — le geste de l'utilisateur n'est pas refusé ;
- les valeurs locales sont **laissées telles quelles** — un placement défendable plutôt
  qu'un placement faux ;
- un rapport est émis (`onReport`, `kind: 'reparent:sheared'`).

C'est ADR-0012 appliqué à la géométrie : **le système ne corrige pas en silence, il dit ce
qu'il n'a pas pu faire.** Un reparentage sous un parent cisaillant est rare ; le rendre
silencieusement déformant serait bien pire que de le rendre bruyant.

Le même repli couvre un parent d'échelle nulle, dont la matrice n'est pas inversible.

## Ce que cet ADR ne décide pas

- La formulation exacte du message montré au créateur, ni le canal (la fenêtre Console
  n'existe pas encore — le rapport part par `onReport`).
- L'option UI « conserver la position locale ». Le modèle la porte déjà
  (`preserveWorld: false`), l'interface pas encore.

## Conséquences

### Positives

- Ranger la Hierarchy ne déplace plus rien.
- Un dépôt reste une seule entrée d'undo.
- Aucun nœud distant ne recalcule de flottants : ils voyagent.
- La limite du modèle à cinq valeurs est nommée et rapportée, au lieu d'être découverte
  comme un bug de rendu.

### Négatives

- Un dépôt produit six Operations là où il en produisait zéro. C'est le prix d'une
  réplication exacte, et le `batch` le ramène à une entrée d'historique.
- Le cas cisaillé demande à l'appelant de traiter un rapport.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Conserver le local par défaut** | L'objet saute à l'écran alors que le créateur rangeait. |
| **Recalculer dans le gestionnaire Core** | Chaque nœud recalculerait ses propres flottants → divergence indiagnosticable ; et `REPARENT` cesserait d'être inversible par sa seule structure. |
| **Interdire l'échelle non uniforme sur un parent** | Trop restrictif pour un moteur 2D, où étirer un décor est courant. |
| **Stocker des matrices monde** | Contredit ADR-0002 et réintroduit deux sources de vérité. |
| **Approximer le cisaillement sans le dire** | Déforme l'objet en silence. C'est exactement ce qu'ADR-0012 refuse. |
| **Refuser le geste sous un parent cisaillant** | Refuser une action légitime pour un cas rare, au lieu de la faire et de le dire. |
