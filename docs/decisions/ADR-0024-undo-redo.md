# ADR-0024 — Undo/Redo : `invert()` au Core, `History` à l'Editor, une pile par ressource

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0008 (Operations, `previous`, `batch`), ADR-0011 (autorité), ADR-0019 (`invert()`), ADR-0020 (`ResourceId`)

## Contexte observé

ADR-0008 posait que « undo/redo devient une conséquence de l'architecture, pas une
fonctionnalité à part ». Rien n'était construit : `SET_PROPERTY` portait `previous`, et
aucun code ne s'en servait.

## Décision

### 1. Le partage de responsabilité

| Ce qui | Où | Pourquoi |
|---|---|---|
| Une Operation porte de quoi s'inverser | **Core** — le format | c'était déjà le cas pour `SET_PROPERTY` |
| `invert(operation) → operation` | **Core** | une seule place connaît la règle de chaque type ; pur, testable sous Node ; empêche l'Editor de re-dériver ces règles |
| La pile, le groupement, le raccourci | **Editor** | annuler est un acte d'auteur. Un serveur headless qui rejoue n'annule rien |

C'est la même frontière qu'ADR-0017 trace pour la sélection.

### 2. Quatre règles, et elles suffisent

**1. On enregistre ce que `submit()` a émis** — donc jamais une opération reçue par
`apply()`. L'anti-écho (ADR-0008, ADR-0019) protège l'historique **gratuitement** : une
opération répliquée n'émet rien, donc elle n'atteint jamais l'écouteur.

**2. On n'enregistre que ses propres opérations** (`actor === moi`). Sans cette règle,
`Ctrl Z` annulerait le travail d'un autre créateur. Aucune machinerie : le champ existe
déjà. `actor: null` enregistre tout, ce qui est le cas mono-utilisateur, et le cas actuel.

**3. Annuler passe par `submit(invert(op))`, jamais par `apply()`.** Un undo est une
**nouvelle intention** : elle doit être arbitrée — le serveur peut la refuser — et elle
doit se répliquer. Un undo appliqué localement désynchroniserait le projet en silence.

> C'est le point le plus facile à se tromper de tout le système. Il est vérifié par un test
> dédié : **un undo émet bien `'operation'`**, et ce que le pipeline annonce est une
> mutation réelle et répliquable.

**4. Un `batch` est une entrée**, inversée dans l'ordre inverse. Un drag est un undo ; un
dépôt de Hierarchy qui a aussi réécrit cinq valeurs de Transform (ADR-0022) aussi.

La pile de redo est la pile des opérations annulées, **vidée dès qu'une nouvelle opération
est soumise** : elle décrivait un futur qui n'existe plus.

Un undo refusé par l'autorité ne bascule rien : les deux piles restent intactes, parce
qu'il n'y a rien à re-annuler.

### 3. Aucun second chemin de mutation

L'historique **ne mute jamais le modèle directement**. Il n'a qu'une action :
`submit(invert(op))`. Il n'existe donc rien d'annulable qui ne soit pas répliquable, et
aucune façon pour l'historique et le réseau d'être en désaccord sur ce qui s'est passé.

### 4. Une pile par ressource

Une pile globale est l'erreur classique : `Ctrl Z` dans la fenêtre `Graph` annulerait une
modification faite dans la scène.

| Pile | Sur quel pipeline | Ce qu'elle annule |
|---|---|---|
| Project | pipeline Project | créer / supprimer / renommer une ressource |
| Scene (une par scène ouverte) | pipeline de cette Scene | tout le modèle de scène |
| Graph (une par graphe ouvert) | pipeline de ce graphe | l'édition du graphe, quand son modèle existera |

`Histories` les indexe par `ResourceId` (ADR-0020). Fermer un éditeur libère sa pile.

### 5. Ce qui n'est pas restauré, et doit être dit

L'état d'exécution d'un graphe (la `WeakMap` de `Behaviors`) et les champs de travail d'un
Component ne sont **pas** restaurés. Ce sont de l'état vivant, pas des données de projet ;
**annuler ne remonte pas le temps de la simulation.** C'est la même frontière qu'entre une
écriture directe et un `setProperty()` (ADR-0003), et il faut qu'elle soit énoncée plutôt
que découverte.

### 6. Ce que le format doit porter pour que cela marche

Ces champs ne servent qu'à inverser, et ADR-0019 les nomme :

| Sans quoi | L'undo rendrait |
|---|---|
| `SET_PROPERTY.previous` | rien |
| `REMOVE_OBJECT.subtree` | un objet dépouillé de ses enfants |
| `REMOVE_OBJECT.index` | l'objet en fin de liste |
| `REMOVE_COMPONENT.values` | un composant remis à ses défauts — le `42 → 1` mesuré en Phase 1 |
| `REPARENT.previousParent` / `previousIndex` | un objet reparenté « quelque part » |

## Ce que cet ADR ne décide pas

**La portée d'undo d'une action qui touche deux ressources.** Créer un Component crée une
`ComponentResource` **et** une `GraphResource` : c'est un `batch` du pipeline Project, donc
une entrée de la pile Project — cohérent. Mais si le créateur édite ensuite le graphe,
annule trois fois dans la fenêtre `Graph`, puis annule une fois dans le panneau Project, la
création est annulée alors que des modifications de son graphe restent dans une pile qui
vise une ressource disparue.

Trois traitements possibles — fermer un onglet vide sa pile ; supprimer une ressource
invalide les entrées qui la visent ; interdire d'annuler une suppression de ressource
depuis une autre pile. **Aucun n'est retenu.** C'est le seul point où inventer serait une
faute, et il devient décidable quand la fenêtre `Graph` existe.

Ne sont pas décidés non plus : la profondeur de pile réelle (200 par défaut, arbitraire et
sans conséquence), et l'entrée de menu Undo/Redo — seuls les raccourcis sont câblés.

## Conséquences

### Positives

- Undo/redo est une conséquence du format, sans code de mutation dédié.
- Un undo est observable, répliquable et arbitrable comme tout le reste.
- `Ctrl Z` ne peut pas franchir une frontière de ressource ni annuler le travail d'un autre.

### Négatives

- Un undo peut être **refusé** par l'autorité. C'est correct, et c'est nouveau pour qui
  attend d'un undo qu'il réussisse toujours.
- Le module doit ignorer les opérations qu'il émet lui-même pendant qu'il rejoue, sans quoi
  un undo deviendrait immédiatement son propre undo.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Annuler par `apply()`** | Désynchronise en silence : ni arbitrage, ni réplication. |
| **Un instantané par entrée d'historique** | Perd l'intention, ne se réplique pas, et coûte une scène entière par frappe. |
| **`invert()` dans l'Editor** | Une seconde copie des règles du format, invisible à un serveur qui rejoue. |
| **Une pile globale** | `Ctrl Z` dans une fenêtre annulerait le travail fait dans une autre. |
| **Restaurer aussi l'état d'exécution** | Annuler n'est pas rembobiner une simulation ; ce serait un second modèle de temps. |
