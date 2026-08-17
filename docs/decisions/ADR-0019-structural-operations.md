# ADR-0019 — Operations structurelles, `invert()`, et `REPARENT` unifié

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0008 (Operations), ADR-0011 (autorité), ADR-0018 (ordre structurel)
- **Complète et amende :** ADR-0008, § « Contexte observé »

## Contexte observé

`OperationType` ne contenait que `SET_PROPERTY`. Toute mutation de **structure** — créer,
supprimer, attacher un Component, reparenter — se faisait par appel direct, donc :
sans arbitrage, sans réplication, sans historique.

`ADR-0008` dressait la liste des messages réseau de Legacy, dont `addChild` et
`removeChild`. Cette liste est un **inventaire d'un protocole existant**, pas une décision
de conception : elle décrivait ce que Legacy envoyait.

`Object.addChild()` détachait déjà l'objet de son parent précédent (`object.js`) —
« ajouter un enfant » *était* déjà un reparentage.

## Décision

### 1. Sept types pour la Scene, deux pour le Project

| Type | Portée | Payload | Inverse |
|---|---|---|---|
| `SET_PROPERTY` | Scene | `{ target, prop, value, previous }` | `previous` ↔ `value` |
| `ADD_OBJECT` | Scene | `{ object, subtree, parent, index }` | `REMOVE_OBJECT` |
| `REMOVE_OBJECT` | Scene | `{ object, subtree, parent, index }` | `ADD_OBJECT` |
| `ADD_COMPONENT` | Scene | `{ object, component, index, values }` | `REMOVE_COMPONENT` |
| `REMOVE_COMPONENT` | Scene | `{ object, component, index, values }` | `ADD_COMPONENT` |
| `MOVE_COMPONENT` | Scene | `{ object, component, index, previousIndex }` | indices échangés |
| `REPARENT` | Scene | `{ object, parent, index, previousParent, previousIndex }` | le même, `previous*` échangés |
| `ADD_RESOURCE` / `REMOVE_RESOURCE` | Project | manifeste + payload | l'un l'autre |

### 2. `REPARENT` remplace `ADD_CHILD` et `REMOVE_CHILD`

**VALIDÉ.** Une seule Operation couvre quatre gestes :

- reparenter ;
- détacher (`parent: null`) ;
- réordonner parmi ses frères (même parent, autre index) ;
- **réordonner parmi les racines** — les racines d'une Scene sont les enfants d'un parent
  implicite `null` (ADR-0018).

Le geste réel dans une Hierarchy est un dépôt *entre deux lignes* : il change le parent
**et** la position, atomiquement. Deux Operations séparées devraient toujours voyager
ensemble, s'annuler ensemble, et dans le bon ordre.

Et l'argument décisif : **l'inverse d'un `REPARENT` est un `REPARENT`**. Deux opérations
qui s'annulent l'une l'autre sont la même opération.

> **Ce n'est pas un renversement d'ADR-0008.** La capacité couverte est rigoureusement
> identique ; c'est la liste d'un inventaire réseau qui est simplifiée. ADR-0008 est amendé
> en conséquence.

### 3. Les événements de structure ne fusionnent pas

`child:added` / `child:removed` restent. **Ce sont deux couches différentes :**

| | Operation | Événement de Scene |
|---|---|---|
| Ce que c'est | une intention arbitrable, répliquable, annulable | une notification que la forme a changé |
| Produite par | `submit()` | toute mutation, y compris un `addChild()` de script |

Fusionner les deux rendrait chaque appel de script répliquable, et chaque changement
répliqué inobservable.

### 4. `apply()` n'écrit jamais par une API qui resoumettrait

**La propriété anti-écho est étendue aux Operations structurelles.** Chaque gestionnaire
mute par les primitives internes (`linkChild`, `unlinkChild`, la collection ordonnée),
qui ne produisent aucune Operation. Appliquer une opération répliquée ne renvoie donc
rien : **la boucle n'est pas prévenue, elle est irreprésentable** (ADR-0008).

### 5. Un gestionnaire refuse, il ne jette pas

Un cycle, un index qui ne change rien, un Component déjà attaché → `applied: false`,
**aucune Operation émise**. Un `throw` dans le pipeline remonterait au transport. La garde
de cycle (`isAncestorOf`) vit désormais dans le gestionnaire, pas seulement dans
`addChild()`, parce qu'une opération répliquée doit être validée aussi.

**Cycle en réseau :** deux clients reparentent simultanément A sous B et B sous A. Chaque
opération est valide localement, leur composition ne l'est pas. C'est le serveur
autoritaire qui tranche, dans **son** ordre (ADR-0011). Aucune machinerie supplémentaire.

### 6. `seq` est par pipeline

C'était un compteur de module, partagé par toutes les scènes du processus. Il devient un
compteur d'instance, **apposé par le pipeline au moment du `submit()`**. Une opération qui
arrive déjà numérotée — répliquée — garde le numéro de son auteur.

### 7. Les identifiants sont générés par l'auteur

Ils voyagent dans le payload. Un identifiant minté par le récepteur ferait diverger les
scènes d'une machine à l'autre.

### 8. `invert()` appartient au Core

Pure, sans modèle, testable sous Node. Une seule place connaît la règle d'inversion de
chaque type. `seq` de l'inverse est remis à `null` : c'est une **nouvelle** intention, qui
prend son propre numéro auprès du pipeline qui l'accepte. `actor` et `batch` sont
conservés. Voir ADR-0024 pour ce qui en est fait.

### 9. Les champs d'inversion sont nommés et séparables

`previous`, `subtree`, `values`, `previous*` ne servent qu'à inverser. Un transport est
libre de les élaguer — un serveur n'en a pas besoin pour appliquer. **Cette optimisation
n'est pas construite** ; le format la rend seulement possible, et c'est le fait de nommer
les champs qui la rend possible.

## Ce que cet ADR ne décide pas

- La granularité des Operations d'édition de graphe (`ADD_NODE`, `CONNECT`…). Tant que le
  modèle de graphe n'existe pas, un graphe se sauvegarde entier. Report délibéré.
- Le format réseau des Operations structurelles sur le fil.

## Conséquences

### Positives

- Créer, supprimer, attacher, réordonner et reparenter deviennent répliquables et
  annulables, sans code d'undo dédié.
- Un dépôt de Hierarchy est **une** opération atomique, avec **un** inverse et **une**
  validation de cycle.
- Quatre gestes, un modèle mental.

### Négatives

- ADR-0008 devait être amendé : c'est une liste écrite dans un ADR accepté qui est
  remplacée.
- `Scene` prend un `registry`, puisqu'`ADD_COMPONENT` reconstruit une instance.
- `Operations.register` prend une option `resolveTarget`, parce qu'un `ADD_OBJECT` nomme
  une cible qui n'existe pas encore.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder `ADD_CHILD` / `REMOVE_CHILD` + une Operation de réordonnancement** | Un dépôt produit deux ou trois opérations qui doivent toujours voyager et s'annuler ensemble, et dont l'ordre importe. Trois règles d'inversion au lieu d'une. |
| **`UNPARENT` séparé** | Son inverse est un `REPARENT`. C'est la même opération avec `parent: null`. |
| **Valider les cycles dans `addChild()` seulement** | Une opération répliquée ne passe pas par `addChild()`. |
| **Faire jeter les gestionnaires invalides** | Le `throw` remonterait au transport. |
| **Garder `seq` global au module** | Sans conséquence tant que c'est un numéro d'ordre local ; faux le jour où c'est un numéro de séquence réseau. |
