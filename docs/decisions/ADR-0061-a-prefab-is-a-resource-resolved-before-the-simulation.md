# ADR-0061 — Un prefab est une Resource, résolue **avant** la simulation

- **Statut :** **accepté** (2026-09-11)
- **Décide :** ce qu'un prefab **est** ; Resource ou Scene spéciale ; son format ; comment le
  Runtime le résout synchroniquement ; qui le charge et quand ; les identités ; les
  `objectref` internes ; les `objectref` externes ; l'instanciation ; la différence avec la
  duplication d'un Object vivant ; l'absence volontaire de lien vivant prefab ↔ instance ; la
  compatibilité avec `Spawn`
- **Dépend de :** ADR-0010 (l'identité n'est jamais un nom), ADR-0011 (le serveur fait
  autorité), ADR-0012 (isolation), ADR-0018 (l'ordre structurel est une donnée), ADR-0019
  (Operations structurelles), ADR-0020 (Resource, `ResourceStore` **asynchrone**), ADR-0021
  (identité d'une définition), ADR-0023 (le type dit ce qu'une valeur veut dire), ADR-0024
  (undo/redo), ADR-0026 §6 (table de drag & drop) **et §7** (le prefab était reporté),
  ADR-0031 §3 (listes), ADR-0034 §3.2/§3.4/§3.5 et invariant 5 (portée d'une référence, deux
  familles d'échec, un nœud ne produit pas d'Operation), ADR-0056 (une copie est le modèle),
  ADR-0057 §3 (les identités viennent de la simulation), ADR-0042 (le bundle est la frontière)
- **Amende :** ADR-0026 §7 (« un prefab n'est pas un format, c'est une décision — **reporté** »)
- **Ne décide pas :** les overrides, le revert, l'« apply to prefab », l'imbrication de
  prefabs, un prefab dessiné dans le Project — voir §12

---

## 1. Problème

`Spawn` instancie un Object **déjà vivant dans la Scene** (ADR-0056). C'est la bonne décision
et elle a un coût que chaque projet finit par payer :

> Pour tirer une balle, il faut garder **une balle cachée** dans chaque scène.

Ce modèle caché est un Object comme les autres : il apparaît dans la Hierarchy, il est simulé
à chaque pas, il collisionne, il est dessiné si on oublie de l'éteindre, il est sauvegardé dans
la scène, et il faut le recréer à l'identique dans chaque scène qui en a besoin. Un créateur
qui veut « un ennemi » obtient « un ennemi, plus un ennemi mort-vivant garé hors champ ».

Ce qui manquait est un **modèle réutilisable qui n'appartient à aucune scène**.

ADR-0026 §7 avait refusé de l'inventer, et pour une bonne raison : ce qu'un prefab contient,
comment une instance y reste liée, ce qu'un override veut dire. Cet ADR répond aux trois — la
troisième par la négative, explicitement (§9).

---

## 2. Ce qu'un prefab **est**

> **Un prefab est une `Resource` dont le payload est un sous-arbre sérialisé.**

`kind: 'prefab'`, extension `.prefab`, un `ResourceId` opaque, un payload lu par identité. Rien
de plus. C'est une ligne de plus dans l'énumération d'ADR-0020, et le reste du système de
Resources — renommer, ranger, déplacer, supprimer, répliquer, annuler, empaqueter — fonctionne
sans une ligne de code de plus.

### Resource, et pas une Scene spéciale

Une Scene et un prefab **partagent une forme de payload** — les deux sont des Objects
sérialisés — et ne partagent rien d'autre :

| | Scene | Prefab |
|---|---|---|
| Ce que c'est | un endroit où l'on joue | une description qui sert à fabriquer un morceau |
| Racines | plusieurs, ordonnées | **une** |
| S'ouvre | dans un onglet, se joue | jamais : s'instancie |
| Caméra, nom affiché au joueur | oui | non |

Un drapeau sur `kind: 'scene'` obligerait chaque lecteur à demander *lequel des deux* il tient,
et le premier qui l'oublie ouvre un prefab comme un niveau. Deux kinds, deux icônes, deux
phrases dans la table de drop : la distinction est visible partout, gratuitement.

### Ni une classe, ni un troisième Object

Il n'existe **pas** de troisième représentation d'un Object. Il y a l'Object vivant, et il y a
les enregistrements que `serializeObject()` écrit déjà. Un prefab est un tableau des seconds —
ce qui est exactement ce que `restoreSubtree()` sait remettre en place, ce qu'une suppression
annulée rejoue, et ce qu'une duplication produit en chemin.

---

## 3. Le format

```js
{
    version: 1,
    root: '<ObjectId de la racine, au moment où le modèle a été écrit>',
    objects: [ /* serializeObject() de la racine, puis des descendants, en ordre canonique */ ]
}
```

- **`objects` est la sortie de `serializeObject()`, verbatim** : `id`, `name`, `tag`, `layer`,
  `active`, `lock`, `owner`, `parent`, `children`, `components`. Rien n'est ajouté, rien n'est
  renommé. Un champ ajouté à un Object arrive dans les prefabs le même jour, sans migration.
- **`parent` de la racine est `null`** : un prefab n'a pas de scène où avoir un parent, et
  garder le parent d'origine nommerait un Object absent du payload — précisément ce que §6
  refuse. Tous les autres gardent leur lien, qui pointe à l'intérieur du sous-arbre par
  construction.
- **`root` est nommé, pas supposé premier.** Il l'est dans tout ce que ce dépôt écrit ; le
  nommer est ce qui fait survivre un payload à un éditeur, une fusion ou une édition à la main
  qui aurait réordonné la liste, pour le prix d'un `find`.
- **`version` est refusée si elle est inconnue.** Comme un graphe (ADR-0027) et comme un bundle
  (ADR-0042) : rien en dessous ne peut être cru dans une forme jamais lue. La réponse est
  `null`, pas une exception — un prefab qu'on ne peut pas instancier est un **état du jeu**, et
  le flux après un `Spawn Prefab` continue de toute façon (ADR-0034 §3.4).

---

## 4. La contrainte centrale : **résoudre avant, jamais pendant**

C'est la raison pour laquelle le prefab n'existait pas, et elle reste entièrement valide :

> Une Resource se lit à travers un store **asynchrone** (ADR-0020 §4).
> Un `Runtime.step()` **ne peut pas attendre**.

L'interprète n'est pas devenu `async` et ne le deviendra pas : un pas de simulation qui peut
suspendre n'est plus un pas, la boucle de jeu ne peut plus le compter, et le serveur et le
client cessent d'exécuter la même chose (ADR-0011). Rien dans `core/prefab.js` ne touche au
stockage et rien n'y est asynchrone.

**La résolution a simplement changé de moment.**

```
Bullet.prefab                      une Resource : un sous-arbre sérialisé
     │
     ▼   (asynchrone, AVANT la partie — project/prefabs.js)
project.read(id)
     │
     ▼
PrefabRegistry.set(id, payload)    une Map en mémoire
     │
     ▼
new Runtime(scene, { prefabs })    le Runtime reçoit une VALEUR, jamais un identifiant
     │
     ▼   (synchrone, PENDANT le pas)
ctx.prefabs.get(id)  ->  instantiatePrefab(scene, definition)
```

C'est exactement la forme que `loadComponentDefinitions()` a déjà pour un `.px` (ADR-0016,
ADR-0020 §5) : la couche Project lit, le Core transforme, le Runtime reçoit un objet résolu.
`behaviors.bind(type, graph)` prend un graphe **résolu** pour cette raison précise ; ici
`prefabs` est un **registre résolu**, pour la même.

**Le Runtime ne demande jamais autre chose que `get(id)`.** Il n'a pas de `load`, pas de
`fetch`, pas de promesse et pas de store. `runtime -> project` reste interdit et vérifié
(`tools/layers/rules.js`).

**`PrefabRegistry` vit dans le Core**, parce que le nœud qui le lit est du Core et parce qu'il
ne contient que des données. Ce n'est **pas un cache** : un cache décide quand se remplir, et
celui-ci est rempli par qui possède le projet, jamais par lui-même — il n'y a donc aucune
politique à s'y tromper.

### Qui le remplit, et quand

| Application | Quand | Où |
|---|---|---|
| **Preview / jeu publié** | à l'ouverture du bundle, avant la première image | `preview/client.js` → `loadPrefabs()` |
| **Editor, bouton Play** | à l'appui, avant `transport.play()` | `editor/project/session.js` → `refresh()` |
| **Serveur headless** | au chargement du projet | `loadPrefabs()`, le même appel |

`Transport.prepare()` est séparé de `Transport.play()` exprès : `play()` est la machine à
états, elle est synchrone, et chacun de ses tests l'est (ADR-0029). Lire un projet est
asynchrone. Le bouton attend la première avant d'appeler la seconde ; un appelant qui saute
`prepare()` obtient une partie sans prefabs résolus, c'est-à-dire exactement ce qu'il avait
avant.

La session de l'Editor relit **par `revision`** (ADR-0020 §7) : ce qui n'a pas bougé n'est pas
relu, ce qui a été supprimé est oublié — sinon un jeu continuerait de spawner un prefab que le
Project panel ne montre plus.

---

## 5. Instanciation : une seule machinerie, deux descriptions

`duplicateObject()` et `instantiatePrefab()` diffèrent par **l'endroit d'où vient la
description** et par rien d'autre. Les deux :

1. tirent une identité neuve pour **tout le sous-arbre d'un coup**, avant de reconstruire quoi
   que ce soit ;
2. réécrivent `parent`, `children` et chaque `objectref` **interne** à travers cette table ;
3. passent le résultat à `restoreSubtree()`.

Cette machinerie est donc écrite **une fois**, dans `core/instantiate.js`, et les deux
fonctions en sont des appelants. L'écrire deux fois est précisément comment les deux finiraient
par ne plus être d'accord sur ce qu'est un `objectref`, le jour où un troisième appelant
arrive.

La table entière est tirée **avant** qu'un seul champ soit réécrit : un parent qui nomme un
enfant, un enfant qui nomme son parent, deux frères qui se nomment et un cycle entre deux
Components sont tous la même recherche dans une table déjà complète. Aucune passe ne peut
atteindre une référence avant que sa cible ait une identité, parce qu'aucune identité n'est
tirée pendant la passe.

**Qui bat les identités reste l'affaire de l'appelant** (ADR-0057 §3) : l'Editor tire du CSPRNG
de la plateforme comme pour tout acte d'auteur, le Runtime passe sa propre source semée parce
qu'un spawn est une **conséquence d'un pas** et qu'un serveur et un client doivent tomber
d'accord sur ce qui a été créé.

### `freshRecords()` : deux fins, un remappage

Le remappage est séparé de l'écriture, parce que les deux appelants ne veulent pas la même fin :

| Appelant | Fin | Pourquoi |
|---|---|---|
| Runtime (`Spawn`, `Spawn Prefab`) | écrit **directement** dans la Scene | un spawn est une **sortie de simulation** et ne produit aucune Operation (ADR-0034 invariant 5) |
| Editor (poser un prefab) | soumet un **`ADD_OBJECT`** portant les mêmes enregistrements | poser est une **intention d'auteur** : réplicable et annulable (ADR-0019, ADR-0024) |

`ADD_OBJECT` porte déjà un sous-arbre entier — c'est ce qui fait qu'annuler une suppression
remet les enfants — donc poser un prefab n'a besoin d'aucun type d'opération nouveau, et
`Ctrl Z` reprend toute l'instance en une entrée.

---

## 6. Les références : la règle est la même, posée des deux côtés

`duplicateObject()` (ADR-0056 §6) : *une identité est réécrite exactement quand elle est dans
la table que cette duplication a tirée.* Dupliquer une tourelle dont le canon nomme sa propre
base donne un canon qui nomme la base **de la copie** ; dupliquer une balle qui nomme le joueur
laisse le joueur, parce que le joueur n'a pas été copié.

Un prefab pose la même question depuis l'autre bout, parce qu'il **quitte la scène** :

> **Une référence est conservée exactement quand le modèle contient sa cible.**

| Cas | Au moment de créer le prefab | À l'instanciation |
|---|---|---|
| pointe **à l'intérieur** du sous-arbre | conservée telle quelle | réécrite vers l'instance |
| pointe **à l'extérieur** | **vidée** (`null`), et signalée | rien à réécrire |
| liste `array<objectref>` | garde ce qui pointe dedans, jette le reste | réécrite élément par élément |
| `null`, absente, ou morte | inchangée | inchangée |

### Pourquoi vidée, plutôt que refusée ou conservée

Trois réponses honnêtes existaient :

| Réponse | Pourquoi non / pourquoi oui |
|---|---|
| **Refuser le prefab** | Rend inauthorable un arrangement banal — une tourelle qui vise le joueur. Un créateur ne peut pas « réparer » un modèle qui refuse d'exister |
| **Conserver l'`ObjectId`** | Écrit une **dépendance vers une scène** dans une Resource de portée projet. Dans toute autre scène, l'identité ne résout rien — ou, bien pire, résout un **autre** Object. C'est exactement ce qu'ADR-0034 §3.5 interdit d'écrire dans un `.px`, une portée plus bas |
| **Vider, et le dire** | ✔ La valeur devient `null`, qui est déjà ce que « ne pointe sur rien » veut dire dans le format (ADR-0023). Ce qui a été vidé est **retourné à l'appelant**, donc l'Editor le dit — un créateur qui perd un câblage en silence perd un après-midi |

Le contrat est donc explicite dans les deux sens : rien de fantôme, et rien de perdu sans
phrase. `externalReferencesOf()` pose la même question **sans écrire**, pour qu'un panneau
puisse prévenir avant d'agir.

**Et la règle est demandée au schéma, jamais à la valeur.** Ce qui est examiné est une
propriété dont le type **déclaré** est `objectref`, ou une liste dont l'élément déclaré l'est.
Une chaîne qui *ressemble* à un identifiant est une chaîne ; scanner les valeurs réécrirait le
nom d'un joueur le jour où quelqu'un appellerait son niveau `abcdefghjkmnpq`.

Un type que le registre ne résout pas ne déclare rien, et ses valeurs voyagent **verbatim** —
la même réponse que `MissingComponent` donne partout ailleurs (ADR-0021).

---

## 7. Ce qui distingue un prefab d'une duplication

| | `Spawn` (duplication) | `Spawn Prefab` |
|---|---|---|
| Le modèle est | un Object **vivant de cette scène** | une **Resource** du projet |
| Il doit exister | dans la scène, tout le temps | nulle part dans la scène |
| Utilisable par | cette scène | toutes les scènes, et autant de fois qu'on veut |
| Références externes | **conservées** (même scène) | **vidées** à la création (§6) |
| La copie atterrit | à côté de son modèle, dernier de ses frères | à la racine, ou là où l'appelant dit |
| Résolution | immédiate, c'est une poignée | table résolue avant la simulation |

Les deux produisent des Objects ordinaires, avec des identités neuves et les mêmes règles de
remappage.

---

## 8. Instancier depuis l'Editor

| Geste | Effet |
|---|---|
| Glisser une ligne de la **Hierarchy** vers **Project** | crée `NomDeLObjet.prefab` dans le dossier visé |
| Clic droit sur une ligne → **Save as Prefab** | le même, au niveau supérieur du projet |
| Glisser un `.prefab` de **Project** vers la **Scene** | pose une instance au point lâché |
| Glisser un `.prefab` vers la **Hierarchy** | pose une instance à l'origine — une liste n'est pas un lieu |

Les quatre passent par **la même règle** de `dnd/rules.js` : la table d'ADR-0026 §6 gagne deux
lignes, aucune seconde infrastructure de drag & drop n'existe, et l'entrée de menu appelle
`performDrop()` plutôt que de réimplémenter le geste.

Le nom initial est celui de l'Object, avec l'extension que son kind décide et le compteur
d'unicité que toute Resource reçoit (ADR-0026 §4). **Pas de popup** : un créateur qui veut un
autre nom renomme la tuile, ce qui est le geste qu'il connaît déjà.

Le prefab est ensuite une Resource ordinaire : grande icône propre (ni la vignette d'image, ni
le cube de Component — un `.px` est une **capacité qu'un Object a**, un prefab est une
**description d'Objects**), renommable, supprimable, déplaçable dans des dossiers, empaquetée
dans le bundle.

---

## 9. **Aucun lien vivant prefab ↔ instance** — et c'est une décision, pas un manque

> **Un prefab est un modèle de création, pas un système d'héritage.**

Instancier produit des **Objects ordinaires**. Après cela :

- l'instance ne garde **aucune mémoire** d'où elle vient ;
- rien dans une scène sauvegardée ne nomme le prefab ;
- modifier le prefab ne touche **aucune** instance existante ;
- il n'y a ni override, ni revert, ni « apply to prefab », ni instance « cassée » quand la
  Resource est supprimée.

C'est délibéré et ce n'est pas un raccourci. Le système d'overrides d'Unity est un bon produit
et un **grand** produit ; ce qu'il exige d'abord est une décision sur ce qu'un override **est** :
quelles propriétés peuvent diverger, ce qu'un enfant ajouté à une instance devient quand le
modèle en ajoute un aussi, ce que veut dire réordonner des Components des deux côtés, comment
tout cela se réplique et s'annule. Prendre cette décision **en passant**, pour livrer un
prefab, serait exactement ce qu'ADR-0026 §11 range parmi « les décisions qu'une implémentation
hâtive prend à la place de l'architecte ».

La conséquence positive, et elle est grande : **une scène sauvegardée ne dépend d'aucune
Resource**. Supprimer `Bullet.prefab` ne casse aucune scène ; il n'y a plus rien à spawner, et
c'est tout.

Le chemin de retour est ouvert. Le jour où un override est conçu, ce qu'il faut ajouter est un
champ sur l'instance (« je viens de tel prefab ») et un delta ; le **format du prefab** ne
bouge pas, parce qu'il est déjà le format d'un Object.

---

## 10. `Spawn` reste `Spawn` — deux nœuds, pas une prise polymorphe

```
Spawn          Model   : un Object vivant (poignée, port `object`)
Spawn Prefab   Prefab  : une Resource     (identité, port `resource`)
```

**Pourquoi deux.** Un Object vivant voyage sur un fil comme une **poignée** (ADR-0034 §3.2) ;
un prefab est un `ResourceId`, c'est-à-dire une **chaîne**. Un unique port `Model` devrait être
typé `any`, et le nœud devrait alors **deviner**, à l'exécution, si la chaîne qu'on lui donne
nomme un Object de cette scène ou une Resource de ce projet. C'est la seule chose que ce dépôt
refuse absolument de faire faire à un Runtime.

**Et cela ne coûte aucune migration.** `Spawn` est intouché : tout graphe écrit avant cette
tranche veut dire exactement ce qu'il voulait dire, et un créateur qui ne fait jamais de prefab
ne rencontre jamais le second nœud. Une prise union, ou un `Spawn` qui change de forme, aurait
acheté une ligne de menu au prix d'une migration de tous les `.px` existants.

**Ni X ni Y sur le nouveau nœud non plus.** `Set Position` dit déjà « mets cet Object ici »
(ADR-0045 §11.2), et la sortie `Spawned` le donne immédiatement au nœud suivant. Un port
aurait une **valeur** par défaut, donc un `Spawn Prefab` non touché lirait `X 0  Y 0` et
téléporterait chaque instance à l'origine.

---

## 11. Les refus que cet ADR lève, et ceux qu'il garde

| Geste | Avant | Maintenant |
|---|---|---|
| Object → Project | *« Prefabs are not designed yet »* (ADR-0026 §7) | crée un prefab |
| Prefab → Scene / Hierarchy | rien — aucune règle | pose une instance |
| Prefab → liste de Components | rien | **refusé** : un prefab n'est pas une capacité qu'un Object a |
| Prefab → propriété `resource` | selon la clause | accepté si la propriété déclare `kind: 'prefab'` — la clause générique d'ADR-0007, sans code nouveau |

---

## 12. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Les overrides, le revert, « apply to prefab »** | §9. Chacun demande d'abord une décision sur ce qu'un override *est* |
| **Un prefab dans un prefab** | Rien ne l'interdit dans le format — un sous-arbre est un sous-arbre — mais « une instance imbriquée » n'a de sens qu'avec un lien vivant, qui n'existe pas |
| **Éditer un prefab dans un onglet** | Un prefab s'édite aujourd'hui en posant une instance, en la modifiant et en la resauvant (`savePrefab`). Un éditeur dédié demande une scène de travail, une caméra et un cycle d'ouverture : c'est la fenêtre que `Workspace` saura ouvrir, pas un format |
| **La variante / le preset** | Un prefab qui hérite d'un prefab est le même problème que l'override |
| **L'import inter-projets** | ADR-0020 §1 le laisse ouvert pour toute Resource ; un prefab ne change rien à la question |
| **Un gizmo ou un aperçu rendu dans le Project** | Demande de rendre une scène hors écran ; la grande icône de kind suffit et est honnête |

---

## 13. Contre-épreuves

| Ce qui est vérifié | Où |
|---|---|
| Un prefab est la sortie de `serializeObject()`, champ pour champ | `core/prefab.test.js` |
| Components, valeurs, enfants, ordre, Transform local, tag, layer | idem |
| `parent` de la racine est `null` ; un lien interne est intact | idem |
| Une version inconnue, un payload vide, une racine absente : refusés | idem |
| La racine est **nommée**, pas supposée première | idem |
| Référence interne conservée ; externe vidée **et signalée** | idem |
| Une liste garde le dedans, jette le dehors | idem |
| Un type non résolu garde ses valeurs verbatim | idem |
| Une instance ne porte **aucune** identité du modèle | idem |
| Deux instances ne partagent **aucune** identité | idem |
| L'`objectref` interne est remappé **par instance** | idem |
| Modifier le modèle après coup ne touche pas l'instance | idem |
| Prefab et duplication donnent le même résultat, à l'endroit d'atterrissage près | idem |
| `.prefab`, renommage, dossiers, suppression : rien de spécifique | `project/prefabs.test.js` |
| `loadPrefabs()` remplit un registre qui répond **sans attendre** | idem |
| Un payload illisible est signalé et sauté | idem |
| Une scène qui n'a **jamais** contenu le modèle spawne quand même | `runtime/prefab-spawn.test.js` |
| `Spawned` alimente `Set Position` immédiatement (aucun `Spawn X/Y` nécessaire) | idem |
| Trois spawns, trois instances indépendantes | idem |
| Prefab non résolu, Runtime sans registre : rien, et aucune erreur | idem |
| Même seed → mêmes identités ; seed différente → différentes | idem |
| Bundle → `openBundle` → `loadPrefabs` → registre synchrone | idem |
| Une scène pleine d'instances se sauve et se recharge **sans** le prefab | idem |
| Le payload d'une scène ne contient ni `ResourceId` ni identité de modèle | idem |
| `Spawn` copie toujours un Object vivant — aucun graphe existant ne change | idem |
| Les deux nœuds ont deux types de port : rien n'est `any` | idem |
| Hierarchy → Project crée le prefab ; Project → Scene pose l'instance | `editor/dnd/dnd.test.js` |
| Poser = **une** entrée d'historique, et l'undo reprend tout le sous-arbre | idem |
| Deux poses = deux noms qu'un créateur distingue | idem |
| La règle prefab passe avant les règles génériques, et dit ce qu'elle fera | idem |
| Un prefab sans payload ne pose rien et ne lève pas | idem |
| Relire par `revision`, oublier une Resource supprimée | `editor/project/session.test.js` |

---

## 14. Conséquences

### Positives

- **Plus aucun modèle caché.** Une scène contient ce qu'un joueur voit, et rien d'autre.
- Un même prefab sert plusieurs scènes, plusieurs fois par scène, après sauvegarde et
  rechargement, dans le Preview comme dans l'Editor.
- La contrainte asynchrone d'ADR-0020 est **respectée sans être contournée** : l'interprète
  reste synchrone, le Core ne voit toujours pas le stockage, `runtime -> project` reste interdit.
- Le remappage d'identités existe en un seul exemplaire, partagé avec la duplication.
- Une scène sauvegardée ne dépend d'aucune Resource : supprimer un prefab ne casse rien (§9).
- ADR-0026 §7 est fermé, et la table de drop gagne deux lignes plutôt qu'un système.

### Négatives

- `ResourceKind` gagne une valeur : tout code qui énumère les kinds a une ligne de plus (un
  test le vérifiait et a été mis à jour).
- Un prefab **perd** silencieusement ses références externes s'il en avait — atténué, pas
  supprimé, par le rapport que `createPrefab()` renvoie et que l'Editor affiche.
- Le bouton Play devient asynchrone (`prepare()` avant `play()`). La machine à états, elle,
  reste synchrone.
- Deux nœuds `Spawn` dans le menu : un créateur doit choisir. C'est le prix de ne jamais faire
  deviner un Runtime, et §10 dit pourquoi il est le bon.
- Pas de lien vivant : modifier un prefab après avoir posé dix instances demande de reposer les
  dix. C'est le choix de §9, pas un oubli.
