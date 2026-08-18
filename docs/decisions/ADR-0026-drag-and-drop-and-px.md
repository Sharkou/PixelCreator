# ADR-0026 — Le drag & drop est une capacité transverse, `.px` est une seule ressource, et `active` est le seul état de vie

- **Statut :** **accepté** (2026-08-18)
- **Dépend de :** ADR-0003 (Property System), ADR-0007 (schéma), ADR-0016 (définition de Component), ADR-0019 (Operations structurelles), ADR-0020 (Resources), ADR-0024 (Undo/Redo), ADR-0025 (dossiers, Inspector de ressources)
- **Amende :** ADR-0016 (le graphe était référencé par `ResourceId`), ADR-0025 (§6 renommage, §ordre), ADR-0001 (`Object.visible` supprimé)

## Contexte observé

La passe précédente a rendu le Project fonctionnel. En l'utilisant, sept incohérences sont
apparues — toutes du même genre : **deux mécanismes pour une idée**.

| Constat | Cause |
|---|---|
| Créer un Component créait **deux** ressources, `.px` + graphe | ADR-0016 exigeait un `ResourceId` pour le graphe |
| Le renommage se faisait au double-clic dans Project, au second clic dans Hierarchy | Deux gestes pour un acte |
| Renommer depuis l'Inspector attendait `Entrée` ; ailleurs, chaque frappe est propagée | Deux ergonomies pour un champ |
| Renommer `player.png` permettait d'écrire `player.txt` | Le nom et le type étaient un seul champ libre |
| `Hide` dans Hierarchy écrivait `visible`, la case de l'Inspector écrivait `active` | **Deux drapeaux** pour un état que rien ne distinguait |
| L'ordre dans un dossier n'était pas modifiable | Aucune Operation ne le représentait |
| Le curseur `grab` couvrait tout l'en-tête d'un Component, qui est aussi un bouton de repli | Deux gestes sur une surface, sans marque |

Et un manque : le drag & drop n'existait qu'à trois endroits, chacun avec son propre code.

## Décision

### 1. `MyComponent.px` est **une** ressource — amende ADR-0016

**VALIDÉ.** La définition d'un Component **porte son graphe** :

```js
{ type: 'res_c3', label: 'Controller', properties: { … },
  graph: { version: 1, nodes: [], connections: [] } }
```

ADR-0016 imposait un `ResourceId` pour deux raisons : ne pas dupliquer un graphe, et
permettre à la fenêtre Graph d'ouvrir un graphe sans charger la définition. **Avec une
seule ressource, la duplication est impossible par construction** et « ouvrir le graphe »
*est* « ouvrir le `.px` ». Ce que l'identifiant achetait devient structurel.

`defineComponent()` refuse désormais une chaîne, et le message le dit : un `.px` porte son
graphe, il ne pointe pas vers un autre fichier. Un créateur pense « j'ai créé un
Component », et le modèle dit la même chose.

`ResourceKind.GRAPH` reste dans l'énumération — un graphe autonome reste concevable — mais
**plus rien n'en crée**.

### 2. `active` est le seul état de vie d'un Object — amende ADR-0001

**VALIDÉ : `Object.visible` est supprimé.**

Le Runtime ignorait un objet `!active` ; le renderer ignorait en plus un objet `!visible`.
La distinction — simulé mais pas dessiné — n'était exposée par **aucun contrôle**, et les
deux qui existaient écrivaient chacun un champ différent : cacher une ligne dans la
Hierarchy ne décochait pas la case de l'Inspector.

Un seul champ, deux contrôles, une valeur. `serializeObject()` n'écrit plus `visible`.

> Si « simulé mais invisible » redevient un besoin, il reviendra comme une propriété d'un
> **Component de rendu** — là où la question se pose — et non comme un second drapeau sur
> l'Object.

### 3. Le renommage : même geste partout, réactif partout, **une** entrée d'historique

**VALIDÉ.**

| Geste | Où | Effet |
|---|---|---|
| Second clic sur un élément déjà sélectionné | Project, Hierarchy | édition en place, après la pause de 400 ms |
| `F2` | Project, Hierarchy | édition immédiate |
| Double-clic | Project, Hierarchy | **ouvrir**, jamais renommer |
| Frappe dans l'Inspector | Inspector | le modèle bouge à **chaque caractère** |

La contradiction apparente — « réactif » et « une seule entrée d'undo » — se résout avec ce
que le format porte déjà : le champ **frappe un `batch` au focus** et l'oublie au blur. Onze
frappes produisent onze opérations répliquées (le modèle est vivant, c'est le produit) et
**une** entrée d'historique (ADR-0024 §4). Aucun debounce, aucun second historique.

Ceci **amende ADR-0025 §6**, qui avait tranché l'inverse pour les ressources.

### 4. L'extension appartient au type, pas au créateur

`player.png` → `player_idle.png` : oui. `player.png` → `player.txt` : **non**.

- l'extension est **dérivée** — du `mime` pour un asset, du `kind` sinon (`.px`, `.scene`) ;
- le champ de l'Inspector contient la **base**, l'extension est affichée à côté, en lecture seule ;
- une extension tapée est retirée si elle ressemble à un type (`.txt`, `.jpg`), conservée si
  elle ressemble à un nom (`v1.2`) ;
- le compteur d'unicité passe **avant** l'extension : `hero 2.png`.

**Le nom reste UN champ dans le modèle.** Pas de `base` + `extension` stockés séparément :
il n'y a pas de système de fichiers derrière — le store est indexé par `ResourceId`
(ADR-0020) — donc un second champ serait une redondance à tenir en phase pour un suffixe
dérivable.

### 5. `MOVE_RESOURCE` — amende ADR-0025

ADR-0025 laissait l'ordre interne d'un dossier non représenté. Il l'est maintenant, et par
**une seule** opération, comme `REPARENT` pour les objets (ADR-0019) :

```
MOVE_RESOURCE { resource, parent, index, previousParent, previousIndex }
```

`index` est un **rang parmi les frères**, jamais une position dans le manifeste plat : un
créateur dépose entre deux tuiles du dossier qu'il regarde, et une position globale voudrait
dire autre chose sur chaque machine. L'inverse d'un déplacement est un déplacement.

`SET_PROPERTY parent` n'est plus le chemin du déplacement — il ne pouvait pas porter de
rang — mais la garde de cycle reste dans le gestionnaire, pour les deux.

### 6. Le drag & drop est **une** capacité, décrite par une table de règles

```
payload                 target                      règle
─────────────────────   ─────────────────────────   ──────────────────────────────
files (du bureau)       project | scene |           importer, puis instancier
resource                hierarchy | property |      selon la cible
object                  content
component
```

- `dnd/payload.js` — ce qui est porté : `files`, `resource`, `object`, `component` ;
- `dnd/rules.js` — ce qu'un dépôt **signifie**, pur, testé sous Node ;
- `dnd/files.js` — la seule partie qui a besoin d'un navigateur (`DataTransfer`).

**Une règle peut refuser, et dire pourquoi.** `describe()` fournit la phrase qu'un panneau
affiche et qu'un test vérifie ; « rien ne s'est passé » est la pire réponse à un geste.

**Ce qui est instanciable est une ligne de table.** Une image devient `Object + Transform +
Sprite(source)`. Un son, un tilemap, un prefab : une ligne de plus, et rien d'autre ne
change. Une ressource sans ligne n'est pas instanciable, et le refus est visible.

Les règles vivent dans les couches qui les concernent : elles appellent le modèle
(`project.move`, `component.setProperty`, la commande d'ajout d'objet), jamais le DOM.

### 7. Un prefab n'est pas un format, c'est une décision — **reporté**

Glisser un Object de la Hierarchy vers Project est **refusé, avec sa raison**. Ce qui n'est
pas décidé : ce qu'un prefab contient, comment une instance reste liée à lui, ce qu'un
override signifie, et ce que devient une instance quand le prefab change. Une implémentation
« temporaire » serait un format que le modèle de graphe devra ensuite défaire.

L'API est prête — c'est une ligne dans la table de règles — et la décision viendra avec la
fenêtre Graph, qui pose exactement les mêmes questions.

### 8. Une surface qui se clique **et** se traîne porte une poignée

L'en-tête d'un Component est un bouton (il replie) : curseur `pointer`. Le déplacement se
prend sur une **poignée** de six points, qui montre `grab`. Le geste existait déjà
(`MOVE_COMPONENT`, ADR-0018/0019) ; ce qui manquait était de dire **où** il se prend.

### 9. « Search components » devient « Search properties »

Un Component appartient au modèle d'`Object` : c'est une capacité d'un objet. Une Resource a
une identité, des métadonnées et un contenu — **pas** des Components. Un seul champ de
recherche sert les deux panneaux, donc il est nommé pour ce qu'ils ont en commun.

### 10. `+` et `…`, dans chaque fenêtre, avec la même primitive

Le menu de création du Project est **le même dropdown** catégorisé et filtrable que Add
Object et Add Component (`ui/menu.js`) : mêmes groupes, mêmes en-têtes, mêmes flèches. Les
catégories des ressources — `General`, `Scenes`, `Graphics`, `Audio`, `Components`, `Other`
— sont une table, extensible sans un seul `if`.

`…` complète `+` dans Project, Hierarchy et Inspector, et ne contient **que ce qui existe** :
importer, remonter, tout déplier, tout replier, désélectionner.

### 11. Project est un navigateur d'assets, pas une seconde Hierarchy

Grille de tuiles, vignette en damier, aperçu réel pour les images, glyphe par type sinon —
comme `design/prototype.js`. Le fil d'Ariane, la navigation par dossier, la sélection et la
recherche sont conservés. Une scène s'**arrange**, un projet se **parcourt** : ce ne sont
pas les mêmes gestes, donc pas la même vue.

## Ce que cet ADR ne décide pas

- **Le prefab** (§7).
- **Ouvrir une ressource** autre qu'un dossier : le double-clic est réservé et émet
  l'intention, mais il n'existe aucun éditeur à ouvrir tant que la fenêtre Graph et
  l'échange de scène n'existent pas.
- **Le modèle de graphe** lui-même : `.px` porte `{ version, nodes, connections }` et
  personne ne l'interprète encore.
- **L'import de sons et de tilemaps** : une ligne dans `INSTANTIABLE` le jour où un Component
  les consomme.

## Conséquences

### Positives

- Un créateur qui fait un Component obtient **un** fichier.
- Une seule table dit ce qu'un dépôt signifie ; ajouter une source, une cible ou un type est
  une ligne.
- Les refus sont visibles et testés — y compris le prefab, qui dit pourquoi il n'existe pas.
- `active` ne peut plus diverger de lui-même.
- Renommer est le même geste partout, et coûte une entrée d'undo.

### Négatives

- `Object.visible` disparaît du format : les scènes de la passe précédente perdent un champ
  qui n'était lu que par le renderer (aucun projet publié n'existe).
- `defineComponent()` refuse une forme qu'ADR-0016 exigeait : les tests et les payloads
  écrits entre-temps ont dû être migrés.
- Le drag inter-fenêtres passe par un événement du shell plutôt que par `DataTransfer`,
  parce qu'un drag HTML5 ne traverse pas proprement plusieurs Shadow Roots.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder `.px` + une GraphResource** | Deux ressources pour une chose, dans le panneau comme dans la tête du créateur |
| **Garder `visible` à côté d'`active`** | Deux drapeaux, aucun contrôle pour les distinguer, deux vues en désaccord |
| **Renommer au double-clic dans Project** | Le double-clic doit ouvrir ; deux gestes pour un acte, selon la fenêtre |
| **Attendre `Entrée` dans l'Inspector** | Le produit propage lettre par lettre ; l'exception était la seule chose à expliquer |
| **`base` + `extension` stockés séparément** | Deux champs à tenir en phase pour un suffixe dérivable, sans système de fichiers derrière |
| **Réordonner via `SET_PROPERTY parent`** | Un `parent` ne porte pas de rang ; il aurait fallu deux opérations et un ordre entre elles |
| **`handleDropX()` par fenêtre** | Trois idées différentes de ce qu'une image veut dire, et aucune testable |
| **Un prefab minimal tout de suite** | Un format inventé avant la décision, que le modèle de graphe devrait défaire |
