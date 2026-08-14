# Audit architectural — Phase 1

**Périmètre :** fondations du modèle de données (Components utilisateur, graphe `.px`,
Document / Resource / Scene / Object / Component, ordre structurel, socle Undo/Redo).
**Date :** 2026-08-14
**Aucun fichier du dépôt n'a été modifié.**

---

## 0. Méthode, et ce qu'elle ne couvre pas

Ce qui a été fait :

- lecture des refs et du reflog Git directement dans `.git/` ;
- lecture de `src/core`, `src/runtime`, `src/editor`, `docs/`, les 17 ADR, `tools/` ;
- exécution de la suite de tests et du contrôle de couches sur une **copie** du dépôt ;
- une sonde d'exécution jetable (hors dépôt) pour **mesurer** le comportement de l'ordre
  et de la sérialisation, au lieu de le déduire du code.

Limites, à signaler explicitement :

| Limite | Conséquence |
|---|---|
| Aucun shell n'est exposé sur ta machine dans cette session | **`git status` n'a pas pu être exécuté.** L'état de propreté du working tree est déduit, pas vérifié |
| `legacy/` et `tools/parity/baseline/` non copiés | **`tools/parity/run.js` n'a pas été exécuté.** Les 39 scénarios de parité ne sont pas revalidés ici |
| Tests exécutés sur une copie, pas in situ | Node 22.22.2 côté sandbox. La version Node de ta machine n'est pas connue |

Rien dans ce rapport n'est déduit de l'UI.

---

## 1. État réel du dépôt

### Références

```
HEAD                     -> refs/heads/master
refs/heads/master        =  19107304aabaeee5a29c340c3f4d81d7219de490
refs/remotes/origin/master = 19107304aabaeee5a29c340c3f4d81d7219de490
remote origin            =  https://github.com/Sharkou/PixelCreator.git
```

**Local et `origin/master` sont strictement alignés** : 0 commit en avance, 0 en retard.

### Correction à ton point de départ

> « Dernier commit : "Refine editor interactions and viewport controls" »

**C'est HEAD~1, pas HEAD.** Le dernier commit est :

```
19107304  docs: move reference documentation      2026-08-14 13:07:50 UTC   <- HEAD
70de6ba0  Refine editor interactions and viewport controls   12:55:47 UTC
85740f11  Converge editor UI to modern layout
```

Ce commit a déplacé la documentation de référence (`docs/reference/**`, 45 fichiers).
Il est poussé sur `origin/master`.

### Le reflog montre une réécriture d'historique

```
85740f11 -> d71804c7   commit: Refine editor interactions and viewport controls   12:36:15
d71804c7 -> 85740f11   reset: moving to HEAD~1                                    12:37:50
85740f11 -> 70de6ba0   commit: Refine editor interactions and viewport controls   12:55:47
70de6ba0 -> 19107304   commit: docs: move reference documentation                 13:07:50
```

`d71804c7` est **orphelin** : le commit « Refine editor interactions » a été défait puis
refait sous un autre SHA. `ORIG_HEAD` pointe encore dessus. Ce n'est pas un problème en
soi — `origin/master` est cohérent avec l'état local — mais c'est à savoir si tu comptais
sur ce SHA quelque part.

Détail sans gravité : `packed-refs` contient encore un `origin/master` périmé
(`a52633bc`), masqué par la ref lâche. Normal après un `fetch`.

### Working tree

`git status` n'a pas pu être exécuté. Indice indirect : **aucun fichier** de `src/`,
`docs/`, `tools/`, `design/` n'a une date de modification postérieure au dernier commit
(le plus récent est à 12:45:45 UTC, le commit à 13:07:50 UTC). C'est **cohérent** avec un
working tree propre, ce n'est pas une preuve — un `git status` de ta part lèvera le doute
en une seconde.

---

## 2. Tests exécutés avant toute analyse

```
tools/test.sh              497 tests, 497 passés, 0 échec   (4,5 s)
node tools/layers/run.js   profil v2 : 0 import interdit sur 325 imports scannés
                           profil legacy : ignoré (legacy/ absent de la copie)
```

`MIGRATION_STATUS.md` annonçait 480 tests / 318 imports après l'étape 3.5 ; on est à
497 / 325 après les deux derniers commits. Cohérent.

**Non exécuté :** `tools/parity/run.js` (39 scénarios) — voir §0.

---

## 3. Ce qu'est le modèle, aujourd'hui, fait par fait

### 3.1 Object — `src/core/object.js`

Un `Object` est un `Proxy` réactif dont l'état interne vit sous un `Symbol` (`STATE`),
donc invisible à l'énumération et à la sérialisation.

**État interne** (`object.js:54-69`) :

```js
{
    components: new Map(),   // type -> instance     <- ordre = ordre d'attachement
    exposed:    new Map(),   // prop -> composant fournisseur (façade, ADR-0002)
    children:   [],          // tableau              <- ordre = ordre d'ajout
    parent:     null,
    scene:      null,
    notify:     null,        // fourni par la Scene
    detachedOperations: null
}
```

**Propriétés propres** (donc sérialisées) : `id` (non writable), `name`, `tag`, `layer`,
`active`, `visible`, `lock`, `owner`.

**API structurelle** : `addComponent`, `removeComponent`, `getComponent`, `hasComponent`,
`addChild`, `removeChild`, plus `setProperty` / `observe`.

- `addChild` fait `children.push(child)` (`object.js:297`) — **toujours en fin**.
- `removeChild` fait `indexOf` + `splice` (`object.js:313-316`).
- `get components` renvoie un **snapshot gelé**, dont l'ordre des clés est l'ordre
  d'insertion de la `Map`.
- `get children` renvoie une **copie** du tableau.

**Aucune primitive de déplacement à un index n'existe.**

### 3.2 Component — `src/core/component.js`

Pas de classe de base, contrat en duck-typing (ADR-0004) : `update`, `draw`, `bounds`,
`onAttach`, `onDetach`, `static type`, `static exposes`, `static schema`.

Un `ComponentRegistry` résout `type -> classe` pour la désérialisation, avec un
`register(Class, { replace })` explicitement prévu pour la réédition d'un composant
utilisateur (`component.js:157`).

**Un Object porte au plus un composant par type** (Q4, tranchée). `addComponent` d'un type
déjà présent **jette** au lieu de remplacer silencieusement.

### 3.3 Scene — `src/core/scene.js`

Collection **plate** : `Map<id, Object>`. La hiérarchie est un lien parent/enfant entre
objets de la scène, pas un imbriquement de stockage.

- `objects()` → ordre d'insertion de la `Map` ;
- `roots()` → `objects().filter(o => !o.parent)`, donc **ordre d'insertion**, pas un ordre
  propre aux racines ;
- la Scene possède le pipeline `Operations` : c'est l'unité de réplication ;
- elle émet six événements de structure : `added`, `removed`, `component:added`,
  `component:removed`, `child:added`, `child:removed`.

> Coquille documentaire : le commentaire de `scene.js:83` dit « ces cinq événements » et en
> liste six. Cosmétique.

**Aucune primitive de réordonnancement des objets n'existe.** `Scene.add()` d'un objet déjà
présent renvoie l'objet sans rien changer — on ne peut donc pas réinsérer pour réordonner.

### 3.4 Sérialisation — `src/core/serialize.js`

`FORMAT_VERSION = 1`. Explicite, jamais par énumération accidentelle.

- `serializeObject` : liste de champs fixe, `parent` = id, `children` = tableau d'ids
  (**ordonné**), `components` = objet ;
- `serializeComponent` : clés du `static schema` s'il existe, sinon propriétés propres ;
  `active` ajouté hors schéma ;
- `serializeComponents` : **trie les types par ordre alphabétique** (`serialize.js:151-155`) ;
- `deserializeScene` : deux passes, les liens `children` sont restaurés **dans l'ordre
  enregistré**.

### 3.5 Operations — `src/core/operations/`

```js
export const OperationType = { SET_PROPERTY: 'SET_PROPERTY' };
```

**Un seul type d'opération existe.** Une Operation est gelée et porte
`{ type, target: { object, component }, prop, value, previous, origin, actor, batch, seq }`.

Le pipeline `Operations` a deux entrées, et c'est tout le design anti-écho :

| | Autorité | Émet `'operation'` |
|---|---|---|
| `submit(op)` | oui | oui |
| `apply(op)` | non | non |

`Operations.register(type, handler)` est **déjà** la couture d'extension : Scene et Object
peuvent enregistrer leurs opérations structurelles sans que le pipeline connaisse le modèle.
Personne ne s'en sert aujourd'hui.

### 3.6 Réplication

`src/network/` **n'existe pas**. Le point de branchement est
`scene.operations.on('operation', …)`. Rien d'autre n'est écrit.

### 3.7 Runtime — `src/runtime/`

`Runtime.step()` (`runtime.js:135-165`) :

```js
for (const object of this.#scene.objects()) {          // ordre d'insertion Scene
    const components = object.components;
    for (const type of Object.keys(components)) {      // ordre d'ATTACHEMENT
        component.update(object, context);
        this.#behaviors?.behaviorFor(component)?.update?.(object, context);
    }
}
```

`SceneRenderer.#drawOrder()` trie par `layer` ; le tri JS étant stable, l'ordre d'insertion
de la scène départage à `layer` égal.

`Behaviors` (`runtime/scripting/behaviors.js`) tient `type -> graphe`,
`graphe -> fabrique` et `composant -> { graph, behavior }`. **Il ne contient ni modèle de
graphe, ni interprète** : `interpret` lui est passé en paramètre.

### 3.8 Editor — `src/editor/`

Verdict : **l'Editor est bien un pur consommateur du Core.** Vérifié, pas supposé.

- `hierarchy.js` lit `scene.roots()` et `object.children` ; aucune arborescence parallèle ;
- `inspector.js` lit `object.components` puis `componentSchema()` ou la réflexion ;
  aucun `if (type === '…')` ;
- `selection.js` est un état d'Editor, non répliqué, absent du Core (ADR-0017) ;
- `commands.js` est mince et se déclare lui-même point d'insertion des Operations
  structurelles et de l'undo ;
- le contrôle de couches passe : 0 import interdit sur 325.

Et surtout, le seul endroit où l'Editor a rencontré une capacité manquante du Core, il a
**refusé de contourner** et l'a écrit (`inspector.js:99`) :

> *« it reserved room for a drag handle that does not exist (component order is a Core
> capability the model does not expose yet, see the report) »*

**Aucun drag & drop de réordonnancement n'existe** dans l'Editor — ni dans la Hierarchy, ni
dans l'Inspector.

### 3.9 `px-tabs`

`src/editor/ui/tabs.js`, 118 lignes, **zéro consommateur**, enregistré par `editor.js`.
Le fichier documente déjà son rôle futur et la liste de ce qui ne doit **pas** être
construit maintenant (cycle de vie, fermeture, overflow, drag, détachement). Conforme à ta
consigne : rien à faire, rien à supprimer.

---

## 4. Point critique — l'ordre structurel

### 4.1 Ce que j'ai mesuré, pas déduit

Sonde exécutée hors dépôt, sur le Core réel :

```
ordre d'attachement (= ordre d'exécution runtime, = ordre Inspector) : [ Zeta, Alpha ]
ordre des clés sérialisées                                           : [ Alpha, Zeta ]
après aller-retour serialize -> deserialize                          : [ Alpha, Zeta ]

ordre des enfants                    : [ a, b ]
enfants après aller-retour           : [ a, b ]        <- préservé

valeur d'un composant après remove + re-add : 42 -> 1  <- perdue
```

### 4.2 Contradiction documentée à trancher avant tout le reste

Deux fichiers du Core affirment le contraire l'un de l'autre :

| Fichier | Affirmation |
|---|---|
| `serialize.js:151` | *« component type carries no ordering meaning »* → tri alphabétique |
| `runtime.js:113` | *« Every component's `update(self, ctx)` runs […] in scene insertion order »* → l'ordre d'attachement **est** l'ordre d'exécution |

Conséquence concrète, aujourd'hui, sans rien changer : **sauvegarder puis recharger un
projet change l'ordre d'exécution des composants d'un objet.** Deux composants dont l'un
lit ce que l'autre écrit dans le même pas ne se comportent pas pareil avant et après une
sauvegarde.

C'est un défaut **antérieur** à la question du réordonnancement, et c'est le premier à
régler : ajouter un `moveComponent()` sur un modèle dont l'ordre ne survit pas à un
aller-retour donnerait une primitive dont le résultat s'efface au chargement suivant.

Deux issues cohérentes, mutuellement exclusives — **c'est une décision qui t'appartient** :

- **A.** L'ordre des composants est signifiant → la sérialisation doit le préserver (le tri
  alphabétique disparaît, ou un champ d'ordre explicite apparaît) et une primitive de
  déplacement a un sens.
- **B.** L'ordre des composants n'est pas signifiant → le runtime ne doit pas en dépendre
  (ordre d'exécution défini autrement : par le type, par une priorité déclarée…), et
  « réordonner un Component » redevient une pure préférence d'affichage de l'Inspector,
  qui n'a alors rien à faire dans le Core.

Je ne tranche pas : c'est structurant, et la réponse change ce qu'on écrit dans le Core.

### 4.3 Inventaire exact de ce qui manque

| Besoin | Existe ? | Ce qu'il y a à la place |
|---|---|---|
| Déplacer un Component à un index | **non** | rien |
| Déplacer un enfant à un index | **non** | `addChild` = push en fin |
| Réordonner les racines d'une Scene | **non** | ordre d'insertion de la `Map`, non modifiable |
| Opération `MOVE` / `REORDER` | **non** | `OperationType` ne contient que `SET_PROPERTY` |
| Contournement remove + re-add | possible | **détruit les valeurs et place en fin** — mesuré |

Point important pour la Phase 2 : la liste d'opérations planifiée par ADR-0008 et
`ARCHITECTURE.md` §6.2 est `SET_PROPERTY`, `ADD_OBJECT`, `REMOVE_OBJECT`, `ADD_COMPONENT`,
`REMOVE_COMPONENT`, `ADD_CHILD`, `REMOVE_CHILD`, `ADD_RESOURCE`, `REMOVE_RESOURCE`.
**Aucune opération de réordonnancement n'y figure.** En ajouter une n'est pas une
contradiction d'ADR, mais c'est une extension d'une décision documentée : elle demande ton
accord explicite.

---

## 5. Components utilisateur

### 5.1 Les quatre notions sont déjà distinctes dans le code

Aucune abstraction supplémentaire n'est nécessaire — le modèle existant les sépare déjà :

| Notion | Où elle vit | Forme |
|---|---|---|
| **Component natif** | `core/components/transform.js`, `runtime/rendering/components/*` | classe JS écrite à la main |
| **Component utilisateur** | produit par `defineComponent()` | classe JS **générée**, indistinguable en aval |
| **Définition de Component** | `core/definition.js` | enregistrement JSON `{ type, properties, graph }`, posé sur la classe (`static definition`) |
| **Instance de Component** | attachée à un Object | `Proxy` réactif ne portant **que des valeurs** |

`defineComponent()` construit la classe **sans `eval` ni `new Function`**, pose
`static type`, `static schema`, `static definition`, et initialise chaque clé du schéma à
son défaut (conteneurs copiés par instance). C'est propre et c'est déjà testé.

### 5.2 Ce qui manque réellement

| Manque | Gravité | Détail |
|---|---|---|
| **Identité d'une définition** | **structurel** | Une définition est identifiée par son seul `type` (une chaîne). Renommer un Component utilisateur crée un type différent : au chargement, `registry.create(type)` **jette** et toutes les instances existantes sont orphelines. ADR-0010 pose que « les noms ne sont pas des identités » pour les Objects ; les définitions y contreviennent aujourd'hui |
| **Persistance** | bloquant | Rien n'écrit ni ne lit une définition. Pas de `Resource`, pas de fichier, pas de chargeur |
| **Qui appelle `register` / `bind`** | bloquant | Point ouvert explicite d'ADR-0016 et d'ADR-0015 |
| **Validation des `properties`** | réel | `defineComponent` vérifie seulement que chaque entrée est un objet. Ni le `type` déclaré, ni `min`/`max`, ni `values` ne sont validés |
| **Migration des instances** | connu | Point ouvert d'ADR-0016, renvoyé à l'Editor |

### 5.3 Deux vocabulaires de types de propriétés, dans deux couches, sans source commune

C'est le second défaut réel que l'audit fait apparaître, et il touche directement les
Components utilisateur :

| `core/definition.js` — `DEFAULTS` | `editor/inspector/schema.js` — `FieldKind` |
|---|---|
| `number`, `int`, `boolean`, `string`, `color`, `array`, `object` | `number`, `int`, `range`, `boolean`, `string`, `color`, `enum`, `readonly` |

- `array` et `object` ont un défaut dans le Core mais **retombent en `READONLY`** dans
  l'Inspector : une propriété tableau d'un Component utilisateur ne serait pas éditable.
- `enum` et `range` sont éditables mais **n'ont aucun défaut** côté Core : une propriété
  `enum` sans `default` explicite démarre à `null`.
- `resource` est listé dans ADR-0007 comme type envisagé et **n'existe nulle part**.
- `vector2` et `action` sont listés dans ADR-0007, absents des deux côtés.

Tant que le vocabulaire de types n'a pas une source unique, tout Component utilisateur peut
déclarer une propriété que l'Inspector refuse d'éditer ou que le Core initialise mal.

Sur ta consigne « ne pas implémenter des types pour faire la liste » : les seuls types dont
le besoin est **démontré** par le chantier en cours sont `enum` (déjà rendu par l'Inspector,
sans défaut Core) et `resource` (indispensable dès qu'un Component utilisateur référence un
graphe, une image ou un autre Component). `array` et `object` sont déjà à moitié présents et
créent une incohérence par leur seule existence — les fermer coûte moins cher que les
laisser.

---

## 6. Le graphe `.px`

### 6.1 Ce qui est déjà tranché par les ADR — ne pas rouvrir

| Question | Réponse | Source |
|---|---|---|
| `.px` est-il du JavaScript ? | **Non.** Ressource JSON structurée, MIME `application/px`, jamais `import()` | ADR-0009 |
| Interprété ou compilé ? | **Interprété.** Pas d'`eval`, pas de `new Function` | ADR-0009, Q7 |
| `.px` produit-il un type de Component ? | **Non, jamais.** Il est le *comportement* d'un type qui existe déjà | ADR-0015, ADR-0016 |
| Où le graphe est-il rattaché ? | Au **type**, pas à l'instance | ADR-0015 §1, ADR-0016 §3 |
| Le graphe est-il sérialisé avec l'instance ? | **Non.** Une scène de mille `Controller` porte mille `speed` et un seul graphe | ADR-0016 §3 |
| Le graphe est-il mutable ? | **Non.** Éditer = produire un nouveau graphe et `bind()` | ADR-0016 §7 |
| Le Core lit-il le graphe ? | **Non.** Donnée opaque transportée ; l'interprétation appartient au Runtime | ADR-0016 §5 |
| Forme du graphe | `{ version, nodes[], connections[], variables[], metadata }` | ADR-0009 |

### 6.2 Ce qui n'est pas tranché

| Point ouvert | Statut |
|---|---|
| **Le modèle de graphe lui-même et son interprète** | 0 ligne de code. C'est ce que `MIGRATION_STATUS.md` désigne comme « ce qui manque » pour l'étape 4 |
| Devenir des `variables` d'un graphe vis-à-vis du schéma du Component | ouvert dans ADR-0009 **et** ADR-0015 |
| Qui charge et appelle `bind()` | ouvert dans ADR-0009, ADR-0015, ADR-0016 |

### 6.3 Resource / Document / Asset — rien n'existe

C'est le trou le plus large de l'audit, et il conditionne tout le reste :

- **`Resource` n'existe pas** dans `src/`. `ARCHITECTURE.md` §9 le décrit comme un futur
  (id stable indépendant du chemin, plus de DataURL base64, révocation des Blob URL,
  IndexedDB en cache).
- **`Document` n'existe nulle part**, ni dans le code, ni dans les ADR, ni dans
  `ARCHITECTURE.md`. C'est un mot de ta consigne, pas un concept du dépôt.
- **`Asset` n'apparaît que dans une maquette** (`<px-assets>` dans `ARCHITECTURE.md` §5.2)
  et dans le texte de la coquille `px-project`.

Autrement dit : les relations Document ↔ Resource ↔ Scene ↔ `.px` ne sont pas « à retrouver
dans les ADR » — **elles n'y sont pas**. C'est le point qui demandera une vraie décision
d'architecture en Phase 2, et c'est aussi le préalable de `px-tabs`, du Composer, du
chargement de projet et de `behaviors.bind()`.

Ce que le code impose déjà comme contraintes à cette future décision :

1. La Scene est l'unité de réplication (elle possède le pipeline `Operations`).
2. Le Core ne doit rien apprendre du graphe (ADR-0016 §5) — donc une `Resource` graphe est
   du transport, pas de l'interprétation.
3. Une définition est du JSON pur, donc stockable comme une ressource, versionnable et
   diffable.
4. Le Core ne dépend de rien : `Resource` ne peut pas amener DOM, `fetch` ou IndexedDB
   dans `core/`.

---

## 7. Undo / Redo

### 7.1 Rien n'existe

Aucun module d'historique, aucune pile, aucun `undo()` dans `src/`. Les seules occurrences
du mot sont des commentaires d'intention.

### 7.2 Ce qui est déjà prêt

- Chaque `SET_PROPERTY` porte **`previous`** — c'est précisément ce qui rend l'inversion
  possible ;
- **`batch`** existe sur chaque opération : un drag = une entrée d'historique ;
- `scene.operations.on('operation', …)` est la couture d'enregistrement, déjà testée
  (`core.test.js:145`, *« operations carry what undo will need »*) ;
- la séparation `submit` / `apply` fait qu'un undo rejoué par `apply()` **ne réémet rien** —
  donc pas de boucle, ni locale, ni réseau ;
- `Operations.register(type, handler)` permet d'ajouter des types sans toucher au pipeline.

### 7.3 Ce qui bloque ta liste de mutations

| Mutation | Représentable aujourd'hui ? |
|---|---|
| Modify Property | **oui** |
| Rename | oui (c'est un `SET_PROPERTY` sur `name`) |
| Create / Delete | **non** — pas de type d'opération, et un `Delete` doit transporter le sous-arbre sérialisé pour être inversible |
| Add Component / Remove Component | **non** — un `Remove` doit transporter les valeurs du composant |
| Move (reparentage) | **non** |
| Reorder | **non** — et voir §4.2 : il faut d'abord décider si l'ordre est signifiant |

### 7.4 Un détail à connaître avant qu'il ne durcisse

`seq` est un compteur **de module** (`operation.js:14`), global au processus et partagé par
toutes les scènes. C'est sans conséquence aujourd'hui. Ça en aura une le jour où `seq`
devient un numéro de séquence réseau ou une clé d'ordre d'historique.

---

## 8. Liste des incohérences relevées

Classées par gravité, toutes vérifiées dans le code :

1. **Ordre des composants** — signifiant au runtime, alphabétique à la sérialisation.
   Change le comportement d'un projet après un aller-retour. *(§4.2)*
2. **Deux vocabulaires de types de propriétés** — `DEFAULTS` du Core et `FieldKind` de
   l'Editor divergent, sans source commune. *(§5.3)*
3. **Identité d'une définition de Component** — le nom fait office d'identité, ce que
   ADR-0010 refuse ailleurs. *(§5.2)*
4. `scene.js:83` annonce « cinq événements » et en liste six. Cosmétique.
5. `inspector.js:99` renvoie à « the report » — un document d'audit qui n'est pas dans
   `docs/`. Traçabilité.

---

## 9. Décidé / non décidé — tableau de synthèse

| Sujet | Statut | Source |
|---|---|---|
| Object reste `Object`, `children`, `owner` | **décidé** | ADR-0001 |
| Transform est un Component, `object.x` façade | **décidé** | ADR-0002 |
| `x =` direct vs `setProperty()` contrôlé | **décidé** | ADR-0003 |
| Un seul Component par type, duck-typing | **décidé** | ADR-0004, Q4 |
| Inspector piloté par schéma, repli réflexif | **décidé** | ADR-0007 |
| Toute mutation représentable en Operation | **décidé** | ADR-0008 |
| `.px` = graphe JSON interprété | **décidé** | ADR-0009, Q7 |
| Un graphe est le comportement d'un **type** | **décidé** | ADR-0015 |
| Définition = `type` + propriétés + graphe | **décidé** | ADR-0016 |
| Sélection = concern Editor uniquement | **décidé** | ADR-0017 |
| **Ordre des Components : signifiant ou non** | **NON DÉCIDÉ** | contradiction §4.2 |
| **Opérations de réordonnancement** | **NON DÉCIDÉ** | absentes de la liste ADR-0008 |
| **Identité d'une définition** | **NON DÉCIDÉ** | — |
| **Vocabulaire unique des types de propriétés** | **NON DÉCIDÉ** | ADR-0007 liste des intentions |
| **`Resource` : forme, identité, chargement** | **NON DÉCIDÉ** | `ARCHITECTURE.md` §9, intention seule |
| **`Document` : le concept n'existe pas** | **NON DÉCIDÉ** | absent du dépôt |
| **Modèle de graphe et interprète `.px`** | **NON DÉCIDÉ** | 0 ligne |
| **Qui appelle `register` / `bind`** | **NON DÉCIDÉ** | point ouvert ×3 ADR |
| Migration des instances si définition change | **NON DÉCIDÉ** | ADR-0016, renvoyé à l'Editor |
| Q8 — `Renderer [ Type ▼ ]` unique | **ouvert** | `MIGRATION_STATUS.md` |

---

## 10. Les décisions que je ne prends pas

Conformément à la consigne, je m'arrête ici. Quatre décisions sont structurantes et
conditionnent tout ce que la Phase 2 pourrait proposer. Aucune ne peut être inventée à
partir du code ou des ADR :

1. **L'ordre des Components d'un Object est-il signifiant ?** (§4.2, issue A ou B). Tout le
   reste du chantier « réordonnancement » en découle.
2. **Le réordonnancement devient-il une Operation de premier rang** (`MOVE_COMPONENT`,
   `MOVE_CHILD`, `MOVE_OBJECT`), donc réplicable et annulable — ou reste-t-il hors du
   protocole ? ADR-0008 ne l'a pas prévu.
3. **Qu'est-ce qu'une `Resource`, et existe-t-il un `Document` ?** C'est le préalable du
   `.px`, du Composer, du chargement de projet et de `px-tabs`. Rien dans le dépôt ne
   permet de le déduire.
4. **Une définition de Component a-t-elle une identité stable distincte de son nom ?**
   Sans réponse, renommer un Component utilisateur casse les projets qui l'utilisent.

Dis-moi comment tu veux trancher — ou demande-moi une Phase 2 qui présente les options
chiffrées, avec pour chacune : impact Core / Runtime / Editor / sérialisation /
réplication / Undo-Redo, risques et alternatives écartées.

**Aucun fichier modifié. Aucun commit. Aucun push.**
