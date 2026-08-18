# ADR-0033 — Un nœud est une suite de rangées, un fil se dessine sans se pointer, et une couleur dit ce qui circule

- **Statut :** **accepté** (2026-08-19)
- **Décide :** la géométrie d'un nœud, les gestes qui portent un fil, et ce qu'une teinte
  affirme sur la toile
- **Dépend de :** ADR-0006 (Web Components), ADR-0023 (types de propriétés), ADR-0024
  (Undo/Redo), ADR-0027 (modèle de graphe et rendu SVG), ADR-0028 (feedback de dépôt et
  prévisualisation), ADR-0030 (palette de six teintes), ADR-0031 (valeur d'instance sur un
  port)
- **Amende :** ADR-0030 §4 (une catégorie donnait sa teinte, y compris quand le nœud *est*
  une valeur), ADR-0028 §2 (le principe « la prévisualisation ne touche pas le modèle »
  n'avait pas été appliqué à la toile)

---

## Contexte observé

ADR-0031 a donné une valeur d'instance à un port, et l'Editor l'a dessinée. En s'en
servant, quatre constats — trois de géométrie, un d'interaction, et tous du même genre :
**une décision de rendu prise deux fois, à deux endroits, sans que rien ne dise laquelle
gagne.**

| Constat mesuré | Cause |
|---|---|
| Un nœud `Number` affichait son slot de sortie sur une ligne et la valeur qui en sort sur une autre | un nœud avait **deux zones** empilées : les rangées de ports, puis une bande de params |
| `Set Property` mettait le port `value` à quatre pixels du champ qui l'alimente | même cause |
| `Add` dessinait son champ **à travers** le mot « Result », qui n'affichait plus qu'un `t` | la largeur d'un champ ne tenait pas compte des libellés qu'il ne remplace pas |
| Couper un fil marchait sur les bords de la bande et pas sur le trait | le trait **visible** est dessiné au-dessus de sa propre cible de clic |

Et un cinquième, de vocabulaire : un nœud `Number` portait le vert de la catégorie `Values`
tandis que son port portait le bleu de `number`. Deux couleurs, un seul objet.

Aucun n'est un réglage de pixels. Chacun est le symptôme d'un modèle de rendu qui décrit un
nœud comme un empilement de zones alors qu'un créateur le lit **ligne par ligne**.

---

## Décision

### 1. Un nœud est une suite de rangées, et une règle les remplit

**VALIDÉ.** `editor/graph/view.js` ne connaît plus « les ports » et « les params » comme
deux listes à empiler. Il connaît des **rangées**, chacune portant au plus un port d'entrée,
un port de sortie, et un contrôle :

> **Un contrôle appartient à la rangée du port qu'il édite ; un contrôle qui n'édite aucun
> port prend la première rangée qui n'en a pas, et en crée une quand il n'en reste plus.**

C'est toute l'algèbre. Ce qu'elle produit, sans un seul cas particulier :

| Nœud | Rangées |
|---|---|
| `Number`, `Boolean`, `Text` | **une** — le champ et le slot de sortie, côte à côte |
| `Get Property` | **une** — le sélecteur de propriété, et le slot qui porte sa valeur |
| `Set Property` | flux entrant / sélecteur / flux sortant, puis le slot `value` **à côté** de son champ |
| `Add` | `A` avec son champ et `Result`, puis `B` avec le sien |
| `Branch` | flux entrant / `True`, puis la condition à côté de sa case / `False` |

**Pourquoi c'est plus qu'un rangement.** Un créateur lit un graphe en suivant une valeur
jusqu'à un slot. Quand la valeur est sur une ligne et le slot sur une autre, le nœud cesse
de dire **dans quel slot** cette valeur entre — c'est-à-dire exactement ce qu'un langage
visuel sert à dire. Deux zones empilées rendaient cela impossible à corriger en déplaçant
des pixels.

**Un contrôle est le libellé de sa rangée**, et une rangée dit une chose une fois :

- un contrôle qui édite un port remplace **le libellé de ce port** — le champ *est* ce que
  le slot transporte, et `A [0] A` écrit le même mot deux fois sur une carte de 176 px ;
- un contrôle qui n'édite aucun port remplace les libellés des ports de **sa** rangée : un
  nœud `Number` est un champ et le slot par lequel son contenu sort.

Cette règle vit dans la **géométrie** (`silencedPorts()`), pas dans le renderer, parce que
la réponse décide deux choses qui doivent être d'accord : si un libellé est dessiné, et
combien de place le champ lui laisse. Un renderer qui déciderait seul finirait par écrire un
libellé dans un champ — ce qu'il faisait.

### 2. Un fil se dessine ; c'est la cible sous lui qu'on pointe

**VALIDÉ.** Le trait visible d'un fil est désormais **inerte** (`pointer-events: none`).

C'est la correction d'un défaut qui se lisait comme de l'imprécision et qui était une
inversion : le trait est dessiné **au-dessus** de sa propre cible large, donc à l'endroit
exact où un créateur vise — le trait lui-même — c'était lui l'élément le plus haut. Ses
événements partaient vers la toile, qui les lisait comme un clic dans le vide. Couper un
fil ne marchait **que** sur la frange de la bande, de part et d'autre du trait visé.

Deux conséquences, dans le même sens :

- **couper est un clic, pas une pression.** Trancher au `pointerdown` faisait disparaître un
  fil sous une main qui n'avait pas fini de décider ;
- **les traits sont mesurés à l'écran** (`vector-effect: non-scaling-stroke`). Un fil de
  2 px dans un groupe mis à l'échelle 0,25 fait un demi-pixel de couleur, et sa cible de
  14 px en fait trois et demi : plus un créateur dézoomait, moins la toile était utilisable,
  précisément au moment où il en voyait le plus.

### 3. Reprendre un fil ne détruit rien avant le lâcher — étend ADR-0028 §2

**VALIDÉ.** Presser un port d'entrée **connecté** reprend le fil qui l'alimente, par son
autre bout. C'est le geste qu'ont tous les éditeurs nodaux, et la seule façon de déplacer
une connexion sans d'abord la détruire en espérant se souvenir d'où elle venait.

ADR-0028 §2 dit qu'une prévisualisation est pure et réversible ; il l'écrivait pour les
listes, et la toile n'avait pas été relue à cette lumière. Donc :

- l'ancienne connexion **reste dans le modèle** pendant tout le geste, dessinée en pointillé
  effacé ;
- le lâcher la remplace en **un** `batch` — déplacer une connexion est **un** `Ctrl Z`, pas
  une suppression qu'il faut annuler deux fois (ADR-0024 §4) ;
- abandonner le geste ne défait rien, parce que rien n'a été écrit. C'est ce qui rend
  l'essai gratuit.

**Un fil lâché dans le vide reste une question** (ADR-0027) : le sélecteur s'ouvre et ne
propose que les types compatibles. Un fil *repris* et lâché dans le vide pose la même
question, et sa connexion d'origine part dans le même `batch` que la nouvelle.

### 4. Un nœud qui **est** une valeur porte la teinte de cette valeur — amende ADR-0030 §4

**VALIDÉ.** ADR-0030 §4 a tranché que six teintes répondent à deux questions — *qu'est-ce
que ce nœud* et *que transporte ce fil* — et que la catégorie donne la première. C'est juste
partout sauf pour une catégorie : `Values`.

Un nœud `Number` **est** un nombre. Lui donner le vert de `Values` pendant que son port
porte le bleu de `number`, c'est la seule endroit de la palette où le même objet reçoit deux
couleurs, et c'est celui où le créateur apprend le vocabulaire.

> **La catégorie `Values` ne donne pas de teinte : un nœud littéral porte celle du type
> qu'il produit.** Toutes les autres catégories restent celles d'ADR-0030 §4.

Ce n'est pas une exception commode, c'est l'application de la règle d'ADR-0030 à un cas
qu'elle n'avait pas distingué : la teinte dit *ce que c'est*, et pour un littéral, ce que
c'est **est** son type.

**Et la prévisualisation d'un fil porte sa teinte**, plus l'accent du produit. Un fil en vol
est le moment où un créateur a le plus besoin de savoir ce qui circule ; le corail ne disait
que « il se passe quelque chose ».

---

## Ce que cet ADR ne décide pas

- **Les références à un Object ou à un Component dans le graphe** : c'est un problème de
  **modèle**, pas de rendu, et il touche la réplication. Il reste ouvert et mérite son
  propre ADR.
- **Les nœuds de commentaire, la sélection multiple, la minimap** : ADR-0027 les laisse
  ouverts et rien ici ne les ferme.
- **Le repliement d'un nœud** (masquer ses rangées) : la question ne se pose que sur des
  nœuds beaucoup plus grands que ceux du catalogue actuel.
- **Une console d'erreurs** : le bandeau existe, et ce qu'il lui manquait — être cliquable,
  compter par sévérité — n'est pas une fenêtre.

---

## Conséquences

### Positives

- `Number`, `Boolean` et `Text` tiennent sur **une** ligne, sans que rien ne soit codé en
  dur pour eux : c'est la règle des rangées qui le produit.
- Le slot de `Set Property` est en face de la valeur qu'il reçoit, et celui de
  `Get Property` en face de la propriété qu'il rend.
- Couper un fil marche là où on vise, et à tous les niveaux de zoom.
- Déplacer une connexion est un geste réversible et une seule entrée d'historique.
- Un `number` est bleu du champ jusqu'au fil, en passant par le nœud qui le porte.

### Négatives

- Une rangée fait 22 px au lieu de 20 : un nœud à quatre ports est huit pixels plus haut.
  Assumé — une rangée doit pouvoir contenir un champ, et 20 px n'est pas une boîte de saisie.
- La largeur réservée à un libellé (`CONTROL_LABEL_INSET`) est une constante choisie à la
  main, comme le carré de préhension d'ADR-0017. Elle est correcte tant qu'elle correspond à
  la fonte des libellés de ports.
- Le trait visible ne réagit plus au survol par lui-même ; c'est la cible qui le colore. Une
  règle CSS de moins, mais elle dépend d'un sélecteur de frère.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder deux zones et rapprocher la bande des ports** | La valeur reste sur une autre ligne que son slot ; le nœud continue de ne pas dire ce qui entre où |
| **Un cas particulier « nœud de valeur » dans le renderer** | Trois nœuds aujourd'hui, dix demain, et une règle que rien ne peut vérifier |
| **Décider les libellés masqués dans le renderer** | Deux avis sur la même question, et le jour où ils diffèrent un libellé est dessiné dans un champ |
| **Déclarer `label: ''` dans le catalogue pour les nœuds de valeur** | Le modèle perdrait une information vraie pour une raison d'affichage ; le validateur et les tests lisent ces libellés |
| **Élargir la cible de clic d'un fil** | Le problème n'était pas la largeur, c'était que le trait visé était au-dessus de la cible |
| **Débrancher au moment de la pression pour reprendre un fil** | « Lâcher là où on a pris » deviendrait un acte destructeur |
| **Une septième teinte pour les littéraux** | Une couleur de plus pour dire ce que la palette dit déjà |
