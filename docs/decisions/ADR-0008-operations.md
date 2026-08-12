# ADR-0008 — Formaliser les mutations en Operations

- **Statut :** **accepté** (2026-08-12)
- **Dépend de :** ADR-0003 (Property System)
- **Complété par :** ADR-0011 (autorité)

## Contexte observé

**Le protocole réseau de Legacy est déjà un système d'opérations qui ne dit pas son nom.**

| Message actuel | Charge utile | Opération implicite |
|---|---|---|
| `update` | `{id, type, component, prop, value}` | `SET_PROPERTY` |
| `add` | objet sérialisé | `ADD_OBJECT` |
| `remove` | id | `REMOVE_OBJECT` |
| `addComponent` | `{id, component}` | `ADD_COMPONENT` |
| `removeComponent` | `{id, component}` | `REMOVE_COMPONENT` |
| `addChild` | `{id, child}` | `ADD_CHILD` |
| `removeChild` | `{id, child}` | `REMOVE_CHILD` |
| `upload_file` / `delete_file` | | `ADD_RESOURCE` / `REMOVE_RESOURCE` |

La forme est bonne. Ce qui manque :

- **`previous`** — impossible d'annuler ;
- **`seq`** — pas d'ordre total, pas de détection de perte ;
- **`author`** — pas d'attribution, donc pas de collaboration ;
- **regroupement** — un drag produit des centaines de messages indépendants ; le
  throttle censé les limiter est neutralisé (`const delay = 0` dans `Network.sync()`).

## Décision

Formaliser ce qui existe. **L'ergonomie utilisateur ne change pas.**

**VALIDÉ :** toute mutation du modèle doit être représentable par une Operation interne.
C'est ce qui ouvre, à terme, réseau, historique, undo/redo, collaboration et IA.

```
object.setProperty('x', 100)
   → Change { object, prop:'x', value:100, previous:80, origin:'editor' }   (ADR-0003)
      → Operation SET_PROPERTY { target, prop, value, previous, seq, actor }
         → authority.check()                                                (ADR-0011)
            → état autoritaire → propagation
```

L'utilisateur **n'écrit jamais** une Operation à la main. Elle est produite par le
Property System.

`object.x = 100` — mutation directe de l'état — ne produit **pas** d'Operation : c'est
une sortie de simulation, pas une intention (voir ADR-0003).

**`setProperty()` n'est pas « la méthode réseau ».** Le réseau est une destination
possible de l'Operation, pas sa définition : la même Operation alimente aussi
l'historique, l'undo/redo, la collaboration et tout autre système abonné.

### Format

```js
{
  op: 'SET_PROPERTY',
  target: { object: 'a1b2c3', component: 'Controller' | null },
  prop: 'speed',
  value: 4,
  previous: 2,
  seq: 1042,
  author: 'user-7f3a',
  batch: 'drag-88'
}
```

### Ce que cela débloque

| Champ | Débloque |
|---|---|
| `previous` | undo / redo |
| `seq` | ordre total, détection de perte, rejeu |
| `author` | collaboration, attribution, journalisation |
| `batch` | un drag = **une** entrée d'historique |

Et, à plus long terme : replay d'une session, journal d'audit, et une IA capable de
modifier un projet en émettant des Operations plutôt qu'en manipulant le DOM.

## Non-décisions explicites

- **Ce n'est ni un CRDT ni de l'OT.** La collaboration multi-utilisateurs reste hors
  périmètre. On s'assure seulement de ne pas la rendre impossible.
- **Pas d'`event sourcing`.** L'état reste la source de vérité ; les Operations sont un
  canal de mutation et un historique, pas le stockage primaire.
- **La résolution de conflits reste « dernier arrivé gagne »**, comme aujourd'hui.
  `seq` rend simplement le conflit détectable — et l'autorité serveur (ADR-0011) donne
  désormais un arbitre là où il n'y en avait aucun.
- **Le système de permissions n'est pas implémenté.** Les Operations transportent un
  `actor` et traversent `authority.check()`, mais la politique initiale peut être
  permissive.

## Conséquences

### Positives

- Undo/redo devient une conséquence de l'architecture, pas une fonctionnalité à part.
- Le batching corrige un défaut réseau réel (débit par frappe).
- Le protocole devient versionnable et documentable.

### Négatives

- **Charge utile plus lourde** (`previous`, `seq`, `author`). À compenser par la
  suppression de la duplication `_prop` (facteur 3 mesuré) et par le batching.
- **Migration coordonnée obligatoire** : le serveur est privé, en Deno, sur une API
  WebSocket obsolète. Client et serveur doivent basculer ensemble (risque R4).
- Calculer `previous` impose une lecture avant chaque écriture — déjà nécessaire pour
  le trap `set` du Proxy, donc coût nul en pratique.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder les messages actuels** | Pas d'undo, pas de batching, pas d'ordre. Bloque plusieurs objectifs produit. |
| **Exposer les Operations à l'utilisateur** (`ops.setProperty(...)`) | Détruit l'ergonomie, explicitement exclu par la vision. |
| **CRDT (Yjs, Automerge)** | Dépendance lourde, modèle de données imposé, complexité sans commune mesure avec le besoin actuel. |
| **Diff d'état par frame** | Perd l'intention (« l'utilisateur a déplacé l'objet ») et donc la qualité de l'undo. |
