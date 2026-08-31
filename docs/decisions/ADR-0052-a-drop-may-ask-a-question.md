# ADR-0052 — Un lâcher peut poser une question

- **Statut :** **accepté** (2026-08-31)
- **Décide :** ce qu'un Component lâché sur un nœud veut dire ; comment une unité s'affiche dans un champ numérique
- **Dépend de :** ADR-0039 §0.2 (un lâcher fait un nœud fini), ADR-0047 §1 (une seule question), ADR-0048 (une propriété se nomme comme elle se lit), ADR-0051 (Rotation est une paire)
- **Amende :** ADR-0047 §2 et ADR-0048 §3 — le refus du geste Component → nœud est **levé**, la prémisse ayant changé
- **Ne décide pas :** `On Collision` et la physique ; la suppression d'une ressource `.px` encore attachée ; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`

---

## 1. Une unité est une annotation, pas une colonne

`Position`, `Rotation` et `Scale` se lisent comme trois lignes d'une même forme. Elles ne le
faisaient pas : le suffixe `°` de Rotation prenait dix pixels dans la rangée flex, donc ses
chiffres se centraient **cinq pixels à gauche** de ceux des deux autres lignes.

> **Le suffixe sort du flux et se pose sur le bord droit du champ.**

Le nombre retrouve la boîte exacte de ses voisins — 59 px, même centre — et l'unité reste où
elle était. Elle n'intercepte pas les clics, donc le champ dessous reste aussi facile à
atteindre qu'un autre ; une valeur assez longue pour passer dessous est déjà tronquée par
l'input.

Les libellés `X` et `Y`, eux, étaient **déjà** à l'intérieur des contrôles — même préfixe,
même mécanisme que Position et Scale. Ce qui trahissait la ligne était le décalage, pas le
placement.

---

## 2. Un Component lâché sur un nœud ouvre son picker

Le geste a été refusé **trois fois**, et chaque refus était juste au moment où il a été pris
(ADR-0040 §4, ADR-0041 §6.1, ADR-0047 §2). La raison sous-jacente n'a jamais changé : ce
qu'un Component nomme est un **groupe** de propriétés, et un nœud en veut **une**. Toutes les
versions qui **écrivaient** quelque chose écrivaient une valeur que le créateur ne voyait pas
et que son clic suivant écrasait.

**Ce qui a changé est que le picker a gagné des niveaux.** Il parcourt `Component > Property`
depuis ADR-0047 §1. Il existe donc désormais un état entre « rien de choisi » et « une
propriété choisie » qui vaut la peine d'être atteint : **la liste, déjà à l'intérieur de ce
Component**.

> **Le lâcher ouvre cette liste. Il n'écrit rien.**

Rien n'étant écrit, rien ne peut être écrasé — l'objection des trois refus tombe, sans que
leur raisonnement ait été mauvais. Le clic suivant du créateur finit le nœud.

```
  glisser Transform sur un Get Property
      ↓
  son picker s'ouvre sur TRANSFORM
      All categories        ← la sortie, toujours là
      Position X
      Position Y
      Rotation X
      Rotation Y
      Scale X
      Scale Y
      ↓  un clic
  Object: Self   Property: Rotation Y      ← nœud fini
```

**Le canvas ouvre le contrôle qu'il dessine déjà.** Construire ici un second menu à partir des
mêmes options est la façon dont deux listes commencent à diverger ; la règle demande, la
fenêtre ouvre (`pickProperty`), et `px-menu` sait entrer dans un groupe (`category`) comme
`→` le fait.

**Le canvas nu reste refusé.** Quelle propriété est précisément ce qu'un Component ne dit pas,
et un lâcher fait un nœud fini ou n'a pas lieu (ADR-0039 §0.2). Le refus nomme les deux
routes qui marchent.

---

## 3. Trois arrondis, pas un

`Round` ne laisse pas choisir la direction. Coller à une grille, compter des entiers et
borner à une tuile en veulent chacun une en particulier, et écrire l'une ou l'autre à partir
de `Round` demande un décalage qu'un créateur ne devrait pas avoir à déduire. `Floor` et
`Ceil` rejoignent donc `Round`.

---

## 4. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Les trois lignes du Transform centrent leur valeur au même endroit | mesuré dans Chrome |
| Un Component lâché sur un nœud de propriété ouvre son picker dans ce groupe | `dnd.test.js`, **et exécuté dans Chrome** |
| Ce lâcher n'écrit rien | `dnd.test.js` |
| Un Component sur un nœud qui ne demande pas de propriété est refusé | idem |
| Un Component sur le canvas nu reste refusé | idem |
| `Floor` et `Ceil` arrondissent dans leur direction, y compris en négatif | `nodes.test.js` |
