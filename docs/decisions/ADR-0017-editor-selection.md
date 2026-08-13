# ADR-0017 — La sélection et le picking appartiennent à l'Editor

- **Statut :** **accepté** (2026-08-13)
- **Décide :** ce qu'un créateur peut cliquer dans le Viewport, et où vit cette connaissance
- **Lié à :** ADR-0004 (Components), ADR-0006 (Editor), ADR-0013 (Camera / Viewport)

---

## Contexte

ADR-0013 s'arrête à `screenToWorld()` : « le runtime fournit le mapping, pas la politique
de sélection ». `core/component.js` va plus loin et pose la contrainte sans la résoudre :

> Editor picking must also reach objects that carry no geometry at all, so it needs an
> editorial representation that `bounds()` alone cannot provide.

Il fallait donc trancher deux choses : **quelle géométrie** est cliquable, et **où** la
sélection est stockée.

**OBSERVÉ DANS LEGACY.** Les deux réponses étaient mauvaises, et couplées :

- `Renderer.render()` importe `editor/system/dnd.js` pour lire `Dnd.hovering` et
  `Dnd.resize` — le moteur de rendu dépend de l'IDE. `tools/layers/rules.js` suit encore
  cette violation, et c'est la seule du dépôt.
- `detectMouse(self, x, y)` et `detectSide()` sont portés par `Collider`,
  `RectCollider`, `CircleCollider` : **un objet n'était sélectionnable que s'il avait un
  composant de collision de gameplay.**
- La sélection vivait dans le modèle, en `scene.current` / `scene.currentComponent`, lue
  par cinq modules — dont `Network`.

---

## Décision

### 1. Trois géométries distinctes, qui ne se prêtent rien

| Géométrie | Qui la définit | À quoi elle sert |
|---|---|---|
| **Gameplay** | un futur `Collider` | ce que le jeu heurte |
| **Rendu** | `bounds(self)` d'un composant qui dessine | ce qui est peint |
| **Editorial** | l'Editor, `viewport/picking.js` | ce qu'un créateur peut cliquer |

Détourner l'une pour l'autre est le défaut de Legacy, pas un raccourci.

### 2. Tout Object a une étendue éditoriale

```
editorBounds(object) = union des bounds() des composants qui en déclarent
                     = sinon, un carré de préhension de 24 unités sur l'origine
```

Un objet vide, une caméra, un point d'apparition, un nœud de regroupement : **cliquables,
sans qu'on leur ajoute quoi que ce soit.** `bounds(self)` reste une capacité optionnelle
et n'est jamais rendue obligatoire par la sélection.

### 3. Le test se fait en espace local

Le pointeur traverse l'inverse de `view · worldMatrix(object)`, puis est comparé à une
boîte alignée sur les axes **locaux**. Rotation, échelle et composition parentale sont
donc traitées par les matrices, pas par des cas particuliers — et le contour de sélection
suit l'objet au lieu de l'encadrer.

`lock`, `visible` et `active` excluent un objet du picking. C'est le seul rôle de `lock`.

### 4. La sélection est un objet de l'Editor, pas un champ du modèle

`editor/selection.js` : un objet courant, `set` / `clear` / `has` / `observe`. Le Core ne
la connaît pas, elle n'est pas sérialisée, elle ne produit pas d'Operation et elle n'est
pas répliquée — deux créateurs sur le même projet ont chacun la leur.

**Sélection simple pour l'instant.** Une sélection multiple change ce que « l'objet
sélectionné » veut dire pour chaque consommateur ; elle se décidera avec les outils qui en
ont besoin, pas en plaçant d'avance un tableau que personne ne lit.

### 5. Les surcouches sont dessinées après le rendu, par l'Editor

Contour et pivot passent par le **contrat de renderer ordinaire** (`setTransform`,
`strokeRect`, `fillRect`), sur la surface, après `Runtime.render()`. Aucune API de dessin
réservée à l'IDE, aucun second backend, et surtout : **rien dans `runtime/` ne sait qu'un
éditeur existe.**

---

## Conséquences

### Positives

- Un jeu publié ne charge rien de l'IDE : la dépendance `engine → editor` de Legacy n'est
  pas reproduite.
- Un objet est sélectionnable dès sa création, avant tout composant.
- La physique pourra changer sans toucher à la sélection, et réciproquement.
- `picking.js` est du calcul pur : testé sous Node, sans DOM.

### Négatives

- Le carré de préhension de 24 unités est une constante choisie à la main. Elle est
  correcte tant qu'elle correspond au marqueur affiché ; si le marqueur change, elle doit
  changer avec lui.
- Une étendue éditoriale n'est pas une silhouette : cliquer dans le coin transparent d'un
  sprite sélectionne le sprite. Acceptable — et corrigeable plus tard par un test alpha,
  sans que le modèle bouge.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Réutiliser les Colliders** | Rend la sélection dépendante du gameplay. C'est exactement le défaut de Legacy. |
| **Rendre `bounds()` obligatoire** | Force une géométrie sur des composants qui n'en ont pas (un système de particules, de la logique pure) et contredit ADR-0004. |
| **Sélection dans le Core (`scene.current`)** | De l'état d'IDE dans un modèle que le serveur exécute aussi. `core/scene.js` le refuse explicitement. |
| **Picking par lecture de pixels du canvas** | Impose un tampon de rendu supplémentaire, ne survit pas à un backend headless, et lie la sélection au fait qu'un objet dessine. |
| **Picking dans le Runtime** | Recrée `runtime → editor` ; ADR-0013 a déjà tranché que le runtime fournit le mapping et pas la politique. |
