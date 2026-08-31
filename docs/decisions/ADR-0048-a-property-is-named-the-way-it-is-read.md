# ADR-0048 — Une propriété se nomme comme elle se lit

- **Statut :** **accepté** (2026-08-31)
- **Décide :** comment une requête de recherche est comparée à une entrée ; comment une propriété s'appelle dans une liste ; ce qu'un Component lâché sur un graphe veut dire, définitivement ; quels nœuds de calcul manquaient au catalogue
- **Dépend de :** ADR-0026 §10 (menus groupés), ADR-0039 (taxonomie), ADR-0043 (l'Object répond de lui-même), ADR-0047 (une seule question)
- **Amende :** ADR-0047 §2 (le refus du geste Component → graphe est confirmé, avec une mesure à l'appui plutôt qu'un raisonnement)
- **Ne décide pas :** `On Collision` et la physique ; l'identité d'un projet et son slug ; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn` ; l'unité d'un port

---

## 1. Une requête peut nommer le groupe et la ligne

Retirer le champ `Component` (ADR-0047 §1) a fait du GROUPE la moitié du nom d'une propriété.
Le moteur de recherche, lui, comparait la requête **entière** à **un champ à la fois** — donc
`Transform Position X`, la requête qu'un créateur écrit quand il sait exactement ce qu'il
veut, ne pouvait correspondre à rien : `Transform` est la catégorie, `Position X` est le
libellé, et aucun champ ne contient les deux.

> **Chaque mot de la requête doit être répondu, par le champ qui le répond.**

La requête entière contre un seul champ reste essayée **en premier**, donc toute recherche
d'un seul mot se classe exactement comme avant. Le découpage n'intervient que lorsque rien
ne répond en bloc.

C'est un **ET** : la liste rétrécit à mesure qu'on tape, ce qu'un filtre est censé faire. Un
mot que rien ne répond exclut l'entrée.

| Requête | Avant | Après |
|---|---|---|
| `Transform Position X` | rien | `Transform ▸ Position X` |
| `Health Value` | rien | `Health ▸ Value` |
| `Object Name` | rien | `Object ▸ Name` |
| `add` | `Add`, `Add Component` | inchangé |

---

## 2. `X` n'est pas un nom, c'est une moitié de nom

L'Inspector dessine `x` et `y` sur **une ligne** sous le mot `Position` : la ligne dit la
paire, donc la propriété n'a pas à la dire. Un picker n'a pas cette ligne — `X` s'y retrouve
sous `Transform`, à côté de `Scale X`, et un créateur qui cherche les mots qu'il voit dans le
panneau ne trouvait rien.

> **Dans une liste, une propriété qui est la moitié d'une paire dit de quelle paire.**

Seules les moitiés qui ne peuvent pas parler d'elles-mêmes : `scaleX` s'humanise déjà en
`Scale X` et `width` en `Width`, et les préfixer produirait `Scale Scale X` et `Size Width`.
Un libellé d'un ou deux caractères est exactement le cas que le nom de la paire doit
rattraper.

```
  Transform
    Position X   ← était « X »
    Position Y   ← était « Y »
    Rotation
    Scale X
    Scale Y
    Rotation X
    Rotation Y
```

C'est aussi ce qui rend la requête de §1 utile : un créateur cherche les mots qu'il lit.

---

## 3. Un Component ne se lâche toujours pas sur un graphe — et cette fois c'est mesuré

ADR-0047 §2 l'a refusé parce que le geste écrirait une valeur morte. Le modèle a changé
depuis (le picker est hiérarchique), donc la question a été reposée honnêtement : **un lâcher
de Component pourrait-il ouvrir le picker positionné sur ce Component ?**

Techniquement oui. Mais le geste qui existe déjà est plus court, et il a été **exécuté dans
Chrome** :

```
  glisser LA PROPRIÉTÉ  →  menu Get / Set  →  un nœud FINI
                            (Object et Property remplis)

  glisser LE COMPONENT  →  picker ouvert sur un groupe  →  il reste à choisir
```

Le premier finit le nœud ; le second ouvre une question. Un geste qui économise un clic sur
un chemin déjà plus long que l'autre chemin n'est pas une affordance, c'est une seconde
manière de faire moins bien. **Le refus est définitif** et son message nomme les deux routes
qui marchent — glisser la propriété, ou ouvrir le picker où ce Component est un groupe.

---

## 4. Un catalogue sans trous

Huit nœuds manquaient, tous d'une ligne, aucun ne touchant au runtime, à la réplication ou à
la scène — donc aucun ne demandant de décision :

| Catégorie | Ajoutés |
|---|---|
| `Math` | `Modulo`, `Min`, `Max`, `Absolute`, `Round` |
| `Compare` | `Greater Or Equal`, `Less Or Equal`, `Not Equal` |

`Modulo` prend la décision que `Divide` avait déjà prise, pour la même raison : `x % 0` est
NaN, et un NaN entrant dans un Transform se propage silencieusement à chaque frame suivante.
Il répond `0`.

`Absolute` et `Round` prennent **un** nombre là où `arithmetic()` en prend deux : c'est la
même forme avec un port de moins (`unary()`), pas une seconde idée.

`Not Equal` lit **la même comparaison** que `Equal`, à travers une fonction que les deux
appellent. L'écrire en `!==` à côté d'un `Equal` écrit en `===` est la façon dont deux règles
qui n'en faisaient qu'une commencent à diverger le jour où l'une apprend un type nouveau.

---

## 5. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Une requête à plusieurs mots trouve ce que ses mots nomment ensemble | `relevance.test.js`, et à l'écran |
| Une recherche d'un seul mot se classe comme avant | idem |
| `x` se lit `Position X` dans une liste, `scaleX` reste `Scale X` | `schema.test.js` |
| Le groupe `Transform` du picker lit comme le panneau | à l'œil, dans Chrome |
| Un Component lâché sur un graphe est refusé, avec les deux routes nommées | `dnd.test.js` |
| Glisser une propriété d'Object produit un nœud fini | **exécuté dans Chrome** |
| Les huit nœuds ajoutés répondent | `nodes.test.js` |
