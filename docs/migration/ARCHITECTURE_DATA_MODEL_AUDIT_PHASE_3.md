# Consolidation avant implémentation — fondations du modèle de données

> **Nature :** consolidation de la [Phase 2](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md).
> Ce document **ne décide rien**. Il vérifie, sépare ce qui est verrouillé de ce qui ne
> l'est pas, et propose une séquence.
> **Date :** 2026-08-14 · **Vérifié contre :** `HEAD = 38039a3`, aligné avec `origin/master`.
> **État d'implémentation : AUCUN.** Aucun fichier de `src/` n'a été créé ni modifié.

Ce document est le troisième d'un chantier en trois passes :

| Passe | Document | Rôle |
|---|---|---|
| 1 | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md) | **audit** — ce que le modèle est, et ce qui lui manque |
| 2 | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md) | **proposition** — l'architecture visée, alternatives comprises |
| 3 | ce document | **consolidation** — séquence, dépendances, risques, arbitrages restants |

> **Rappel de vocabulaire.** Deux numérotations de « phase » coexistent. Celle-ci est la
> phase 3 **du chantier « modèle de données »**, à l'intérieur de l'**étape 4 de la
> migration** décrite par [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md). Ce n'est pas une
> phase de migration.

Étiquetage, conforme à [`../CONVENTIONS.md`](../CONVENTIONS.md), plus une étiquette
transitoire :

| Étiquette | Sens |
|---|---|
| **OBSERVÉ** | vérifié dans le code, à la révision indiquée |
| **DÉCIDÉ (ADR-XXXX)** | tranché par un ADR accepté — fait autorité |
| **DÉCISION VALIDÉE** | tranché par le mainteneur, **pas encore consigné dans un ADR** |
| **PROPOSITION** / **RECOMMANDATION** | non décidé, non implémenté |
| **À DÉCIDER** | demande un arbitrage explicite avant implémentation |

---

## 1. État vérifié du dépôt

### 1.1 Révision

**OBSERVÉ.** `HEAD` = `refs/heads/master` = `refs/remotes/origin/master` = `38039a3`.
La Phase 2 avait été vérifiée contre `19107304`.

**`src/` est identique octet pour octet entre les deux révisions** — les 94 fichiers `.js`
ont été comparés (taille et date de modification), aucune différence. Le commit intermédiaire
ne touche que `docs/`. **Toutes les affirmations de code des Phases 1 et 2 restent donc
valides.**

*Limite de méthode :* aucun shell n'est exposé sur la machine du mainteneur dans la session
qui a produit ce document. `git status` et `git diff` n'ont pas pu être exécutés ; l'état du
dépôt est établi par lecture directe de `.git/refs` et par comparaison de l'arborescence.

### 1.2 Outillage

**OBSERVÉ**, sur `19107304`, non rejoué sur `38039a3` puisque `src/` est identique :

```
tools/test.sh              497 tests, 497 passés, 0 échec
node tools/layers/run.js   profil v2 : 0 import interdit sur 325 imports
```

`tools/parity/run.js` (39 scénarios) **n'a pas été exécuté** — il demande `legacy/`, absent
de la copie d'analyse.

### 1.3 Cinq faits de code que la Phase 3 ajoute à l'audit

Établis en réexaminant spécifiquement les points d'arbitrage. Ils ne figurent pas dans la
Phase 2 et changent le coût de certaines options.

| # | Fait — **OBSERVÉ** | Emplacement | Portée |
|---|---|---|---|
| **N1** | `defineComponent` **rejette** un `graph` qui n'est pas un objet : `typeof graph !== 'object'` → `TypeError` | `core/definition.js:75-77` | Une référence par identifiant (chaîne) est refusée **aujourd'hui**. Chiffre le coût de l'arbitrage A |
| **N2** | `SceneRenderer.render()` itère lui aussi `Object.keys(components)` et appelle `draw()` sur **chaque** composant qui en déclare un | `runtime/rendering/scene-renderer.js:60-82` | L'ordre des Components gouverne **aussi l'ordre de dessin à l'intérieur d'un objet**, pas seulement l'ordre d'`update`. Deuxième consommateur de l'ordre |
| **N3** | Un test assert que deux objets dont les Components ont été attachés dans un ordre **différent** produisent le **même** ordre de clés sérialisées | `core/serialize.test.js:175-186` | Ce test **encode** la décision actuelle. Il ne cassera pas par accident : il devra être **inversé**, pas supprimé |
| **N4** | `type: 'object'` n'apparaît dans **aucun** composant livré — seule occurrence : une fixture de test | `core/definition.test.js:59` | L'arbitrage C a un impact réel de deux lignes |
| **N5** | **ADR-0004 affirme, en VALIDÉ :** « La clé de `object.components` reste **le nom du type**, comme dans Legacy » | `decisions/ADR-0004-component-lifecycle.md:100-102` | L'arbitrage D touche la lettre d'un ADR accepté |

### 1.4 Une distinction que la Phase 2 avait refermée sans le dire

La Phase 2 écrit « `components` devient une collection ordonnée sérialisée en tableau ».
Cette formule **confond deux changements indépendants** :

| | Ce qui change | Ce qui casse |
|---|---|---|
| **(a) forme sérialisée** — `"components": { … }` → `"components": [ … ]` | `core/serialize.js` seul | `serialize.test.js:80`, `:175-186` ; `behaviors.test.js:466` |
| **(b) forme du getter en mémoire** — `object.components` | `core/object.js` **et tous ses lecteurs** | `runtime.js`, `scene-renderer.js`, `inspector.js`, `object.test.js:183` |

**(a) suffit à rendre l'ordre persistant.** (b) n'est nécessaire que pour un accès par index
en mémoire — et `moveComponent()` peut opérer sur le stockage interne sans changer la forme
du getter, qui peut continuer à produire un objet gelé dont l'ordre des clés est celui de la
collection.

**Non décidé.** Ce point divise le périmètre de la première étape par trois. Il figure en
tête des décisions requises (§8).

---

## 2. Décisions déjà verrouillées

### 2.1 Normatives par ADR — elles priment sur toute proposition d'audit

**ADR = Architecture Decision Record.**

| Décision | ADR |
|---|---|
| `Object` reste `Object`, jamais `Entity` | ADR-0001 |
| `Transform` est un Component ; `object.x` est une façade ; les valeurs sont **locales**, le monde est **dérivé** | ADR-0002 |
| `x =` direct / `setProperty()` contrôlé ; `$x` supprimé | ADR-0003 |
| Un seul Component par type ; duck-typing, aucune classe de base ; **la clé de `object.components` est le nom du type** | ADR-0004 |
| Pas de dossier `systems/` | ADR-0005 |
| Editor en Web Components natifs | ADR-0006 |
| Inspector piloté par schéma, réflexif en repli — le repli est une **exigence**, pas une tolérance | ADR-0007 |
| Toute mutation du modèle est représentable en Operation ; `previous`, `seq`, `actor`, `batch` | ADR-0008 |
| `.px` = graphe JSON **interprété** ; pas d'`eval`, pas de `new Function` | ADR-0009 |
| L'identité est un id opaque, jamais un nom | ADR-0010 |
| Serveur autoritaire ; `authority.check()` obligatoire | ADR-0011 |
| Le Runtime isole et rapporte ; il ne modifie pas le modèle | ADR-0012 |
| Camera / Viewport ; Input abstrait passé au pas | ADR-0013, ADR-0014 |
| Un graphe est le **comportement d'un type** de Component ; pas de Component `Script` | ADR-0015 |
| Une définition = `type` + propriétés + graphe ; elle appartient au type | ADR-0016 |
| Sélection et picking appartiennent à l'Editor | ADR-0017 |

### 2.2 Validées par le mainteneur, non encore consignées dans un ADR

**DÉCISION VALIDÉE (2026-08-14).**

1. **L'ordre des Components est signifiant et persistant** — il fait partie de l'état du projet.
2. **Le réordonnancement** des Components, des enfants et des objets racines est une
   **mutation du Core**, représentable en Operation, donc compatible réplication et Undo/Redo.
3. **Une définition de Component a une identité stable distincte de son nom affiché.**
   Renommer ne doit pas casser les instances existantes.
4. **`.px`** reste une ressource JSON interprétée par le Runtime ; le Core ne l'interprète
   pas ; le graphe appartient au type et est partagé par ses instances ; **chaque instance
   garde son propre état d'exécution**.
5. **Terminologie : `Graph` / « graphe »** désigne le système de programmation visuelle.
   **`Composer` est interdit dans ce sens** et réservé à une éventuelle future fenêtre de
   composition musicale.
6. **Le `Graph` en tant que ressource est conceptuellement distinct de la vue/éditeur qui le
   modifie.** `GraphResource` désigne la ressource persistée ; `Graph` désigne la notion
   produit et la fenêtre qui l'édite.
7. **`Object` n'est pas un Component.** `name`, `tag` et les autres propriétés natives
   restent des propriétés intrinsèques d'`Object`, jamais un Component stocké dans
   `object.components`.
8. **`Object` reste une section intrinsèque de l'Inspector**, aux côtés des Components, et
   `name` / `tag` y restent éditables.
9. **Les ADR priment sur les propositions d'audit.**

### 2.3 Vérification des points 7 et 8 contre le code

**OBSERVÉ — ils décrivent le comportement déjà implémenté ; rien n'est à construire.**

- `editor/inspector/schema.js` exporte `objectFields()` — une liste **écrite à la main**
  (`name`, `tag`, `layer`, `active`), distincte de `describeComponent()` qui, lui, lit un
  schéma ou réfléchit sur une instance ;
- `editor/windows/inspector.js` rend une section `Object` au-dessus des Components, alimentée
  par `objectFields()` ;
- `visible` et `lock` en sont absents volontairement : la ligne de Hierarchy les porte ;
  `id` est absent parce qu'un créateur n'en a pas l'usage ;
- l'édition passe par `Object.setProperty()`, qui produit une Operation dont la cible est
  `{ object: id, component: null }` (`core/object.js:160-168`). **Le `component: null` est la
  façon dont le format exprime « propriété intrinsèque de l'Object ».** Éditer `name` est donc
  déjà une mutation répliquable et annulable.

**Conséquence pour l'étape 1 :** le passage de `components` à une collection ordonnée ne
touche **pas** la section `Object` — elle n'est pas dans cette collection.

**Aucun ADR ne documente aujourd'hui cette section de l'Inspector.** Elle n'existe que dans le
code. Voir §7.

---

## 3. Arbitrages encore ouverts

**Rien de cette section n'est décidé.** Les recommandations sont signalées comme telles et
n'engagent personne.

### A. Le graphe d'une définition : référencé par `ResourceId` ou stocké inline ? — **À DÉCIDER**

**État actuel — OBSERVÉ.** ADR-0016 montre le graphe **inline** dans son exemple JSON, et le
code le suit : `defineComponent` refuse une chaîne (`definition.js:75-77`, fait N1) ;
`Behaviors.bind(type, graph = componentDefinition(type)?.graph)` lit le graphe depuis la
définition (`behaviors.js:112`) ; l'invalidation compare les graphes **par identité d'objet**
(`behaviors.js:165`).

| | Option 1 — inline (statu quo) | Option 2 — `ResourceId` |
|---|---|---|
| Avantages | aucun changement de code ; définition auto-suffisante ; JSON lisible | un graphe est une ressource comme les autres ; ouvrable seul dans un onglet `Graph` ; une seule copie ; diffs séparés |
| Inconvénients | ouvrir le `Graph` impose de charger la définition ; risque de deux copies divergentes ; un graphe volumineux alourdit chaque lecture de définition | rompt la validation actuelle ; `bind()` perd son paramètre par défaut ; il faut un résolveur avant `bind()` ; JSON moins lisible |
| Impact code | nul | `definition.js:75-77` et `behaviors.js:112`. L'invalidation par identité **continue de fonctionner** : ce qui est lié reste l'objet graphe résolu, pas l'identifiant |
| Impact ADR | nul | ADR-0016 §1 et son point ouvert « format de fichier et stockage d'une définition » |

**RECOMMANDATION, non décision :** option 2, parce que la fenêtre `Graph` doit pouvoir ouvrir
un graphe seul, et que deux copies d'un même graphe sont une classe de bug qu'on découvre tard.

### B. `ADD_CHILD` / `REMOVE_CHILD` fusionnés dans `REPARENT` ? — **À DÉCIDER**

**État actuel — OBSERVÉ.** ADR-0008 et `ARCHITECTURE.md` §6.2 listent les deux. **Aucune n'est
implémentée** : `OperationType` ne contient que `SET_PROPERTY`. `Object.addChild()` détache
déjà de l'ancien parent (`object.js:295`) — « ajouter un enfant » *est* déjà un reparentage.

**Clarification que la Phase 2 n'énonce pas explicitement :** les **types d'Operation** et les
**événements de structure de la Scene** sont deux couches indépendantes. Les événements
`child:added` / `child:removed` ont des consommateurs (`hierarchy.js:212`, `viewport.js:77`).
**Fusionner les Operations n'oblige à fusionner ni les événements ni `addChild`/`removeChild`.**

| | Option 1 — deux Operations + une de reorder | Option 2 — `REPARENT { object, parent, index }` unifié |
|---|---|---|
| Avantages | fidèle à la lettre d'ADR-0008 ; correspondance 1-pour-1 avec les messages Legacy | un dépôt de Hierarchy = **une** opération atomique ; un seul inverse ; une seule validation de cycle ; couvre reparent, unparent, reorder frères et reorder racines |
| Inconvénients | un dépôt produit deux ou trois opérations qui doivent **toujours** voyager et s'annuler ensemble, et dont l'ordre importe ; trois règles d'inversion | s'écarte d'une liste écrite dans un ADR accepté |
| Impact code | trois types, trois gestionnaires, trois inverses | un type, un gestionnaire, un inverse. La garde `isAncestorOf` (`object.js:291`) migre dans le gestionnaire |
| Impact ADR | nul | ADR-0008 § « Opérations » et `ARCHITECTURE.md` §6.2 |

**RECOMMANDATION, non décision :** option 2. La capacité couverte est identique — c'est une
simplification, pas un renversement. Mais c'est bien la modification d'une liste écrite dans un
ADR accepté.

### C. Retirer le type `object` de `DEFAULTS` ? — **À DÉCIDER**

**État actuel — OBSERVÉ.** `core/definition.js:52` déclare `object: () => ({})`. **Aucun
composant livré ne déclare `type: 'object'`** ; seule occurrence du dépôt :
`core/definition.test.js:59`, une fixture (fait N4). Côté Editor, `object` n'appartient pas à
`SCHEMA_KINDS` → il retombe en `READONLY`, affiché par `describeOpaque()`.

| | Option 1 — conserver | Option 2 — retirer |
|---|---|---|
| Avantages | aucun changement ; un Component utilisateur peut stocker un objet structuré | supprime un type sans validation, sans éditeur et sans sens pour la réplication |
| Inconvénients | invite à déclarer une propriété qu'on ne peut ni éditer, ni valider, ni differ | ferme une porte qu'un cas d'usage pourrait rouvrir |
| Impact code | — | `definition.js:52` et `definition.test.js:59`. **Deux lignes** |

**RECOMMANDATION, non décision :** option 2, uniquement parce que le coût est nul. Contre-
argument honnête : rouvrir plus tard coûte aussi une ligne — l'enjeu est faible dans les deux
sens.

### D. `type` lisible pour les Components natifs, `ResourceId` opaque pour les Components utilisateur ? — **À DÉCIDER**

**C'est l'arbitrage le plus lourd.**

**ADR-0004 affirme, en VALIDÉ :** « La clé de `object.components` reste **le nom du type**,
comme dans Legacy — cela confirme le comportement historique plutôt que de le changer »
(fait N5). Un `type` opaque en respecte la **lettre** — la clé reste `componentType(component)`
— mais tend l'**intention**, « comme dans Legacy » supposant un nom lisible.

**Impact par consommateur — OBSERVÉ :**

| Consommateur | Effet d'un `type` opaque |
|---|---|
| Sérialisation | `serialize.js` clefe par `componentType()` → **inchangé**. Le JSON porte l'identifiant au lieu du nom |
| `describeType()` | `registry.js:60` lit déjà `ComponentClass?.label ?? SHIPPED[type]?.label ?? type` → **la couture existe** |
| Icônes | `iconForComponent()` (`icons.js:156-160`) lit `ComponentClass.icon` **avant** la table par nom → une définition qui déclare `icon` garde son icône |
| Recherche Inspector | `inspector.js:340` filtre sur `humanise(type)`. **Cassé** — doit passer à `label` |
| Runtime | le type n'est qu'une clé → **inchangé** |
| Rapports d'erreur | `componentFailure({ … })` rapporte le type → un message dirait l'identifiant. Doit passer à `label` |
| Resources | c'est le point : `type` = identité de la définition rend le renommage gratuit, sans toucher une instance |

| | Option 1 — `type` toujours lisible | Option 2 — opaque pour les utilisateurs | Option 3 — slug lisible figé à la création |
|---|---|---|---|
| Renommer | **casse toutes les instances** | gratuit | gratuit |
| Collision inter-projets | possible | impossible | possible |
| JSON lisible | oui | non (le manifeste donne la correspondance) | oui |
| Divergence slug / label | — | — | oui, à terme |
| Impact code | nul | `inspector.js:340`, canal de rapport d'erreurs | idem option 2, plus une génération de slug |

**RECOMMANDATION, non décision :** option 2 — la seule qui satisfasse la décision validée
§2.2-3 sans exception. Mais l'asymétrie « natif lisible / utilisateur opaque » est un choix de
modèle mental qui appartient au mainteneur.

### E. Le sélecteur `Renderer [ Type ▼ ]` doit-il rester unique ? — **À DÉCIDER**

**La question a changé de nature depuis la Q8 du 2026-08-13.**

**OBSERVÉ (fait N2).** `SceneRenderer.render()` itère `Object.keys(components)` — l'ordre
d'attachement — et appelle `draw()` sur **chaque** composant qui en déclare un. Concrètement :
un Object portant `RectangleRenderer` **et** `Sprite` dessine les deux, et **l'ordre des
Components décide lequel passe au-dessus**.

Rendre l'ordre signifiant et persistant ne fait donc pas qu'ajouter une capacité : cela
transforme « plusieurs renderers sur un Object » d'un accident toléré en une **technique de
composition légitime et sauvegardée**.

Coût d'un retrait/réajout, mesuré en Phase 1 : la valeur est perdue (`42 → 1`) **et** le
composant repart en fin de collection — donc, désormais, au-dessus de tout le reste au dessin.

| | Option 1 — pas de sélecteur (statu quo) | Option 2 — sélecteur `Type ▼` unique | Option 3 — sélecteur qui préserve |
|---|---|---|---|
| Modèle affirmé | plusieurs renderers, empilés dans l'ordre des Components | un renderer par Object | un par Object, mais changer de type ≠ détruire |
| Changer de type | retirer + ajouter, explicitement, par deux Operations | retrait + ajout **implicite** → perte des valeurs **et** du rang | `REMOVE_COMPONENT` + `ADD_COMPONENT { index }` dans un `batch`, valeurs communes reportées |
| Impact code | nul | Inspector seul | Inspector + une règle de report de valeurs à définir |
| Undo | naturel | l'entrée doit être un `batch`, sinon annuler laisse un objet sans renderer | naturel |
| Contredit le modèle ? | non | **oui** — `editor/registry.js:18-19` documente explicitement que plusieurs renderers coexistent et dessinent tous | non |

**Observation, non recommandation :** l'ordre signifiant renchérit l'option 2, qui affirmerait
dans l'UI l'inverse de ce que le modèle permet, et dont le geste central détruit désormais deux
choses au lieu d'une. L'option 3 est le compromis si l'ergonomie du sélecteur est souhaitée.
C'est une question d'UX produit.

---

## 4. Séquence d'implémentation proposée

**PROPOSITION.** La séquence de la Phase 2 est techniquement cohérente avec le code actuel.
Trois ajustements sont proposés, chacun justifié.

**Ajustement 1 — scinder la première étape.** `PropertyType` et les collections ordonnées n'ont
aucune dépendance mutuelle : l'un touche `definition.js` + `schema.js`, l'autre `object.js` +
`scene.js` + `serialize.js`. Séparés, ce sont deux étapes vertes plus petites — et `PropertyType`
est bloqué par le seul arbitrage C, alors que les collections ne sont bloquées par aucun.

**Ajustement 2 — remonter `Matrix.decompose()`.** C'est une fonction pure, sans dépendance sur
les Operations : elle peut être écrite et testée immédiatement. Seule la **politique de
reparentage** dans l'Editor dépend des Operations. Séparer la fonction de la politique retire
`decompose()` du chemin critique.

**Ajustement 3 — nommer la dépendance de l'étape 6 à l'étape 4.** `type = ResourceId` n'a de
sens que si `ResourceId` existe. L'ordre est déjà correct ; la dépendance mérite d'être écrite
pour ne pas être perdue.

### 4.1 Étapes, dépendances, blocages

| # | Étape | Dépend de | Bloquée par | Fichiers principaux |
|---|---|---|---|---|
| **1a** | Collections ordonnées : stockage interne ordonné, liste de racines ordonnée dans `Scene`, `moveComponent`, sérialisation en tableau, `FORMAT_VERSION` → 2 | — | §8-1 (forme du getter) | `core/object.js`, `core/scene.js`, `core/serialize.js` + `serialize.test.js`, `object.test.js`, `runtime/scripting/behaviors.test.js` |
| **1b** | `PropertyType` au Core ; `FieldKind` dérivé à l'Editor ; `resource` et `array` cessent d'être des impasses | — | **arbitrage C** | `core/definition.js`, `editor/inspector/schema.js` + leurs tests |
| **2** | `invert()` + Operations structurelles + validation (cycles, index, no-op) + `seq` par pipeline | 1a | **arbitrage B** | `core/operations/operation.js`, `core/operations/operations.js`, `core/object.js`, `core/scene.js`, `core/mod.js` |
| **3a** | `Matrix.decompose()` | — | — | `core/math/matrix.js`, `matrix.test.js` |
| **3b** | Politique Editor de reparentage : `batch` = `REPARENT` + cinq `SET_PROPERTY` | 2, 3a | arbitrage B | `editor/commands.js`, `editor/windows/hierarchy.js` |
| **4** | `src/project/` : manifeste, `ResourceId`, `ResourceStore` mémoire ; déclaration de la couche | 1a | — | `src/project/**` *(nouveau)*, `tools/layers/rules.js` |
| **5** | `History` côté Editor, une pile par ressource, annulation par `submit(invert(op))` | 2, 4 | — | `editor/history.js` *(nouveau)*, `editor/editor.js` |
| **6** | Component Definitions : `type` / `label`, réconciliation structurelle, composant manquant préservé | 1b, 4 | **arbitrages C + D** | `core/definition.js`, `core/component.js`, `core/serialize.js`, `editor/registry.js`, `editor/windows/inspector.js` |
| **7** | `GraphResource` + appel de `bind()` par la couche Project | 4, 6 | **arbitrage A** | `src/project/**`, `runtime/scripting/behaviors.js` |

**Règle de sortie de chaque étape :** `tools/test.sh` et `node tools/layers/run.js` verts.

### 4.2 Graphe de dépendances

```
1a ──┬── 2 ──┬── 3b
     │       └── 5
     ├── 4 ──┴── 6 ── 7
1b ──────────────┘
3a ── 3b
```

### 4.3 Ce qui casse à l'étape 1a, nommément

Ce n'est pas de la casse accidentelle : ces tests **encodent** la décision qu'on renverse.

- `core/serialize.test.js:175-186` — assert que l'ordre des clés sérialisées est
  **indépendant** de l'ordre d'attachement. **À inverser**, pas à supprimer : il doit désormais
  assert que l'ordre est **préservé**.
- `core/serialize.test.js:80` — `data.components.Transform.x`. À réécrire si la forme
  sérialisée devient un tableau.
- `runtime/scripting/behaviors.test.js:466` — `data.objects[0].components.Controller`. Idem.
- `core/object.test.js:183` — `object.components.Transform.x`. **Ne casse que si la forme du
  getter change aussi** (§1.4).

---

## 5. Risques

| Domaine | Risque | Gravité | Atténuation |
|---|---|---|---|
| **Sérialisation** | Un test **encode** l'ordre alphabétique (`serialize.test.js:175-186`). Le renverser sans le voir laisserait un test vert qui ment | **élevée** | Le nommer dans l'étape 1a et l'inverser explicitement |
| **Compatibilité du format** | `FORMAT_VERSION` 1 → 2 ; `deserializeScene` **jette** sur une version inconnue (`serialize.js:125`) | faible | Aucun projet v1 n'existe (Q6). Repérer avant l'étape tout fixture écrite en dur au format 1 |
| **Ordre des collections** | Deux consommateurs, pas un : `update` (`runtime.js:137`) **et** `draw` (`scene-renderer.js:60`). Traiter l'ordre comme « l'ordre d'update » ferait rater le second | **élevée** | Fait N2. La règle écrite doit dire *update **et** draw* |
| **Ordre des collections** | Confondre forme sérialisée et forme du getter triple le périmètre de l'étape 1a | moyenne | §1.4 — trancher avant de commencer |
| **Undo/Redo** | Annuler par `apply()` au lieu de `submit()` désynchroniserait en silence : ni arbitrage, ni réplication | **élevée** | Règle écrite dans le module, plus un test vérifiant qu'un undo émet bien `'operation'` |
| **Undo/Redo** | Un `REMOVE_OBJECT` sans sous-arbre **ni index** rend un objet dépouillé, replacé en fin de liste | **élevée** | Test dédié : supprimer un sous-arbre au milieu, annuler, comparer la sérialisation complète |
| **Réplication** | Un identifiant généré par le récepteur au lieu de l'auteur fait diverger les scènes | **élevée** | Règle explicite dans le format des Operations d'ajout |
| **Réplication** | Un gestionnaire d'Operation qui rappellerait une API publique (`addChild`) au lieu de muter le stockage interne resoumettrait une Operation → écho | **élevée** | La propriété anti-écho tient parce qu'`apply()` fait une écriture directe. À préserver dans **chaque** nouveau gestionnaire |
| **Transform / reparentage** | Décomposition inexacte sous cisaillement — non représentable en `(x, y, rotation, scaleX, scaleY)` | moyenne | Cas rare : échelle non uniforme sur un ancêtre **et** rotation intermédiaire. Politique à décider à l'étape 3a |
| **Transform / reparentage** | Un recalcul fait dans le gestionnaire Core plutôt qu'en `batch` Editor ferait recalculer ses propres flottants à chaque nœud → divergence indiagnosticable | **élevée** | C'est la raison pour laquelle la Phase 2 place la politique dans l'Editor |
| **Resources** | Une nouvelle couche mal cadrée peut importer le DOM et casser l'exécution serveur | moyenne | `tools/layers/rules.js` doit déclarer `project` **dans la même étape**, pas après |
| **Graph** | Lier un graphe par identifiant sans résolveur ferait échouer `bind()` silencieusement au chargement | moyenne | Dépend de l'arbitrage A ; à couvrir par un test de chargement de projet |
| **Terminologie** | « Composer » subsiste dans `src/editor/ui/tabs.js:10` | faible mais durable | À corriger avec l'étape qui touchera `editor/ui/` ; une lecture future prendrait ce commentaire pour normatif |

---

## 6. Frontières architecturales visées

**PROPOSITION**, reprise de la Phase 2 §13 et inchangée.

| Responsabilité | Core | Runtime | Editor | Project |
|---|---|---|---|---|
| `Object` — structure, ordre, identité, `name` / `tag` | **possède** | lit | lit, mute via Operations | sérialise via Core |
| `Scene` — objets, racines ordonnées, pipeline | **possède** | lit, exécute | lit, mute via Operations | charge / sauve |
| Component Definition — forme | **possède la forme** | lit le graphe via `Behaviors` | édite via Operations | **possède le stockage** |
| Component Instance — valeurs | **possède** | lit, exécute | affiche, mute via Operations | sérialise via Core |
| `Resource` | — | — | consomme | **possède** |
| `.px` / `GraphResource` | transporte, **n'interprète jamais** | **interprète** | édite (fenêtre `Graph`) | **stocke** |
| Operations — format, pipeline, `invert()` | **possède** | — | émet | émet (portée projet) |
| Undo/Redo — pile, raccourcis | fournit `invert()` | — | **possède** | — |
| Sérialisation Scene / Object / Component | **possède** | — | — | appelle |
| Sérialisation manifeste / ressources | — | — | — | **possède** |
| Chargement | — | — | déclenche | **possède** |
| UI, sélection, `viewState`, onglets | — | — | **possède** (ADR-0017) | — |

**Règle de dépendance visée :** `editor/ → project/ → core/`, `runtime/ → core/`,
`core/ → (rien)`.

---

## 7. ADR à mettre à jour ou à créer

**Aucun ADR n'a été modifié ni créé.** Un ADR n'est écrit qu'après un arbitrage explicite.

### 7.1 ADR existants à mettre à jour — après arbitrage seulement

| ADR | Décision concernée | Modification nécessaire | Bloquant |
|---|---|---|---|
| **ADR-0004** | « La clé de `object.components` reste le nom du type » | Si l'arbitrage D retient le `type` opaque : préciser que la clé reste le type, et que le type d'un Component utilisateur est son identité de ressource, pas son nom affiché | **oui** (arbitrage D) |
| **ADR-0008** | Liste des Operations : `ADD_CHILD`, `REMOVE_CHILD`, aucune de réordonnancement | Si l'arbitrage B retient la fusion : remplacer les deux par `REPARENT { object, parent, index }`, ajouter `MOVE_COMPONENT` | **oui** (arbitrage B) |
| **ADR-0016** | Exemple JSON avec graphe inline | Si l'arbitrage A retient la référence : fermer le point ouvert « format de fichier et stockage d'une définition » | **oui** (arbitrage A) |
| **ADR-0007** | Types de propriétés envisagés | `PropertyType` (Core) / `FieldKind` (Editor) ; `vector2` et `action` écartés avec motif ; `range` dérivé. **Et** consigner la section `Object` de l'Inspector, aujourd'hui non documentée | non |
| **ADR-0009 / 0015 / 0016** | « Qui appelle `bind()` » — point ouvert dans les **trois** | Consigner que la couche Project l'appelle | non (étape 7) |
| **ADR-0002** | Valeurs de Transform locales, monde dérivé | **Aucune.** La politique de reparentage la respecte : le monde reste dérivé, les écritures restent locales | — |
| **ADR-0017** | Sélection = Editor | **Aucune.** `OpenEditor` et `viewState` suivent la même règle | — |

### 7.2 ADR à créer — aucun ne doit être écrit avant arbitrage

Numérotation **indicative** ; elle dépendra de l'ordre réel des acceptations.

| Provisoire | Sujet | Débloqué par |
|---|---|---|
| ADR-0018 | Ordre structurel signifiant et persistant ; collections ordonnées ; `FORMAT_VERSION` 2 | §8-1 |
| ADR-0019 | Operations structurelles, `invert()`, `REPARENT` unifié | arbitrage B |
| ADR-0020 | `Resource` / `ResourceId` / `ResourceStore` ; ni `Document` ni `Asset` ; couche `src/project/` | — |
| ADR-0021 | Identité d'une définition : `type` stable / `label` affiché | arbitrage D |
| ADR-0022 | Transform au reparentage : monde préservé, composé dans l'Editor | — |
| ADR-0023 | `PropertyType` (Core) / `FieldKind` (Editor) | arbitrage C |
| ADR-0024 | Undo/Redo : `invert()` au Core, `History` à l'Editor, une pile par ressource | — |

### 7.3 Documentation d'architecture qui deviendrait obsolète

`ARCHITECTURE.md` §6.2 (liste des Operations) et §9 (Ressources, décrites comme intention).
`MIGRATION_STATUS.md`, section « Laissé volontairement pour plus tard », perdrait trois lignes.

### 7.4 Décisions qui ne demandent probablement pas d'ADR

- **La terminologie `Graph` / `Composer`** relève du vocabulaire produit : `PROJECT.md` §2 en
  est le lieu naturel. **Proposition, non appliquée.**
- **`Object` section intrinsèque de l'Inspector** confirme le code existant et la direction
  d'ADR-0001, ADR-0002 et ADR-0007. Une note dans ADR-0007 suffirait — mais il faut la faire :
  **aucun ADR ne documente cette section aujourd'hui**.

---

## 8. Décisions requises avant implémentation

**Rien ne commence avant ces arbitrages.** Par ordre de blocage.

1. **Forme du getter `object.components` en mémoire** — reste-t-il un objet gelé à clés
   ordonnées, ou devient-il une collection indexée ? *(bloque l'étape 1a ; facteur trois sur
   son périmètre — voir §1.4)*
2. **Arbitrage B** — `ADD_CHILD` / `REMOVE_CHILD` fusionnés dans
   `REPARENT { object, parent, index }` ? *(bloque l'étape 2 ; met à jour ADR-0008)*
3. **Arbitrage C** — retirer le type `object` de `DEFAULTS` ? *(bloque l'étape 1b ; deux
   lignes de code)*
4. **Arbitrage D** — `type` opaque pour les Components utilisateur, `label` pour l'affichage ?
   *(bloque l'étape 6 ; met à jour ADR-0004)*
5. **Arbitrage A** — le graphe d'une définition référencé par `ResourceId` ou inline ?
   *(bloque l'étape 7 ; met à jour ADR-0016)*
6. **Arbitrage E** — le sélecteur `Renderer [ Type ▼ ]` doit-il rester unique ? *(ne bloque
   rien, mais l'ordre signifiant en change le coût : à trancher avant que l'Inspector soit
   retouché à l'étape 6)*
7. **Validation de la séquence** — les trois ajustements du §4 sont-ils retenus ?

---

## 9. Renvois

| Sujet | Document |
|---|---|
| Audit du modèle existant | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md) |
| Proposition d'architecture, alternatives rejetées | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md) |
| Avancement de la migration, questions ouvertes | [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md) |
| Comportement réel de Legacy | [`LEGACY_ANALYSIS.md`](LEGACY_ANALYSIS.md) |
| Vocabulaire produit, périmètre | [`../PROJECT.md`](../PROJECT.md) |
| Architecture v2, registre des décisions | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Règles d'écriture et d'étiquetage | [`../CONVENTIONS.md`](../CONVENTIONS.md) |
| Décisions acceptées | [`../decisions/`](../decisions/) — ADR-0001 à ADR-0017 |
