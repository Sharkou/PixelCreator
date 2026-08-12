# ADR-0015 — Un Component peut avoir un graphe `.px` qui définit son comportement

- **Statut :** **accepté** (2026-08-12) · **révisé** (2026-08-12)
- **Décide :** par où un graphe `.px` entre dans la simulation
- **Lié à :** ADR-0004 (Components), ADR-0005 (pas de « Systems »), ADR-0007 (Inspector),
  ADR-0009 (`.px` et `.js`), ADR-0012 (erreurs)

---

## Ce que cette révision corrige

La première version de cet ADR introduisait un Component générique `Script`, portant
`kind` + `source`, et un registre de « kinds de script ». C'est un modèle emprunté à
d'autres moteurs, **pas celui de Pixel Creator** : il fait apparaître une notion de
« script » dans l'UX, là où l'utilisateur ne manipule que des Components, et il faisait
du `.px` un type de composant au lieu d'un comportement.

Le modèle retenu est celui de Pixel Creator depuis l'origine :

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

`Controller.px` **n'est pas un composant et n'en devient jamais un**. C'est le
*comportement* du type de Component `Controller` : le graphe qui dit ce que fait un
Controller. Un `Health` a son `Health.px`, un `Weapon` son `Weapon.px`.

**Il n'existe pas de Component `Script`**, pas de « scripting » exposé à l'utilisateur, et
aucun type de Component n'est généré dynamiquement par un `.px`.

---

## Décision

### 1. Un graphe est lié à un **type** de Component

L'association est `type de Component → graphe`, tenue par un hôte `Behaviors`
(`runtime/scripting/behaviors.js`) :

```js
behaviors.bind('Controller', graph);      // ou bind(Controller, graph)
```

Elle est portée par le type, pas par l'instance : c'est ce qui garantit que **rien du
graphe n'entre dans les données sérialisées d'un composant**. Ce qui sérialise d'un
`Controller`, ce sont ses propriétés (`speed`, …) et rien d'autre.

`.js` n'a besoin de rien ici : un module dont l'export par défaut est une classe de
composant **est** un type de Component, résolu par `import()` et enregistré comme les
autres (ADR-0009). Un graphe est l'autre moitié de la phrase : le comportement d'un type,
pas un type.

### 2. La couture

```
graph ──(interpret)──► create(component) ──► behavior.update(self, ctx)
        une fois par graphe   une fois par instance      à chaque pas
```

`interpret` est l'interprète de graphe. **Il n'est pas construit ici** — ni langage, ni
modèle de graphe, ni VM, ni bac à sable (ADR-0009). Ce qui est fixé, c'est l'endroit où il
se branche, pour qu'il arrive sans rien changer au runtime.

### 3. Deux niveaux, parce que deux choses différentes sont partagées

| | Dépend de | Fait |
|---|---|---|
| **Interprétation** | du graphe seul | **une fois par graphe**, partagée par tous les composants de ce type |
| **Instanciation** | de l'instance | **une fois par composant**, jamais partagée |

Un graphe a des variables, des minuteurs, une position dans sa propre exécution. Cent
`Controller` dans une scène partagent une interprétation et **n'ont jamais un état
d'exécution commun**. C'est toute la raison pour laquelle la couture est une fabrique et
non un objet unique.

### 4. Le comportement interprété n'est pas de l'état

Les propriétés propres énumérables d'un composant **sont** son état sérialisé. Un behavior
est un objet vivant, porteur de méthodes, dérivé du graphe. L'écrire sur le composant
mettrait des fonctions dans chaque instantané et chaque charge répliquée.

Il vit donc dans une `WeakMap` indexée par le composant.

### 5. Le graphe écrit par le chemin réactif normal

La fabrique reçoit le composant **tel que l'Object le détient**, c'est-à-dire le `Proxy`
réactif. Une écriture depuis un graphe est donc une écriture ordinaire : même `Change`,
même réplication, même mise à jour de l'Inspector qu'une écriture de code écrit à la main.
Il n'y a pas un chemin d'écriture « graphe » et un chemin « code » (ADR-0009).

### 6. Relier de nouveau un type édite son comportement à chaud

`bind()` sur un type déjà lié remplace le graphe ; le behavior en cours est remplacé au pas
suivant, sur toutes les instances. Éditer `Controller.px` dans l'éditeur prend effet sans
rien recharger.

### 7. Les erreurs suivent ADR-0012, sans exception

Interprétation impossible, fabrique invalide, exception du graphe : tout remonte comme un
`throw` pendant `update()`. Le runtime le **rapporte** et ne touche à rien — aucune
désactivation automatique, aucune écriture implicite d'`active`, aucun `Change` produit par
le traitement de l'erreur, le reste de la scène continue.

Le rapport est attribué **au Component** (`type: 'Controller'`), puisque c'est lui qui
s'exécute. Un graphe systématiquement cassé est signalé à chaque pas : le silence de Legacy
est ce qu'on refuse.

### 8. Un Component est l'unité d'exécution et d'isolation

Le runtime exécute, pour chaque composant actif et dans l'ordre de la scène : son `update`
s'il en a un, **puis** le graphe lié à son type. Un composant, une place dans l'ordre, un
`try`/`catch`.

**Il n'y a pas de `ScriptSystem`** (ADR-0005). Un graphe s'exécute parce que le Component
qui le porte s'exécute : il hérite gratuitement de l'isolation des erreurs, du pas fixe, de
la séparation update/draw, de l'ordre déterministe et de l'exécution headless — **sans
second chemin d'exécution à maintenir cohérent entre client et serveur.** Le même runtime
interprète le même graphe des deux côtés, parce qu'il n'y en a qu'un.

### 9. La couture ne couvre que `update`

Dessiner appartient au **type de Component** : c'est lui qui déclare `draw`, et le
`SceneRenderer` sait déjà l'exécuter. Un `Controller` de pure logique ne paie donc aucun
`save`/`setTransform`/`restore` par frame et n'est pas compté comme dessiné. Un graphe qui
produit des pixels viendra avec le modèle de graphe, pas avant.

---

## Ce que cet ADR ne décide pas

| Point ouvert | Où il sera tranché |
|---|---|
| ~~Comment un type de Component purement graphe est déclaré~~ | **tranché** : ADR-0016 (définition = type + propriétés + graphe) |
| Ce que deviennent les `variables` d'un graphe vis-à-vis du schéma et de l'Inspector | ADR-0007 + modèle de graphe |
| Le modèle de graphe et l'interprète eux-mêmes | ADR-0009 |
| Qui appelle `bind()` (chargement du projet, éditeur, serveur) | avec les ressources |

---

## Conséquences

### Positives

- L'UX de l'éditeur et le modèle d'exécution disent la même chose : un Component, son `.px`.
- Zéro nouveau chemin d'exécution dans le runtime.
- Plusieurs comportements sur un objet sont naturels : ce sont plusieurs Components, chacun
  avec son graphe. La limite « un script par Object » de la version précédente disparaît
  sans assouplir « un composant par type » (ADR-0004).
- Identique client et serveur, par construction.
- Rien du langage `.px` n'est figé prématurément.

### Négatives

- Un type de Component doit exister avant qu'un graphe puisse lui être lié — c'est
  volontaire (aucun type généré par un `.px`). La brique qui déclare un type est
  ADR-0016.
- L'interprétation est paresseuse : le premier pas d'un composant paie la lecture du graphe.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Un Component générique `Script` (`kind` + `source`)** — version précédente de cet ADR | Invente une notion de « script » dans l'UX ; met la source dans les données du composant ; fait du `.px` un type au lieu d'un comportement. |
| **Un `.px` génère son type de Component** | Le type deviendrait une conséquence d'un fichier de comportement, et l'Inspector dépendrait d'un graphe pour savoir ce qu'est un `Controller`. |
| **Graphe lié à l'instance et sérialisé avec elle** | Duplique le comportement dans chaque objet et mélange comportement et données. |
| **`ScriptSystem` orchestrant les graphes** | Second chemin d'exécution à maintenir, et contredit ADR-0005. |
| **Un behavior unique partagé par toutes les instances** | Deux `Controller` partageraient minuteurs et variables : bug garanti, et non déterministe en réseau. |
| **`eval` / `new Function`** | Sécurité, et contredit ADR-0009 (`.px` est interprété). |
| **Behavior stocké sur le composant** | Met des fonctions dans la sérialisation et la réplication. |
| **Compilation explicite via un `load()`** | Une phase de plus qu'on peut oublier d'appeler, et un état « pas encore chargé » à gérer partout. |
