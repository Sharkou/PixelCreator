# ADR-0040 — Un nœud par intention : le Component se range, la cible se désigne, le nom ne bouge pas

- **Statut :** **accepté** (2026-08-28)
- **Amendé par :** ADR-0041 (2026-08-28) — §2 : le Component redevient visible dans le contrôle fermé (`Transform ▸ Rotation`), comme contexte de la propriété et non comme seconde question. §4 (le dépôt d'un Component dans un graphe) est **confirmé** : réactivé puis retiré une seconde fois, cette fois sur mesure — voir ADR-0041 §6.1
- **Décide :** combien de nœuds de propriété existent ; si `Component` est une question posée au créateur ; comment un nœud désigne l'Object sur lequel il agit ; ce qu'un Component déposé sur un graphe veut dire ; si un nom de nœud peut changer
- **Dépend de :** ADR-0007 (schéma d'Inspector), ADR-0021 (identité de Component), ADR-0023 (`PropertyType`), ADR-0024 (undo par ressource), ADR-0027 (modèle de graphe), ADR-0034 (références d'Object), ADR-0036 (frontière `objectref` ↔ `object`), ADR-0037 (un dépôt déclare), ADR-0039 (taxonomie, portée, titres)
- **Amende :** ADR-0034 §3.2 et §3.3 (deux paires de nœuds deviennent une) ; ADR-0034 §3.2 (l'avertissement « prise Object vide ») ; ADR-0037 §2.4 et ADR-0034 §3.2 (le dépôt d'un **Component** dans un graphe est retiré) ; ADR-0039 §5 (la règle du nom devient absolue : le mécanisme disparaît)
- **Ne décide pas :** un type de port `component` ou `property`, toujours refusés (ADR-0039 §4) ; la forme du sélecteur groupé, qui est de l'UI et non un contrat

---

## 1. Le défaut : quatre nœuds pour deux intentions

Le catalogue offrait :

| Nœud | Ce qu'il lisait | Pourquoi il existait |
|---|---|---|
| `Get Property` | une propriété de **ce** Component | le cas local |
| `Get Property On` | une propriété d'un Component d'**un autre** Object | le cas distant |
| `Set Property` | idem, en écriture | |
| `Set Property On` | idem, en écriture | |

Un créateur qui veut « la vitesse » doit d'abord répondre à une question qu'il ne s'est pas
posée : **où cette propriété est-elle rangée ?** Il choisit un nœud d'après une distinction
du moteur — deux endroits où le Core va chercher une déclaration — et il le choisit **avant**
de savoir ce qu'il cherche, puisque le nœud vient avant le sélecteur.

Le prix se paie deux fois :

- **au dépôt.** Faire glisser `Transform.rotation` sur un `Get Property` était **refusé** :
  ce nœud-là ne lisait que ses propres propriétés. Le geste juste, sur le nœud qui portait le
  bon nom, ne marchait pas ;
- **à la reprise.** Passer de « ma vitesse » à « la vitesse du joueur » demandait de supprimer
  le nœud, d'en créer un autre et de refaire les fils. Le changement dans la tête du créateur
  était minuscule ; le changement dans le graphe ne l'était pas.

Le fait qu'un moteur cherche à deux endroits n'est **pas** une raison de garder deux nœuds.
C'est une raison de le cacher.

---

## 2. Décision : deux nœuds, et le `Component` cesse d'être une question

> **Il existe `Get Property` et `Set Property`, et rien d'autre. Le créateur choisit
> UNE propriété dans une liste groupée par Component (`Transform ▸ Rotation`). Le Core
> continue de stocker le couple `component` + `property` ; l'UI ne le demande jamais.**

| | |
|---|---|
| **Ancienne décision** | ADR-0034 §3.3 : `Get Property On` / `Set Property On` sont des nœuds distincts, portant deux paramètres — un type de Component, puis une de ses propriétés — présentés comme deux listes déroulantes. |
| **Problème** | Le créateur choisit un **nœud** d'après une distinction interne (où le Core cherche la déclaration), puis un **Component** d'après une abstraction du moteur, avant d'atteindre ce qu'il voulait : une propriété. Trois décisions pour une intention, dont deux ne parlent pas de son jeu. |
| **Nouvelle décision** | Un seul nœud par intention (lire / écrire). Un seul sélecteur, groupé : le groupe **This Component** d'abord, puis un groupe par type de Component. La valeur choisie porte les deux identités ; l'Editor les sépare en deux paramètres à l'écriture. |
| **Justification UX** | La question posée est celle que le créateur se pose (« quelle propriété ? »). Le Component reste **visible** — c'est le nom du groupe — mais comme structure de la réponse, jamais comme question préalable. Le nombre de décisions passe de 3 à 1, et le nœud cesse d'être un choix qu'on peut rater. |
| **Impact Core** | `property.getOn` / `property.setOn` disparaissent du catalogue. `property.get` / `property.set` portent `{ target, component, property }`, exposent **toujours** une prise `object`, et résolvent par un unique `resolvedProperty(node, context)` : `component` absent → les propriétés de ce `.px` ; `component` présent → celles du type nommé. Les deux genres de référence `PROPERTY_REFERENCE` et `COMPONENT_PROPERTY_REFERENCE` fusionnent en `PROPERTY_REFERENCE` : une question, un genre. |
| **Impact runtime** | Aucun changement de sémantique. `targetObject()` / `targetComponent()` répondaient déjà aux deux cas ; ils répondent maintenant depuis un seul nœud. Le Runtime reste sans DOM et le graphe reste exécutable sans Editor. |
| **Sérialisation** | Inchangée. Les paramètres stockés sont exactement ceux qu'écrivaient les quatre nœuds — `component` est un type de **portée projet** (`ResourceId` ou nom de classe), `property` une identité stable. Aucune `ObjectId` n'entre dans un `.px` (ADR-0034 invariant 1). |
| **Migration** | Un renommage, appliqué **aux deux portes** : `Graph.deserialize()` pour l'Editor et `compile()` pour le Runtime, qui ne construit jamais de `Graph` et compile la charge brute. `{ 'property.getOn': 'property.get', 'property.setOn': 'property.set' }` — les paramètres ne sont pas touchés, donc un graphe publié avant la fusion rend la même valeur après. Un type inconnu reste refusé : la migration est une table, pas un haussement d'épaules. |

### 2.1 Pourquoi `Component` reste stocké

Cacher une abstraction n'est pas la supprimer. Le Core a besoin de savoir **de quel type**
la propriété est déclarée pour la résoudre au run time, et ce type est une identité de
portée projet, légale dans un `.px`. Ce qui était faux, c'est de faire porter ce besoin au
créateur sous forme d'une seconde liste déroulante.

Le paramètre est donc déclaré `hidden: true` — le mot d'ADR-0007 pour « stocké, jamais
dessiné » — et l'Inspector le saute. Un seul contrôle écrit les deux moitiés.

---

## 3. Décision : l'absence de cible est `Self`, et ce n'est pas un vide

> **Un nœud de propriété a trois façons de répondre à « sur quel Object ? » : un fil, un
> sélecteur, ou rien — et *rien* veut dire l'Object auquel ce Component est attaché.**

| | |
|---|---|
| **Ancienne décision** | ADR-0034 §3.2 : une prise `object` non connectée rend `null`, et le validateur émet un avertissement — « aucun Object n'est choisi ni connecté ». |
| **Problème** | La règle a été écrite quand `Get Property On` était un nœud **distinct** dont la cible ne pouvait venir que d'un fil. Sur le nœud fusionné, elle avertit sur le graphe le plus courant qui soit : « fais tourner **moi** ». Un défaut signalé comme une erreur cesse d'être lisible comme un défaut. |
| **Nouvelle décision** | Un port `object` **que le nœud sait lui-même remplir** — c'est-à-dire portant un sélecteur de cible sur sa ligne — n'est jamais signalé vide. Un port `object` **nu** (`Is Valid`, `Parent`), qui n'a pas d'autre réponse possible, l'est toujours. La distinction se lit dans la définition du nœud, pas dans une liste de types de nœuds. |
| **Justification UX** | `Self` est le cas par défaut d'un débutant, et un défaut ne se déclare pas : il se constate. Le sélecteur **le montre** — il affiche `Self` tant que rien n'est choisi — de sorte que le créateur voit sur quoi le nœud agit sans avoir à connaître une convention. Rien ne se cache derrière le vide. |
| **Impact Core** | `checkObjectInputs()` saute les ports nommés par un paramètre `OBJECT_SOCKET_REFERENCE`. Le genre `COMPONENT_REFERENCE` perd son message `empty` : un nœud qui ne nomme aucun type lit **ce** Component, ce qui est le cas ordinaire et non un manque. |
| **Impact runtime** | Aucun. `targetObject()` retournait déjà `io.self` en dernier recours ; le validateur cesse simplement de contredire l'interpréteur. |
| **Sérialisation** | Aucune. « Rien » est l'absence de paramètre, ce que porte déjà tout graphe écrit avant cette décision. |
| **Migration** | Aucune. Un graphe qui portait l'avertissement ne le porte plus ; son comportement n'a jamais changé. |

---

## 4. Décision : un Component ne se dépose pas dans un graphe

> **Un glisser-déposer a une signification par famille : un Object est un endroit où agir,
> une propriété est quelque chose à lire ou écrire, une ressource est une valeur — et un
> Component est une chose qu'on donne à un Object. Ce n'est pas une chose qu'on met dans un
> graphe.**

| | |
|---|---|
| **Ancienne décision** | ADR-0034 §3.2 / ADR-0037 §2.4 : un Component déposé sur un nœud écrit son type dans le paramètre `component` ; déposé sur le canevas, il crée un `Get`/`Set Property On` déjà pointé. |
| **Problème** | Le paramètre `component` est maintenant écrit par le sélecteur de propriété — qui écrit **les deux moitiés à la fois**. Un dépôt qui n'écrit que la moitié `component` produit un état que rien ne peut lire : le nœud ne fait rien tant que `property` est vide, et la première interaction du créateur écrase la valeur déposée. Le geste ne change rien de visible et rien de lisible. |
| **Nouvelle décision** | Les règles `component-to-canvas` et `component-to-node` sont retirées. Un Component lâché sur un graphe est refusé, avec la phrase qui dit quoi faire : « un graphe travaille sur des propriétés, pas sur des Components — faites glisser l'une de ses propriétés, ou déposez-le sur un Object pour l'ajouter ». `component-to-object` est inchangé. |
| **Justification UX** | Un geste qui semble ne rien faire est pire qu'un geste refusé : le créateur ne sait pas s'il a raté la cible, si le produit est cassé, ou si rien n'était prévu. Une famille de drag, une signification — la promesse que le vocabulaire faisait déjà partout ailleurs. |
| **Impact Core** | Aucun : les règles de drag vivent dans l'Editor. |
| **Impact runtime** | Aucun. |
| **Sérialisation** | Aucune. |
| **Migration** | Aucune : rien de ce qui a été déposé auparavant n'est relu différemment. Un `.px` portant `component` sans `property` se comportait déjà comme un nœud non configuré. |

---

## 5. Décision : le nom d'un nœud ne peut pas changer — le mécanisme disparaît

| | |
|---|---|
| **Ancienne décision** | ADR-0039 §5 : le catalogue ne déclare plus aucun `title()`, mais `NodeDefinition.title` reste disponible et `shapeDependsOnNode()` en tient compte. |
| **Problème** | Une règle absolue tenue par la discipline n'est pas une règle : le prochain nœud qui aurait « une bonne raison » de se renommer le pourrait, et `Get Ground` reviendrait par ajout plutôt que par argument. |
| **Nouvelle décision** | `title` disparaît du contrat `NodeDefinition`, de `shapeDependsOnNode()` et de `describeNode()`. Un type de nœud a un `label` et **aucun autre moyen** de dire comment il s'appelle. Un test parcourt tout le catalogue et échoue si une définition déclare un `title`. |
| **Justification UX** | « Ajoutez un `Set Property` » doit désigner le même nœud une heure plus tard, dans un autre projet, dans un tutoriel et dans le menu de création. Ce avec quoi le nœud est configuré se lit **à l'intérieur**, sur les lignes où cela se change. |
| **Impact Core** | `shapeDependsOnNode()` ne regarde plus que `inputs` / `outputs`. Ce qu'un créateur voit bouger quand il configure un nœud, ce sont ses **ports** ; son nom est la seule chose qui tient. |
| **Impact runtime** | Aucun : un titre était de la présentation, jamais vu par l'interpréteur. |
| **Sérialisation** | Aucune. |
| **Migration** | Aucune. |

---

## 6. Ce que ça change pour un débutant, mesuré

Cinq tâches, comptées en **décisions** (un nœud choisi, une liste déroulante ouverte, un fil
tiré, un concept qu'il faut avoir compris pour avancer).

| Tâche | Avant | Après |
|---|---|---|
| Lire ma propre vitesse | 1 nœud + 1 liste | 1 nœud + 1 liste |
| Faire tourner mon Object | 1 nœud (`Set Property On`) + `Self` + 1 fil + 2 listes | 1 nœud + 1 liste |
| Écrire dans la vitesse du joueur | 1 nœud + 1 glisser d'Object + 1 fil + 2 listes | **1 glisser** (le nœud arrive fini) |
| Passer de « ma vitesse » à « celle du joueur » | supprimer, recréer, recâbler | 1 liste |
| Lire une propriété d'un Object trouvé par tag | 2 nœuds + 1 fil + 2 listes | 2 nœuds + 1 fil + 1 liste |

Concepts qu'il faut avoir compris pour écrire ces cinq phrases : **Object**, **propriété**,
**événement**, **fil**. `Component` n'y figure plus ; « où le moteur range une déclaration »
non plus.

---

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Le catalogue ne contient que `property.get` et `property.set` | `registry.types()` |
| Un graphe nommant `property.getOn` se charge comme `property.get` | `graph.test.js`, les deux portes |
| Un `.px` publié avant la fusion s'exécute encore | `interpreter.test.js`, sur la charge brute |
| Aucun nœud n'expose de champ `component` | `describeNode().fields`, sur le catalogue réel |
| `Set Property` dit Object, Property, Value — une fois chacun | `nodeRows()`, sur les vrais descripteurs |
| Une prise Object vide n'est signalée que si le nœud n'a pas d'autre réponse | `validate.test.js` |
| Un nœud de propriété sans cible agit sur son propre Object | `interpreter.test.js` |
| Aucun type de nœud ne peut se renommer | `nodes.test.js`, sur tout le catalogue |
| Un Component lâché sur un graphe est refusé avec une phrase | `dnd.test.js` |
| Chaque famille de drag a une règle et une seule | `ruleFor()`, par zone |

---

## 8. Conséquences

### Positives

- Deux nœuds au lieu de quatre, et le bon nœud est celui dont le nom correspond à l'intention.
- Le mot `Component` sort du langage visuel du graphe sans sortir du modèle.
- Changer de cible est un changement de liste, plus une reconstruction.
- Le glisser-déposer d'une propriété fonctionne sur le nœud qui porte le nom attendu.
- Une famille de drag, une signification.

### Négatives

- La liste de propriétés est plus longue : elle contient tous les Components du projet.
  Elle est groupée et filtrable, ce que ne serait pas une liste plate — mais sur un projet
  très large, elle devra gagner une recherche, ce que cet ADR ne décide pas.
- Le geste « déposer un Component sur le canevas » disparaît. Il ne produisait rien de
  lisible ; le geste équivalent est de déposer une **propriété**, qui produit un nœud fini.
- `component` est stocké et jamais montré : un état invisible, assumé, dont la seule
  écriture possible passe par le sélecteur qui écrit aussi `property`.

---

## 9. Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Garder les quatre nœuds « puisque le Core distingue les deux cas » | Une distinction interne n'est pas une raison d'exposer un choix. C'est la raison de le cacher. |
| Garder deux listes (`Component`, puis `Property`) | Deux questions pour une intention, dont la première parle du moteur. |
| Un mode sur le nœud (`Local` / `On Object`) | ADR-0039 §0.1 : un mode est un mot sur l'implémentation. Le geste dit déjà l'intention. |
| Montrer `Self` comme une **valeur** du sélecteur, à choisir | Un défaut ne se choisit pas. Il s'affiche, et une autre réponse le remplace. |
| Un dépôt de Component qui pré-filtre la liste | L'état ne serait toujours pas lisible sur le nœud, et serait écrasé au premier clic. |
| Laisser `title` au contrat « au cas où » | Une règle absolue tenue par la discipline finit par être négociée. |
