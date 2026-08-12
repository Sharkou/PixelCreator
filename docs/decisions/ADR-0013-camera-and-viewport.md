# ADR-0013 — La caméra est un Object, le viewport est l'écran

- **Statut :** **accepté** (2026-08-12)
- **Décide :** ce qu'est une caméra dans le modèle `Object → Components`, et ce qui la distingue du viewport
- **Lié à :** ADR-0002 (Transform), ADR-0004 (Components), ADR-0012 (erreurs)

---

## Contexte observé

**`Camera` désigne trois choses différentes dans Legacy**, souvent dans la même fonction :

| Ce qui est écrit | Ce que c'est réellement |
|---|---|
| `Camera` | une **classe de composant** (`background`, `max_x`, `offset`, `preview()`) |
| `Camera.main` | un **`Object`** qui porte ce composant |
| `renderer.render(scene, camera)` | la **projection écran** |

`Renderer.render()` écrit `camera.getComponent('Camera').background` tout en lisant
`camera.x` et `camera.scale` : le même identifiant est tantôt le composant, tantôt
l'objet porteur. Un lecteur ne peut pas savoir de quoi on parle sans dérouler l'appel.

S'y ajoute `Camera.offset`, une seconde position qui coexiste avec `camera.x` sans que
rien ne dise laquelle fait autorité.

---

## Décision

### 1. Une caméra est un `Object` ordinaire

Elle porte un `Transform` comme n'importe quel objet. `camera.x`, `camera.y`,
`camera.rotation` **sont** sa position et son orientation, lues par exactement les mêmes
règles que tout le reste (ADR-0002).

**Il n'existe aucune seconde API de position.** Pas d'`offset`, rien à tenir synchronisé.
Conséquence immédiate et gratuite : parenter la caméra au joueur la fait suivre le
joueur, parce que c'est déjà ce que parenter veut dire. Aucun code de suivi n'est requis.

### 2. Le composant `Camera` ne porte que l'objectif

```js
class Camera { zoom = 1; }
```

C'est la seule chose qu'un Transform ne sait pas exprimer. Un `Object` avec un
`Transform` et **sans** composant `Camera` est une caméra valide, de zoom 1.

### 3. Le `Viewport` est l'écran, pas la scène

```js
class Viewport { width; height; }
```

Il décrit la surface d'affichage : combien de pixels de large et de haut. Il n'a pas de
position dans le monde, pas de transform, et **n'appartient pas à la scène**.
Redimensionner une fenêtre change un viewport et ne doit toucher à aucun modèle.

Espace écran : origine en haut à gauche, `x` vers la droite, `y` vers le bas — la
convention qu'utilisent déjà toutes les surfaces 2D et tous les événements de pointeur.

### 4. La matrice de vue est **dérivée**, jamais stockée

```
view = centre(viewport) · zoom · inverse(worldMatrix(camera))
```

Elle se lit de droite à gauche : annuler le placement de la caméra, appliquer
l'objectif, puis amener l'origine au centre de l'écran.

Étant dérivée, elle **ne peut pas diverger** de la caméra, contrairement à une projection
mise en cache. Le renderer reçoit une `Matrix` et ne sait pas ce qu'est une caméra —
c'est ce qui empêche définitivement un `Core → renderer`.

L'échelle propre de la caméra fait partie de sa matrice monde et est donc inversée avec
le reste : agrandir l'objet caméra montre **plus** de monde, ce qui est exactement le sens
d'inverser une transformation. `zoom` est un multiplicateur nommé qui se **compose** avec
elle ; ce n'est pas un doublon, c'est le réglage que l'utilisateur et l'Editor manipulent.

### 5. Conversions

```js
worldToScreen(view, x, y)
screenToWorld(view, x, y)
```

`screenToWorld()` est le premier maillon du picking de l'Editor :

```
pointer  →  Viewport  →  screenToWorld()  →  géométrie  →  sélection
```

**Le runtime fournit le mapping, pas la politique de sélection.** Les maillons suivants
appartiennent à l'Editor et ne sont pas construits ici (voir §Picking ci-dessous).

Un `zoom` nul, négatif ou non fini est **refusé à la construction de la vue**. Il laisse
la matrice de la caméra parfaitement inversible : rien ne lèverait d'erreur, la vue
écraserait simplement toute la scène sur un point, et le seul symptôme apparaîtrait bien
plus tard dans `screenToWorld()`, en nommant une matrice que personne n'a écrite.

---

## Picking : ce qui est préparé, ce qui ne l'est pas

`bounds(self)` reste ce qu'il est : une **capacité géométrique optionnelle**, déclarée par
les composants qui ont réellement une étendue. Ce n'est pas une API de sélection, et il
n'est pas généralisé.

**Un Object sans géométrie reste parfaitement valide** et le runtime ne le rend
artificiellement sélectionnable d'aucune manière. Rendre sélectionnable un objet sans
hitbox de gameplay suppose une représentation *éditoriale* — donc une décision de
l'Editor, prise avec lui.

---

## Conséquences

### Positives

- Une seule API de position, celle de tous les objets.
- Le suivi de caméra est gratuit : c'est du parentage.
- Le renderer reste ignorant de la caméra ; `SceneRenderer.render(scene, { view })` est
  inchangé.
- `screenToWorld()` débloque le picking de l'Editor sans que l'Editor existe.
- Le serveur n'a ni caméra ni viewport, et n'en importe pas le code.

### Négatives

- La vue est recomposée à chaque appel (quelques multiplications de matrices 2D). Un
  cache ne s'impose pas : il faudrait l'invalider à chaque écriture d'un ancêtre.
- `screenToWorld()` inverse à chaque appel. Un outil testant beaucoup d'objets contre un
  seul pointeur doit inverser une fois et réutiliser — c'est une optimisation d'appelant,
  pas un cache à cacher ici.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Caméra = composant portant sa propre position** | Recrée exactement l'ambiguïté Legacy et une seconde source de vérité pour la position. |
| **Caméra = objet spécial hors scène** | Interdit le parentage, donc réintroduit un code de suivi que le modèle donne gratuitement. |
| **Fusionner Camera et Viewport** | Confond le monde et l'écran. Deux caméras dans un même viewport, ou une caméra dans deux viewports, deviendraient impossibles. |
| **`zoom` = `scaleX`/`scaleY` du Transform** | Deux valeurs pour un réglage qui en a une, avec un sens inversé et contre-intuitif dans l'Inspector. |
| **Matrice de vue stockée sur la caméra** | Un second état à invalider à chaque mouvement, de la caméra ou de n'importe quel parent. |
