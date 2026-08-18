# ADR-0028 — Le reflow live appartient aux listes plates, jamais à l'arbre ; le Graph reste dans le stage

- **Statut :** **accepté** (2026-08-18)
- **Dépend de :** ADR-0006 (Web Components), ADR-0018 (ordre structurel), ADR-0019 (Operations structurelles), ADR-0024 (Undo/Redo), ADR-0026 (drag & drop transverse)
- **Amende :** ADR-0026 §6 (le feedback de dépôt n'était pas décrit), et la décision non écrite portée par un commentaire de `windows/hierarchy.js`

## Contexte observé

`windows/hierarchy.js` portait, en commentaire, une décision jamais versée dans un ADR :

> *« The row being carried stays in place and goes quiet: a list that reflows under the
> pointer is a list you cannot aim at. »*

Elle était juste — pour un arbre — et fausse partout ailleurs, et rien ne disait laquelle
des deux situations on regardait. Une décision de ce poids ne peut pas vivre dans un
commentaire d'implémentation : elle est invisible depuis les autres fenêtres, qui ont
ensuite hérité d'un feedback statique sans que personne ait tranché.

Trois faits mesurés ont motivé la révision :

| Constat | Où |
|---|---|
| `legacy/editor/misc/sorter.js` réorganisait bien la liste **sous** le pointeur (`dragEnter` → `insertBefore`) | Legacy, et c'était son meilleur geste |
| L'Editor n'affiche qu'un trait de 2 px, identique quelle que soit la liste | Hierarchy, Inspector, Project |
| La géométrie du dépôt est déjà pure et testée (`windows/drop.js`) | Rien à réécrire pour changer le feedback |

Le legacy prouve l'ergonomie ; son architecture ne se recopie pas (Drag & Drop HTML5,
mutation du DOM réel pendant `dragenter`, état statique partagé entre fenêtres).

## Décision

### 1. Deux feedbacks, et c'est la **forme de la collection** qui choisit

**VALIDÉ.**

| Collection | Feedback | Pourquoi |
|---|---|---|
| **Liste plate** — Components, propriétés d'un `.px`, tuiles du Project | **Reflow live** : l'élément suit le pointeur, les autres se réorganisent avant le drop | Une seule question — *à quel rang ?* — et la réponse est visible à l'endroit exact où elle s'appliquera |
| **Arbre** — Hierarchy | **Pas de reflow** : la ligne portée s'estompe, un indicateur dit *avant / dedans / après* | Deux questions — *quel parent ?* **et** *quel rang ?* — et une liste qui bouge déplace la cible pendant qu'on vise |

Ce n'est pas une préférence esthétique : dans un arbre, déposer *dedans* change le parent,
donc la place de l'objet dans le monde (ADR-0022). Une cible qui se dérobe pendant le geste
rend cette erreur facile et coûteuse. Dans une liste plate, il n'existe pas de « dedans » :
le seul risque est un rang voisin, corrigeable d'un pixel.

### 2. La prévisualisation ne touche jamais le modèle

**VALIDÉ.** Elle est **pure et réversible** :

- aucun `setProperty`, aucune Operation, aucune entrée d'historique pendant le geste ;
- l'ordre prévisualisé est **dérivé** de l'ordre réel et d'un rang candidat, jamais stocké ;
- annuler le geste (Échap, `pointercancel`, dépôt refusé) restitue l'ordre réel sans rien
  défaire — il n'y a rien à défaire ;
- **une seule** Operation est produite, au drop, exactement comme aujourd'hui.

C'est la même frontière qu'ADR-0026 trace entre `rules.js` (ce qu'un dépôt signifie) et les
fenêtres (le DOM) : le feedback est une vue, pas une mutation.

### 3. Un dépôt possible se **voit**, un dépôt refusé aussi

**VALIDÉ.** Partout — Project, Hierarchy, Inspector, Graph, propriété acceptant une
ressource :

- la zone qui accepte porte un état `drag-over` explicite ;
- une cible refusée est marquée comme refusée, pas laissée muette ;
- le curseur suit la même convention (`grab` / `grabbing` / `copy` / `no-drop`) ;
- `rules.describe()` fournit déjà la phrase du refus (ADR-0026 §6) : elle est affichée,
  pas devinée.

« Rien ne s'est passé » reste la pire réponse à un geste.

### 4. Le Graph reste dans le **stage**

**VALIDÉ.** Le `stage-tabs` actuel est conservé : viewport et Graph s'échangent au centre.

Le stage veut dire *« ce que le créateur est en train d'éditer »*, et un éditeur nodal a
besoin de surface. La bande basse — Timeline — est une piste temporelle : la mettre en
concurrence avec un graphe donnerait 200 px de haut à un canevas qui se parcourt en deux
dimensions.

**Ce que cette décision ne ferme pas.** `px-graph` ne connaît ni sa taille ni sa place :
il s'attache à une définition et se dessine. Le jour où un système de panneaux
redimensionnables existera, le déplacer sera un changement de `editor.js` et de `layout.js`,
et d'aucun autre fichier. La décision est donc réversible par construction, et c'est ce qui
la rend acceptable maintenant.

## Ce que cet ADR ne décide pas

- **La sémantique du transport** — Play / Pause / Stop : ADR-0029.
- **Le prefab** : toujours reporté (ADR-0026 §7).
- **Un système de docking** : rien ici ne le conçoit ; §4 se contente de ne pas l'empêcher.

## Conséquences

### Positives

- La règle est écrite une fois et vaut pour toute liste future ; le commentaire de
  `hierarchy.js` renvoie désormais ici au lieu de trancher seul.
- Le reflow ne peut pas corrompre le modèle : il n'y accède pas.
- Un créateur voit où son élément atterrira avant de lâcher, dans les listes où c'est la
  seule question posée.

### Négatives

- Deux feedbacks à maintenir au lieu d'un. Assumé : ils répondent à deux questions
  différentes, et les confondre est précisément ce qui rendait l'arbre difficile à viser.
- Le reflow demande de mesurer les rangs avant le geste et de les tenir à jour pendant :
  un coût de calcul par déplacement de pointeur, borné par le nombre d'éléments visibles.
