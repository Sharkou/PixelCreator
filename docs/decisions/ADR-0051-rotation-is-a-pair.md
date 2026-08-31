# ADR-0051 — Rotation est une paire

- **Statut :** **accepté** (2026-08-31)
- **Décide :** comment le Transform expose la rotation ; comment un type renomme une propriété sans casser les données déjà écrites
- **Dépend de :** ADR-0002 (Transform local), ADR-0003 (Property System), ADR-0007 (schéma), ADR-0023 §2 (pas de type vecteur), ADR-0021 (une donnée illisible ne fait pas perdre la scène)
- **Remplace :** ADR-0050 — `rotationX`/`rotationY` en degrés, indépendants, disparaissent au profit d'une paire
- **Ne décide pas :** l'unité de présentation ailleurs que dans l'Inspector ; une quelconque profondeur ou caméra 3D

---

## 1. Une propriété, deux composantes

Le panneau lisait `Position X Y`, puis `Rotation` seule, puis `Scale X Y` : deux paires
autour d'un scalaire, trois formes pour une même idée.

> **`Rotation` devient `rotationX` / `rotationY`, appariées comme `Position` et `Scale`.**

| | |
|---|---|
| `Rotation.X` | la rotation **dans le plan** de l'écran, comme une aiguille d'horloge. C'est exactement l'ancienne `rotation`, au nom près. |
| `Rotation.Y` | la rotation **autour de l'axe vertical**, hors du plan. |

**Aucun type vecteur n'est introduit.** ADR-0023 §2 les a retirés du Property System
délibérément, et il n'en faut pas : l'Inspector apparie déjà `x`/`y` et `scaleX`/`scaleY` par
déclaration (`PAIRS`, `inspector/schema.js`). Rotation rejoint cette table. Le Graph, le DnD,
l'undo et le live sync n'apprennent rien : ce sont deux propriétés déclarées comme les autres.

### 1.1 `Rotation.Y` n'est pas une approximation

Le renderer projette déjà orthographiquement. Tourner de φ autour de l'axe vertical envoie
`(x, y, 0)` sur `(x·cos φ, y, −x·sin φ)` ; laisser tomber `z` laisse `(x·cos φ, y)`.

> **Une mise à l'échelle horizontale par `cos φ` EST cette rotation, exactement.**

| Rotation Y | Effet |
|---|---|
| 0° | au repos |
| 45° | sprite saisi en plein retournement (×0,707) |
| 90° | sa tranche — invisible sous cette projection |
| 180° | son dos, donc un miroir horizontal |
| 360° | retour au départ |

Que 180° lise comme un miroir est une **conséquence du cosinus**, pas un cas écrit. Rien ici
n'est un flip sous un nom plus long, et les valeurs intermédiaires sont l'intérêt du modèle.

L'axe autour duquel on tourne garde sa longueur : `rotationY` ne touche jamais l'axe vertical.

### 1.2 Une seule unité

Les deux moitiés sont en **radians**, comme l'ancienne `rotation` — migrer celle-ci
réécrirait toutes les scènes. Une propriété, une unité : l'Inspector convertit les deux en
degrés par la même entrée `DISPLAY_UNITS`, donc un créateur tape `45` dans l'une comme dans
l'autre. Rien de mixte sur une même ligne.

### 1.3 Ce que la matrice rapporte

`Matrix.decompose()` répond `rotation` — un angle, et il n'y en a qu'un dans une affine. Ce
que le reparentage recopie est donc `rotationX`. **`rotationY` n'est pas décomposée** : elle
a quitté la matrice sous forme d'échelle horizontale, et `scaleX` la ramène. Écrire une
sixième valeur là serait inventer un nombre que la géométrie n'a jamais rapporté.

### 1.4 L'ordre positionnel du constructeur n'est pas celui du schéma

`rotationY` est déclarée **à côté** de `rotationX` — l'Inspector lit le schéma pour dessiner
ses lignes — et arrive **en dernier** dans le constructeur, parce que la signature
positionnelle est une surface de compatibilité : tout
`new Transform(x, y, rotation, scaleX, scaleY)` écrit avant continue de vouloir dire ce qu'il
voulait dire.

---

## 2. Ce que cela coûte

| | |
|---|---|
| Schéma | un scalaire devient deux `number`, dans l'ordre Position / Rotation / Scale |
| `localMatrix()` | un `cos` de plus, dans le terme d'échelle que la composition portait déjà |
| Renderer, picking, caméra | **rien** — tout passe par `worldMatrix()` |
| Inspector | **une seule ligne `Rotation` avec X et Y**, largeur courte, poignées comme Position |
| Graph, DnD, undo, live sync | gratuits : deux propriétés du Property System |

---

## 3. Un type peut renommer une propriété

`reconcileValues()` **jette ce que le schéma ne déclare pas** — c'est ce qui permet à une
définition de changer sans écrire de migration, et c'est aussi ce qui aurait silencieusement
détruit ce renommage : une scène enregistrée hier porte `rotation`, et elle se serait
rouverte avec tous les objets non tournés.

> **`static migrate(values)` est le seul endroit où un type dit « ceci s'appelait
> autrement ». Il tourne avant le filtre, pas autour.**

Déclaré, pas cousu à la main : n'importe quel Component peut en avoir un, et aucun appelant
du sérialiseur n'apprend le nom de `Transform`. Une migration qui lève est rattrapée — perdre
les valeurs d'un composant est fâcheux, perdre le fichier entier parce qu'un renommage a été
mal écrit est l'échec qu'ADR-0021 existe pour empêcher.

La migration est ici une pure lecture : `rotation` → `rotationX`, `rotationY` à sa valeur par
défaut. Une valeur déjà écrite contre le nouveau schéma l'emporte.

---

## 4. Le piège, nommé

**Un objet disparaît à `Rotation.Y = 90°` et 270°**, parce que `cos` y vaut zéro. C'est
géométriquement juste — c'est ce que fait une feuille tournée jusqu'à sa tranche — et aucun
garde-fou n'est posé : en poser un mentirait sur la géométrie. De même, `cos` est paire, donc
`+45°` et `−45°` sont visuellement identiques.

---

## 5. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `Rotation` est une paire X/Y, et l'Inspector la dessine sur une ligne | `schema.test.js`, et à l'écran |
| Il n'existe plus de `rotation` scalaire, ni de `Rotation X`/`Y` indépendantes | `transform.test.js` |
| `flipX` / `flipY` n'existent nulle part | idem |
| Une valeur `rotation` ancienne devient `rotationX`, `rotationY` au repos | idem |
| `Rotation.X` compose exactement comme l'ancienne rotation | idem |
| `Rotation.Y` vaut `cos φ` à 0°, 45°, 90°, 180°, 360° | idem |
| L'axe vertical est intact quel que soit `rotationY` | idem |
| Les deux se sérialisent et se relisent | idem |
| Le reparentage écrit cinq valeurs, pas six | `reparent.test.js` |
