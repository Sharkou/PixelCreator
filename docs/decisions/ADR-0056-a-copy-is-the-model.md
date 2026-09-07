# ADR-0056 — Une copie est le modèle, et un pas de simulation décide quand

- **Statut :** **accepté** (2026-09-07)
- **Décide :** ce que `Spawn` instancie ; ce qu'un nœud a le droit de faire à la forme d'une
  Scene ; comment un nœud de flux rend une valeur ; ce qu'un `Runtime.step()` fait d'un
  Object créé ou détruit pendant qu'il tourne
- **Dépend de :** ADR-0003 (Property System), ADR-0011 (le serveur est l'autorité),
  ADR-0012 (isolation des erreurs), ADR-0015 (un graphe est le comportement d'un type),
  ADR-0018 (ordre structurel), ADR-0019 (opérations structurelles), ADR-0020 (Resources),
  ADR-0026 §7 (le prefab est reporté), ADR-0027 (modèle de graphe), ADR-0034 (les
  références dans le graphe), ADR-0035 (ordre de `Runtime.step()`), ADR-0040 §3 (une cible
  désignée), ADR-0045 §11 (ce qui n'est pas codé, et ce qui manque pour l'être)
- **Précise :** ADR-0034 invariant 3 — un handle peut vivre le temps d'**un flux** et non
  seulement d'un pas de flux, à condition d'être redemandé à la Scene à chaque lecture
- **Ferme :** le point ouvert d'ADR-0043 §8 et d'ADR-0045 §11.5 pour `Destroy` et `Spawn`
- **Ne décide pas :** le prefab (ADR-0026 §7 reste tel quel) ; `Random` et `Delay` ; le
  déterminisme des identités sous réplication — voir §7

---

## 1. Problème

Un créateur ne peut pas écrire de boucle de jeu. Un tir n'apparaît pas, un ennemi ne meurt
pas, une pièce ramassée reste là. `.px` sait lire, écrire, brancher, compter et déplacer ;
il ne sait pas **faire** ni **défaire** un Object.

Les deux nœuds manquants sont recensés depuis trois tranches, et chaque fois pour la même
raison — ADR-0045 §11.5 l'écrit noir sur blanc :

| Nœud | Ce qui manquait |
|---|---|
| `Destroy` | **une décision.** Retirer un objet pendant que le pipeline l'itère ; et est-ce une `Operation` d'auteur ou une sortie de simulation ? |
| `Spawn` | **un concept.** Il n'y a pas de prefab. Instancier quoi, à partir de quoi ? |

Et ADR-0043 §8 ajoute la contrainte qui les tenait tous les deux : « ADR-0034 invariant 5
doit être tranché d'abord ».

---

## 2. `Spawn` instancie un Object de la Scene, et c'est toute la décision

**Il n'y a pas de prefab, et il ne peut pas y en avoir dans un pas de simulation.** Une
`Resource` se résout par du stockage **asynchrone** que ni le Core ni le Runtime n'atteignent
— c'est l'argument exact d'ADR-0034 §3.2, écrit pour justifier qu'un Object voyage par
handle et une Resource par identité. Un nœud qui instancierait une `ResourceId` devrait donc
attendre au milieu d'un `step()`, ce qu'un pas fixe ne permet pas et qu'un serveur
autoritatif ne peut pas se permettre (ADR-0011).

**Un Object vivant, lui, décrit déjà une instance complètement** : ses Components, leurs
valeurs, ses enfants, leur ordre. Il est dans la Scene que le Runtime tient, et le résoudre
est un `Map.get`.

> **Le modèle d'un `Spawn` est un Object de la Scene, et ce qui est créé en est une copie.**

Le vocabulaire reste celui du créateur : *poser l'objet modèle dans la scène, le pointer
depuis le nœud, et le graphe en fabrique des copies*. C'est ce que faisait déjà un créateur
de Legacy avec un objet gardé hors champ, sauf que là c'était une convention et ici c'est le
modèle.

### 2.1 Ce que cela évite

| Refusé | Pourquoi |
|---|---|
| Un format de prefab minimal | Un format inventé avant la décision, qu'ADR-0026 §7 a explicitement reporté et qu'ADR-0026 §11 range parmi les « décisions qu'une implémentation hâtive prend à la place de l'architecte » |
| Instancier une `ResourceId` (`.px`, scène) | Résolution asynchrone, inatteignable depuis `step()` (ADR-0020, ADR-0034 §3.2) |
| Un « Object vide + Components » construit par nœuds | Trois nœuds et un ordre pour dire une phrase, et une seconde façon de décrire ce qu'est un Object |

### 2.2 La primitive est une existante, lue depuis les deux bouts

`core/duplicate.js` fait un **aller-retour par le format** : `serializeObject()` sait
exactement quels champs font un Object, `restoreSubtree()` sait exactement comment le
remettre — liens et rangs compris, puisque c'est ce qu'applique l'annulation d'une
suppression (`ADD_OBJECT`). Un parcours écrit à la main serait un **second avis** sur ce
qu'est un Object, et il divergerait au premier champ ajouté. Legacy avait ce second avis :
il s'appelait `copy()` et il vidait `components`, `childs` et `image`.

Les identités sont **tirées d'abord, pour tout le sous-arbre**, puis les listes `children`
sont réécrites à travers la même table : remapper au fil du parcours laisserait un parent
pointer vers une identité pas encore tirée.

**La copie atterrit à côté de son modèle, en dernier parmi ses frères.** À côté, parce que
`Transform` est une position dans l'espace du **parent** (ADR-0002) : une copie envoyée à la
racine garderait ses nombres et changerait ce qu'ils veulent dire. En dernier, parce que
c'est le seul rang qui soit fonction de l'état.

### 2.3 `Destroy` retire ce que `Scene.remove()` retire

Aucune sémantique nouvelle : `Scene.remove()` supprime en profondeur d'abord, détache du
parent, retire des roots. Un enfant n'est jamais laissé dans la scène à pointer vers un
parent parti. Une cible absente rend `false`, et `false` n'est pas une erreur.

---

## 3. Invariant 5 est tenu : aucun nœud ne produit d'Operation

ADR-0034 invariant 5 dit *« un nœud ne produit aucune Operation et ne frappe aucune
identité »*. Les deux moitiés tiennent, et pour deux raisons différentes :

**Aucune Operation.** `duplicateObject()` et `Scene.remove()` écrivent par les primitives de
la Scene, exactement comme le fait un `parent.addChild(child)` appelé depuis un script. Ce
sont les primitives que les gestionnaires d'Operations appellent eux-mêmes, et
`scene.js` dit déjà pourquoi : « Applying a replicated operation therefore submits nothing
back — the echo is unrepresentable rather than merely prevented » (ADR-0019). Un spawn est
une **sortie de simulation**, pas une intention d'auteur — la lecture qu'ADR-0003 donne déjà
à l'écriture de propriété depuis un graphe.

**Aucune identité frappée.** Le nœud reçoit un **handle**, par un fil ou par une prise
`objectref` que ce `.px` déclare. Rien d'une scène n'entre dans le payload, et l'invariant 1
n'est pas touché : ce que le `.px` stocke est l'`id` d'une **propriété qu'il déclare
lui-même**.

### 3.1 Un mot sépare `Spawn` de tous les autres : `unset`

Tous les nœuds à cible du catalogue déclarent `unset: 'Self'` — le picker imprime `Self`,
et une case vide est un créateur qui dit *cet* Object (ADR-0040 §3). **`Spawn` n'en déclare
aucun**, exactement comme `Get Object` (ADR-0043 §7) : un nœud de copie sans modèle doit
copier **rien**. Un repli sur `Self` doublerait son propre Object à chaque pas, chez un
créateur qui n'avait simplement pas encore choisi.

Ce mot est lu à trois endroits et écrit à un seul :

| Lecteur | Ce qu'il en fait |
|---|---|
| `inspector/node.js` | affiche la ligne `Self` seulement là où elle existe |
| `graph/standard.js` | `targetObject(io, fallback)` — le repli est un paramètre, pas une seconde copie de la règle |
| `graph/validate.js` | une prise vide **est** un manque là où rien ne répond pour elle |

---

## 4. Un nœud de flux peut rendre une valeur

`Spawn` est le premier nœud livré qui **agit** et **produit**. Jusqu'ici la séparation était
nette : `evaluate` pour ce qui est tiré, `execute` pour ce qui est poussé.

**Le tirer serait le trap.** Une sortie de données est *pull* : l'interprète appelle
`evaluate` chaque fois que quelqu'un en aval lit le port. Un `Spawn` lu deux fois créerait
deux Objects et donnerait le second au second lecteur ; un `Spawn` lu jamais ne créerait
rien.

> **Un nœud de flux peut répondre `{ next, values }`. Les valeurs sont poussées une fois, au
> moment où le nœud tourne, et lues ensuite.**

`continuationsOf()` gagne une quatrième forme et `execute` reste ce qu'il était pour tous les
autres. L'interprète ne ré-exécute jamais un nœud pour répondre à une lecture : un nœud sans
`evaluate` répond depuis ce qu'il a produit, ou `null`.

### 4.1 Ce que cela précise d'ADR-0034 invariant 3

L'invariant dit : *« un handle n'est jamais persisté, ni sérialisé, ni mémoïsé au-delà d'un
pas de flux »*. Le cache de valeurs de l'interprète est **par pas de flux** — c'est
délibéré : mémoïser plus loin laisserait un `Get Property` servir la valeur d'avant un
`Set Property`.

Mais `Spawn` crée l'Object et le nœud trois cartes plus loin le positionne : le handle doit
survivre d'un pas de flux au suivant, ou la sortie ne sert à rien.

> **La mémoire des valeurs produites est portée par le FLUX, et toute lecture d'un port
> `object` est redemandée à la Scene.**

Ce que l'invariant protège est tenu à la lettre : un handle n'est jamais rendu si la Scene ne
répond plus pour lui. Un `Spawn` détruit trois nœuds plus loin se lit `null`, comme une
`objectref` morte (`portValueOf`, ADR-0034 §3.4) — donc rien ne peut sortir d'une mémoire qui
survivrait à ce qu'elle mémorise. La mémoire meurt avec le flux, ne touche aucun Component,
aucun payload, aucune image.

### 4.2 `Spawn` n'a pas de port de position, et c'est un refus argumenté

La forme « X et Y sur le nœud » a été écrite puis retirée, pour deux raisons :

1. **Elle serait `Set Position` une seconde fois.** ADR-0045 §11.2 tranche : la forme absolue
   est `Set Position`, elle existe, elle se lit correctement. Spawner puis positionner dans
   le même pas est indistinguable de spawner à une position — rien n'est dessiné entre les
   deux.
2. **Le défaut d'un port est une VALEUR.** `data('x', NUMBER, 'X', 0)` : un `Spawn` posé et
   laissé tel quel lirait `X 0  Y 0` et téléporterait chaque copie à l'origine au lieu de la
   laisser où son modèle se tient. Éviter ça demanderait un port nombre *optionnel*, une
   notion que le modèle de port n'a pas et qu'un nœud n'a pas à inventer.

La sortie `Spawned` dit la même phrase avec des nœuds qui existent déjà et qui se lisent.

---

## 5. Ce qu'un pas de simulation fait d'un changement de forme

L'ordre d'un `step()` est matérialisé **avant** la boucle — il le faut, sinon retirer un
objet décalerait la marche sous elle-même. Les deux directions sont donc décidées plutôt que
laissées au hasard :

| Pendant un `step()` | Décision | Pourquoi |
|---|---|---|
| Un Object est **créé** | il ne tourne pas ce pas-ci ; il tourne au suivant, `On Start` compris | il n'est pas dans l'ordre matérialisé ; et c'est ce qui empêche un graphe qui spawne à chaque update de spawner sans fin dans une image |
| Un Object est **détruit** | il est **sauté**, y compris ses Components restants | il est encore dans la liste ; le simuler serait simuler un Object que la Scene ne tient plus |

La question est posée **avant chaque Component** et non seulement en tête d'objet, parce que
les deux cas sont la même question : *cet Object est-il encore dans la scène ?* Un Component
qui détruit son propre Object est donc la dernière chose qui tourne dessus.

### 5.1 `Is Valid` demande à la Scene

« Y a-t-il un handle ici » et « cet Object est-il encore dans la scène » étaient la **même
question** tant que seul l'Editor pouvait retirer un objet, entre deux images. `Destroy` les
sépare : le flux qui détruit tient encore le handle. `object.isValid` demande donc à la Scene
— et sans Scene en main, un handle se lit encore valide, ce qui est la réponse honnête plutôt
qu'une supposition d'absence.

---

## 6. Ce qui est copié, et ce qui ne l'est pas

Tout : chaque Component, chaque valeur, `objectref` comprises. Une copie de balle qui
pointait vers le joueur pointe toujours vers le joueur, ce qui est la lecture attendue.

**Une référence qui pointait à l'intérieur du sous-arbre copié pointe toujours vers
l'original.** La remapper demanderait le schéma de chaque Component pour savoir quelles
valeurs sont des identités — une décision qui vaut la sienne propre, et que ce fichier ne
prend pas tout seul. Consigné plutôt que fait à moitié.

---

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Une copie est un Object neuf, sous-arbre compris | `core/duplicate.test.js` |
| Une copie porte les valeurs de son modèle et ne partage aucun état | idem |
| Une copie atterrit chez le parent de son modèle, en dernier | idem |
| Une copie est atteignable depuis les roots (invariant 7) | idem |
| Copier ne produit aucune Operation | idem |
| `Spawn` sans modèle ne copie rien, et surtout pas `Self` | `runtime/spawn-destroy.test.js` |
| L'Object produit sort du nœud et le nœud suivant agit dessus | idem |
| Deux lecteurs d'un `Spawn` obtiennent une copie, pas deux | idem |
| Lire un `Spawn` qui n'a pas encore tourné rend `null` | idem |
| Un Object détruit ne tourne plus dans le pas qui l'a détruit | idem |
| Un Object créé ne tourne pas dans le pas qui l'a créé | idem |
| Rien n'est réécrit dans le payload du graphe | idem |
| Une prise `Model` vide est un avertissement, une prise `Object` de `Destroy` non | `core/graph/validate.test.js` |
| `Spawn`/`Destroy` sont sur l'étagère `Object`, sans teinte ni glyphe nouveaux | `core/graph/nodes.test.js` |

---

## 8. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Le prefab** | ADR-0026 §7 reste tel quel. Cet ADR ne le préjuge pas : le jour où un prefab existe, il sera un second **modèle** possible, pas un second mécanisme de création |
| **Le déterminisme des identités sous réplication** | Deux clients qui spawnent chacun de leur côté tirent deux `ObjectId` différents. L'état est identique à l'identité près, et ADR-0011 fait du serveur l'autorité — mais où vit la graine d'une identité reste ouvert, sur la même étagère que `Random` (ADR-0045 §11.5) |
| **Les `objectref` internes à un sous-arbre copié** | §6 |
| `Random`, `Delay` | Inchangés (ADR-0045 §11.5) |
| **Une limite de population** | Un graphe qui spawne à chaque update remplit la scène ; le budget de l'interprète borne un ÉVÉNEMENT, pas une partie. C'est une question de produit, pas d'exécution |
