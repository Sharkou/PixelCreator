# ADR-0032 — Il y a un seul sujet, et une intention de sélection s'annonce au lieu de se propager

- **Statut :** **accepté** (2026-08-19)
- **Décide :** comment un panneau dit « voilà ce que le créateur regarde », et ce qui garantit
  qu'un seul panneau le dit à la fois
- **Dépend de :** ADR-0006 (Web Components, aucune fenêtre ne connaît les autres), ADR-0011
  (autorité et anti-écho), ADR-0017 (la sélection appartient à l'Editor), ADR-0020
  (Resources), ADR-0025 (le Workspace possède la ressource sélectionnée), ADR-0027 (un nœud
  sélectionné est une sélection de `.px`)
- **Amende :** ADR-0017 §4 (la sélection d'Object n'était pas le seul sujet ; il en existe
  trois), et la routine d'écho de `editor.js`

---

## Contexte observé

L'Editor a **trois sujets** — un Object, une Resource, un nœud de graphe — et **deux
détenteurs** : `Selection` (ADR-0017) et `Workspace.selectedId` (ADR-0025). Aucun des deux
n'est de trop : la sélection d'objet n'est pas répliquée et n'a pas de cycle de vie, la
ressource sélectionnée en a un (elle peut être supprimée, fermée, renommée). Ce qui manquait
est ce qui les **relie**.

Faute de ce lien, `editor.js` propageait chaque changement vers l'autre détenteur, avec un
drapeau `routing` pour couper l'écho. Trois défauts mesurés, tous du même geste :

| Constat | Cause |
|---|---|
| Cliquer dans le vide de la scène ne désélectionne pas la ressource du Project | `Selection.set(null)` **n'émet rien** quand la sélection était déjà vide : l'écho ne part jamais |
| `hierarchy.js` et `project.js` vident **les deux** détenteurs à la main | chaque fenêtre a dû découvrir seule que l'écho ne suffisait pas — et le Viewport ne l'a jamais découvert |
| Le drapeau `routing` doit être vrai pendant exactement un aller-retour | une garde qui dépend de l'ordre d'appel des observateurs |

Le drapeau n'était pas mal écrit : il répondait à la mauvaise question. Un écho existe
lorsqu'un changement doit **traverser** un système ; ici les deux détenteurs répondent à un
seul geste du créateur, et ce geste peut être annoncé une fois, en amont, au lieu d'être
reconstruit après coup à partir de ses conséquences.

---

## Décision

### 1. Une intention est annoncée, elle n'est pas déduite

**VALIDÉ.** `editor/subject.js` porte le seul vocabulaire dont une fenêtre a besoin :

```js
subject.object(object)     // « le créateur travaille sur cet Object »
subject.resource(id)       // « … sur cette Resource »
subject.clear()            // « … sur rien »
```

Une fenêtre appelle **une** de ces trois méthodes. Elle n'a pas à savoir qu'il existe un
second détenteur, ni à le vider, ni à vérifier ce qu'il contient — c'est exactement la
contrainte d'ADR-0006 : aucune fenêtre ne connaît les autres.

### 2. `Subject` est un aiguilleur, jamais un troisième détenteur

**VALIDÉ, et c'est la moitié importante de la décision.**

Il ne stocke aucune valeur. `Selection` reste la source de vérité de l'Object, le
`Workspace` reste celle de la Resource, et les vues continuent d'observer celui qui les
concerne — rien à re-brancher, aucune notification en double.

Un troisième détenteur aurait été un état de plus à tenir en phase avec deux autres, pour
une idée qui n'a pas de donnée propre : « quel est le sujet » se **lit** dans les deux
détenteurs, il ne se stocke pas.

> **L'invariant, et il est testable sans navigateur :** après n'importe quelle méthode de
> `Subject`, **au plus un** des deux détenteurs est non vide.

### 3. La réentrance est bornée par le geste, pas par un aller-retour

**VALIDÉ.** `Subject` applique ses deux écritures sous une garde de réentrance. La
différence avec le drapeau qu'il remplace est qu'elle ne protège plus d'un **écho** — il
n'y en a plus, puisque plus personne ne re-propage — mais d'un **observateur qui réagit en
sélectionnant autre chose** : supprimer un objet depuis un panneau qui écoute la sélection,
par exemple. Le premier geste gagne, les suivants sont ignorés jusqu'à ce qu'il soit fini.

Ce n'est pas la même garde qu'ADR-0011 : celle-ci distingue une intention locale d'une
opération répliquée, tandis que celle-là ordonne deux écritures d'un même geste.

### 4. Vider est une intention comme une autre

**VALIDÉ.** C'était le bug, et c'est la règle qui le ferme : `subject.clear()` écrit dans
les deux détenteurs **sans condition**. Que l'un des deux ait déjà été vide n'a jamais été
une raison de laisser l'autre plein.

Le clic dans le vide — la scène, la grille du Project, l'espace sous l'arbre — appelle donc
`subject.clear()`, et les trois panneaux répondent au même geste par le même effet.

### 5. Sélectionner un nœud reste une sélection de `.px`

**VALIDÉ, inchangé (ADR-0027 §10).** Un nœud sélectionné veut dire « le Component est ce sur
quoi tu travailles », donc c'est `subject.resource(definition.type)`. La fenêtre Graph garde
sa propre sélection de nœud pour déplacer et supprimer : c'est un état de vue, pas un sujet.

---

## Ce que cet ADR ne décide pas

- **La sélection multiple.** ADR-0017 §4 la laisse ouverte et rien ici ne la ferme :
  `Subject` prend un Object, et le jour où il en prendra plusieurs, ce sera une décision sur
  ce que « l'objet sélectionné » veut dire pour chaque consommateur.
- **La sélection d'un Component d'un Object** comme sujet à part entière : l'Inspector
  montre déjà les Components de l'objet sélectionné, et rien ne demande un quatrième sujet.
- **La réplication de la sélection** entre deux créateurs : ADR-0017 l'exclut, et ce n'est
  pas rouvert.

---

## Conséquences

### Positives

- Un clic dans le vide veut dire la même chose dans les quatre fenêtres.
- Le drapeau `routing` disparaît, et avec lui la dépendance à l'ordre des observateurs.
- Une fenêtre nouvelle n'a qu'un vocabulaire à apprendre, et ne peut pas oublier le second
  détenteur : elle ne le voit pas.
- L'invariant « au plus un sujet » est un test sous Node, pas une inspection à l'œil.

### Négatives

- Une indirection de plus entre une fenêtre et `Selection`. Bornée : trois méthodes, aucun
  état.
- Les appels directs à `selection.set()` restent possibles depuis le code qui *lit* la
  sélection. C'est assumé — `Selection` est encore l'API de lecture — et c'est ce que le
  test d'invariant surveille.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder l'écho et faire émettre `Selection.set(null)` même à vide** | Une notification qui ne correspond à aucun changement, envoyée à chaque clic dans le vide, à toutes les vues |
| **Fusionner les deux détenteurs en un** | Un Object et une Resource n'ont ni le même cycle de vie ni les mêmes observateurs ; ADR-0017 et ADR-0025 les ont séparés pour de bonnes raisons |
| **Un troisième détenteur qui possède « le sujet »** | Trois états à tenir en phase pour une idée qui se lit dans les deux autres |
| **Laisser chaque fenêtre vider les deux** | C'est l'état de départ : deux fenêtres l'avaient trouvé, une ne l'avait pas trouvé, et rien ne le disait |
