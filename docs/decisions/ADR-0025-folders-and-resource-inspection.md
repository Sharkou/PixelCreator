# ADR-0025 — Un dossier est une `Resource`, la hiérarchie est un lien `parent`, et l'Inspector inspecte les ressources

- **Statut :** **accepté** (2026-08-17)
- **Dépend de :** ADR-0010 (identité opaque), ADR-0017 (l'état d'IDE n'entre pas dans le modèle), ADR-0019 (Operations structurelles), ADR-0020 (`Resource`, `ResourceStore`, couche `project/`), ADR-0024 (Undo/Redo)
- **Amende :** ADR-0020 § « Une seule unité : `Resource` » — `path` est remplacé par `parent`

## Contexte observé

Le panneau Project listait le manifeste à plat et rien d'autre. Six défauts, tous du même
genre — le panneau savait des choses que le modèle ignorait, ou l'inverse :

| Constat | Cause |
|---|---|
| Aucun moyen de créer une ressource | La création n'existait que dans `editor.js`, pour la scène de démarrage |
| Aucun moyen d'organiser | `path` était une chaîne indicative, jamais lue par personne |
| `Untitled Scene` portait l'icône de la fenêtre `Hierarchy` | Une seule table d'icônes, indexée par un mot qui désignait deux choses |
| Le renommage s'arrêtait à la première lettre | Une opération par frappe ; chaque opération reconstruisait la liste, qui emportait le champ en cours d'édition |
| Impossible de désélectionner | La sélection vivait dans le panneau, sans rien pour la remettre à zéro |
| Une ressource sélectionnée n'affichait rien | L'Inspector ne connaissait qu'un `Object` |

## Décision

### 1. Un dossier est une `Resource` de `kind: 'folder'`

**VALIDÉ.** Pas un concept à côté de `Resource` : une identité opaque, un nom, une place
dans le manifeste, comme tout le reste. Ce qu'un dossier n'a pas, c'est un payload.

En conséquence, et sans une ligne de code dédiée : renommer un dossier est le
`SET_PROPERTY` qui renomme une scène ; le supprimer est le `REMOVE_RESOURCE` qui supprime
un graphe ; les deux sont répliqués, arbitrés et annulables (ADR-0019, ADR-0024).

> Un second concept — un `Folder` pair de `Resource` — aurait produit deux schémas
> d'identité, deux jeux d'Operations, deux piles d'undo et deux chemins de sérialisation,
> pour représenter « une chose qui porte un nom et contient d'autres choses ». C'est
> exactement l'argument qu'ADR-0020 oppose déjà à `Asset` et à `Document`.

### 2. `parent` remplace `path`

**VALIDÉ, et c'est un amendement d'ADR-0020.** `path` était une chaîne : la hiérarchie
était donc une convention de nommage.

| Avec `path` | Avec `parent` |
|---|---|
| Renommer un dossier = réécrire chaque entrée qui le mentionne | Rien à réécrire : le nom est ailleurs |
| Deux entrées peuvent être en désaccord sur `assets/` | Il n'existe qu'un `assets`, désigné par son id |
| Rien ne dit si `assets/` existe | Un parent nomme une ressource qui existe, ou l'opération est refusée |
| Déplacer = réécrire une chaîne | Déplacer = `SET_PROPERTY parent`, inversible |

C'est la même idée qu'`Object.parent` dans le Core : **la structure est un lien, jamais un
chemin**. Le chemin affiché (`Assets/Images`) est **dérivé** (`folderPath()`), donc
toujours juste.

`MANIFEST_VERSION` passe à **2**. Aucune migration n'est écrite : il n'existe aucun projet
au format 1 (ARCHITECTURE.md §10).

### 3. Aucune Operation nouvelle

Déplacer est `SET_PROPERTY parent`. Créer est `ADD_RESOURCE`. Supprimer est
`REMOVE_RESOURCE`. **La liste d'ADR-0019 ne bouge pas** — c'est le test honnête de savoir
si les dossiers entrent dans le modèle : s'il avait fallu un `MOVE_RESOURCE`, c'est que le
modèle ne les représentait pas.

Ce qui s'ajoute est une **garde**, pas un type : un `parent` qui nomme une ressource
inconnue, une non-ressource-dossier, l'entrée elle-même ou l'un de ses descendants est
**refusé** (`applied: false`). La garde vit dans le gestionnaire, donc elle vaut aussi pour
une opération répliquée (ADR-0019 §5).

### 4. Supprimer un dossier supprime son contenu — et ce qu'une ressource possède

**VALIDÉ.** Un dossier emporte ce qu'il contient, en **un seul `batch`**, donc un seul
`Ctrl Z` le rend entier, payloads compris (ADR-0024).

Les alternatives ont été écartées : remonter les enfants d'un cran réarrange en silence un
projet que quelqu'un était en train de ranger ; les laisser sous un dossier disparu les
perd sans le dire.

~~**Une ressource peut aussi en posséder une autre.**~~ **Caduc depuis ADR-0026 :** un
Component et son graphe sont désormais **une seule** ressource `.px`, donc il n'existe plus
de possession à suivre dans un payload. Supprimer un `.px` supprime le graphe parce que
c'était le même fichier.

### 5. Ce que le manifeste porte en plus

`created` et `modified`, en millisecondes epoch, **apposés par l'auteur** comme
l'identifiant et pour la même raison (ADR-0019 §7). `modified` avance avec `revision`, dans
le même `batch` qu'une écriture de payload.

La **taille** n'entre pas dans le manifeste : elle appartient au stockage, qui la mesure
(`ResourceStore.size(id)`) ou **admet qu'il ne peut pas** en répondant `null`. Un panneau
qui afficherait « 0 B » pour un fichier jamais mesuré ment ; un panneau qui affiche « — »
dit la vérité.

### 6. Le renommage est **une** intention, pas une par frappe — AMENDÉ (ADR-0026)

> **Amendement du 2026-08-18.** La conclusion « écrire à la validation » est renversée :
> le modèle bouge à **chaque frappe**, comme partout ailleurs dans l'Editor, et c'est le
> `batch` minté pour la session de frappe qui garde **une seule** entrée d'historique.
> Le raisonnement ci-dessous reste juste sur le fond — un renommage est une intention —
> et c'est le moyen qui était mauvais : la validation coûtait la réactivité pour un
> problème que le format savait déjà résoudre (ADR-0024 §4).

**VALIDÉ, et c'est une exception délibérée à la règle lettre par lettre.**

Le Property System propage à chaque frappe, et c'est l'ergonomie du produit : taper dans
l'Inspector retitre la ligne de Hierarchy immédiatement (ADR-0003, EDITOR.md). Cette règle
vaut pour **le modèle de scène**, où une écriture est une valeur qui vit.

Le nom d'une ressource est un acte d'auteur ponctuel : une opération par caractère produit
onze entrées d'historique pour « New Folder », et onze opérations répliquées pour un mot.
Le renommage d'une ressource **est donc validé** (Entrée, ou perte du focus), et abandonné
par Échap sans rien émettre.

`<px-field>` reçoit deux options pour cela — `write` (le pipeline qui arbitre n'est pas
celui d'un Component) et `commit: 'change'`. Ce sont deux options, pas un second contrôle.

### 7. La sélection de ressource appartient au `Workspace`

Deux fenêtres ont besoin de la même réponse — le panneau surligne une ligne, l'Inspector
affiche des champs — donc elle ne peut pas appartenir à l'une des deux. Elle vit dans le
`Workspace`, comme un `ResourceId` et non comme l'entrée : une entrée retenue survivrait à
la suppression de la ressource.

**Un `Object` et une `Resource` sont mutuellement exclusifs**, parce qu'il y a un seul
Inspector. L'exclusion est câblée dans `editor.js` — aucune des deux fenêtres n'a besoin de
savoir que l'autre existe.

Ce qui reste au panneau : **quel dossier est ouvert**, et le contenu de la recherche.
De l'état de fenêtre, jamais du projet (ADR-0017).

### 8. `Ctrl Z` suit la dernière intention émise

Une pile par ressource (ADR-0024) oblige le raccourci à désigner **laquelle**. La sélection
ne peut pas y répondre : supprimer une ressource l'efface, et l'undo qui la restaurerait
viserait alors la scène.

Le `Workspace` retient donc le **contexte** — `'scene'` ou `'project'` — d'après le
pipeline sur lequel une opération vient d'être annoncée. C'est « ce que le créateur était
en train de faire », et cela survit à la disparition de la sélection.

### 9. L'Inspector route, il ne branche pas

Un panneau de `Resource` à côté du panneau d'`Object`, construit des mêmes primitives :
même en-tête d'identité, mêmes sections, mêmes lignes, même `<px-field>`.

**Ce qui diffère d'un `kind` à l'autre est une ligne de table**, dans
`editor/inspector/resource.js` : des champs supplémentaires, et éventuellement de quoi
montrer son contenu. Ajouter un kind, c'est deux lignes ; rien dans la fenêtre n'apprend
son nom. La chaîne de `if (kind === 'image')` que tout navigateur d'assets finit par
produire est ce que cette table existe pour empêcher.

`describeResource()` est **pur** — entrée de manifeste et contexte en entrée, descripteurs
en sortie — exactement comme `describeComponent()` (ADR-0007), et pour la même raison : la
partie difficile du panneau se teste sous Node.

### 10. Un `kind` peut déclarer qu'il lui faut un fichier

La table de création (`editor/project/commands.js`) porte un `pick` optionnel. Le panneau
lit **le drapeau**, jamais le kind : il demande un fichier, le lit, et le passe à `create`.
C'est ce qui permet à un import d'image d'exister sans que la fenêtre apprenne ce qu'est
une image.

L'encodage retenu aujourd'hui — data URL dans le store mémoire — n'est **nommé nulle part
dans le modèle** : un store IndexedDB gardera le Blob, et seuls le store et la fonction de
lecture changeront. Rien n'entre en base64 dans le JSON d'une scène (ADR-0020).

## Ce que cet ADR ne décide pas

- ~~**L'ordre à l'intérieur d'un dossier.**~~ **Décidé le 2026-08-18 (ADR-0026) :**
  `MOVE_RESOURCE` porte le dossier ET le rang, comme `REPARENT` pour les objets.
- **Fermer un éditeur.** Tant qu'il n'existe pas, la ressource ouverte — et tout dossier
  qui la contient — ne peut pas être supprimée : la commande est désactivée et dit
  pourquoi.
- **L'import de ressources venues d'un autre projet.** Inchangé depuis ADR-0020 : une passe
  de remappage à l'import, non construite.
- **Les vignettes, la recherche par type, les tags.** Rien ne les demande encore.

## Conséquences

### Positives

- Le Project devient un vrai gestionnaire de ressources : créer, ranger, renommer,
  déplacer, supprimer, inspecter — tout par des Operations existantes.
- Renommer un dossier ne casse rien, parce que rien ne référence son nom.
- Un `kind` nouveau apparaît dans le menu, la liste, les icônes et l'Inspector en ajoutant
  deux lignes de table.
- Undo/Redo couvre les ressources sans une ligne d'historique dédiée.

### Négatives

- `MANIFEST_VERSION` passe à 2 ; les projets au format 1 ne sont pas lus (il n'en existe
  aucun).
- Une exception à la propagation lettre par lettre existe désormais, et elle doit être
  énoncée là où elle s'applique — c'est fait dans `<px-field>` et ici.
- La possession d'un graphe par un Component est lue dans un payload, donc invisible dans
  le manifeste. C'est le prix de ne pas avoir inventé un second lien.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder `path` et dériver l'arbre des chaînes** | Renommer un dossier réécrit chaque entrée ; deux entrées peuvent se contredire ; rien ne garantit qu'un dossier existe |
| **Un type `Folder` à côté de `Resource`** | Deux identités, deux jeux d'Operations, deux piles d'undo — l'argument d'ADR-0020 contre `Asset` |
| **`MOVE_RESOURCE` comme Operation** | Déplacer change un champ. `SET_PROPERTY` le fait déjà, et s'inverse déjà |
| **Remonter les enfants d'un dossier supprimé** | Réarrange en silence un projet qu'on était en train de ranger |
| **Renommer lettre par lettre comme dans la scène** | Onze opérations répliquées et onze entrées d'undo pour un mot |
| **La sélection de ressource dans `<px-project>`** | L'Inspector devrait lire dans une autre fenêtre ; deux sources de vérité |
| **Un Inspector par kind** | Deux panneaux à tenir en phase, et la chaîne de `if` revient par la porte de derrière |
