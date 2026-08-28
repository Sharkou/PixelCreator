# ADR-0034 — Un graphe atteint d'autres Objects par un handle, jamais par une identité de scène

- **Statut :** **accepté** (2026-08-21)
- **Amendé par :** ADR-0039 (2026-08-27) — §7 (une cible désignée redevient un paramètre), §3.7 (le dépôt d'une Resource est autorisé)
- **Amendé par :** ADR-0040 (2026-08-28) — §3.3 : `Get`/`Set Property On` fusionnent avec `Get`/`Set Property` ; §3.2 : l'avertissement « prise Object vide » ne vaut que pour un port qu'aucun paramètre ne peut remplir, et le dépôt d'un **Component** dans un graphe est retiré
- **Décide :** ce qu'un graphe `.px` peut atteindre en dehors de son propre Component
- **Dépend de :** ADR-0010 (identité par ID), ADR-0015 (un graphe est le comportement d'un type), ADR-0018 (ordre structurel), ADR-0021 (identité de Component), ADR-0023 (`PropertyType`), ADR-0026 (`.px` = une ressource, drag & drop), ADR-0027 (modèle de graphe), ADR-0030 (références), ADR-0031 (valeurs autorisées), ADR-0033 (rangées et gestes)
- **Amende :** ADR-0023 §2, ADR-0027 §2 et §11, ADR-0031 §1
- **Ferme :** le point ouvert d'ADR-0033 (« les références à un Object ou à un Component dans le graphe »)
- **Ne décide pas :** l'ordre d'exécution de `Runtime.step()` — voir ADR-0035

---

## 1. Problème

Un `.px` ne peut lire et écrire que **son propre** Component. Un créateur ne peut donc pas
écrire « la porte s'ouvre quand le joueur la touche » sans passer par du JavaScript.

Deux faits mesurés dans le dépôt cadrent la solution, et aucun des deux n'était écrit.

**L'interprète tient déjà l'accès.** `io` porte `self` et `ctx.scene`
(`runtime/scripting/interpreter.js:255`, `runtime/runtime.js:127`). Il ne manque pas un
accès : il manque un **type** capable de faire circuler un Object entre deux nœuds.

**L'ordre de `Scene.objects()` est fonction de l'historique, pas de l'état.** Mesuré sur la
vraie pipeline d'Operations : trois objets taggés `enemy`, suppression du premier par
`deleteObject()` puis application de l'Operation inverse. L'état est identique — ordre
hiérarchique `A,B,C` avant comme après — et `findByTag` répond `A` puis `B`. La
sérialisation normalise par ailleurs l'ordre d'insertion vers l'ordre hiérarchique
(`core/serialize.js:110`), donc un client démarré depuis un instantané n'a pas le même
`objects()` qu'un client qui a rejoué les opérations.

---

## 2. Invariants

1. Un `.px` est de portée **projet** : aucune identité de scène n'entre dans son payload.
2. Aucun **champ sémantique** du format de graphe ne peut représenter ou résoudre une
   identité d'Object de scène. Une chaîne arbitraire reste une chaîne : ce qui est interdit
   est la **sémantique**, portée par le catalogue de nœuds, jamais par le payload.
3. Un handle n'est jamais persisté, ni sérialisé, ni mémoïsé au-delà d'un pas de flux.
4. Une référence persistante vers un Object est une **valeur d'instance** — une valeur
   portée par un Component attaché.
5. Un nœud ne produit aucune Operation et ne frappe aucune identité.
6. Tout parcours de scène observable par le graphe utilise un ordre **canonique**, fonction
   de l'état répliqué et non de l'historique de construction.
7. Tout objet d'une Scene est atteignable depuis ses roots.

### Vocabulaire

Le mot « instance » désignait deux choses. Il en désigne désormais **une**.

| Terme | Définition | Portée | Persisté |
|---|---|---|---|
| **type de Component** | ce que `defineComponent()` produit ; identité = `componentType`, une `ResourceId` pour un `.px` | projet | oui, dans le `.px` |
| **valeur de graphe** | `node.params` et `node.inputs` | projet | oui, dans le `.px` |
| **Component attaché** | l'exemplaire d'un type sur un Object, adressé par `(ObjectId, componentType)` | scène | oui, dans la scène |
| **valeur d'instance** | une valeur portée par un Component attaché | scène | oui, dans la scène |
| **handle** | référence vivante vers un Object ou un Component attaché — toujours le Proxy réactif | aucune | **jamais** |

> **Amende ADR-0031 §1**, qui nommait `node.inputs` « valeur d'instance ». C'est une
> **valeur de graphe** : elle appartient au type, pas à un Component attaché.

---

## 3. Décision

### 3.1 L'ordre canonique d'une Scene est l'ordre hiérarchique

Il est déjà le contrat de sérialisation (`core/serialize.js:130`) et c'est le seul ordre qui
soit une fonction de l'**état répliqué** : il ne dépend que de `roots` et de `children`, deux
listes ordonnées maintenues par le seul `REPARENT` et toutes deux sérialisées. Mesuré stable
aux cinq étapes du cycle de vie : création, reparent, sérialisation, rechargement,
`restoreScene`, et suppression suivie de son inverse.

Le parcours **existe** et n'est pas atteignable : `hierarchyOrder()` est une fonction privée
de `serialize.js`. Elle devient une fonction exportée du Core, et la sérialisation continue
de l'utiliser — **une** définition de l'ordre, jamais deux. C'est l'argument que
`serialize.js` fait déjà pour les passes du format : « l'ordre des passes est le contrat du
format, et l'écrire deux fois, c'est deux lecteurs qui finiront par diverger ».

`findByTag`, `findByName` et `findByComponent` rendent leurs résultats dans cet ordre.

**Ne changent pas :** `Scene.objects()`, qui reste le stockage et l'ordre d'insertion ;
l'ordre d'exécution de `Runtime.step()` (ADR-0035) ; l'ordre de dessin à `layer` égal.

L'invariant 7 n'est aujourd'hui garanti nulle part — `Scene.add()` ne place un objet dans les
roots que s'il n'a pas de parent. Il devient un test. **Aucun repli** n'est ajouté pour un
objet non atteignable : un repli masquerait un défaut d'ajout au lieu de le révéler.

### 3.2 Un port `object` transporte un handle, jamais une identité

Un nouveau type de valeur de port, `object`. Ce qui circule est le **Proxy réactif** que la
Scene détient, dont l'identité est stable (`makeReactive` est idempotent,
`core/properties/reactive.js:85`), ce qui rend `===` fiable entre deux handles.

| | |
|---|---|
| `typesCompatible` | `object <-> object`. Rien d'autre, en particulier **pas `string`** |
| `ANY_TYPE` | reste universel : aucun port `any` du catalogue n'écrit vers du persisté |
| **Valeur de graphe** | **inerte, toujours.** Voir §3.6 |
| `accepts` | non : « cet objet porte un Transform » n'est pas vérifiable au moment du geste, et une contrainte invérifiable est un mensonge (ADR-0030 §1) |
| Port non connecté | rend `null`, et le validateur émet un **avertissement** — le traitement qu'ADR-0027 donne déjà à « aucune propriété sélectionnée » |

**Il n'y a pas de type de port `component`,** et c'est une décision : avec les nœuds fusionnés
de §3.3, rien ne consommerait un tel handle. Un Component se nomme par son **type**, identité
de portée projet, dans un paramètre. Le jour où quelque chose devra en faire circuler un, ce
sera additif et cet ADR ne l'interdit pas.

**Pourquoi un handle et non une identité, alors qu'une `resource` voyage par identité.** Une
`Resource` se résout par du stockage asynchrone que ni le Core ni le Runtime n'atteignent
(ADR-0020) : son identité doit donc rester sur le fil. Un Object est déjà dans la Scene que
le Runtime tient — la résolution est un `Map.get`. Encoder puis redécoder serait de la
cérémonie, et rendrait `Parent` incapable de parler d'un objet détaché.

### 3.3 Les nœuds

Catégorie `Scene`.

| Type | Entrées | Sorties | Comportement |
|---|---|---|---|
| `scene.self` | — | `object` | l'Object porteur ; ne peut pas être nul |
| `scene.parent` | `object` | `object` | `null` sur une racine, `null` si l'entrée est nulle |
| `scene.findByTag` | `tag: string` | `object` | le **premier en ordre canonique** ; `null` si le tag est vide |
| `object.isValid` | `object` | `boolean` | ce que le créateur a pour se défendre d'une cible absente |
| `property.getOn` | `object` | selon la propriété | params `{ component, property }` |
| `property.setOn` | `flow`, `object`, `value` | `flow` | params `{ component, property }` |

`scene.findByTag` rend `null` sur un tag vide, et ce n'est pas une politesse : `Object.tag`
vaut `''` par défaut, donc un tag vide matcherait **tout objet de la scène**.

**Les nœuds de propriété étrangère sont fusionnés, pas scindés.** Un `Get Component` rendant
un handle, suivi d'un `Get Property` le consommant, ne saurait **pas de quel type** il tient
un composant : son port de sortie retomberait sur `ANY_TYPE` et son sélecteur de propriété
n'aurait rien à proposer. Un nœud portant les deux paramètres résout son schéma localement,
donc son port est typé exactement et le refus arrive au moment du geste — l'acquis d'ADR-0027
§3, et non un raffinement.

**Ils n'introduisent aucune seconde sémantique.** La propriété est référencée par **identité**,
comme dans `property.get`. L'écriture est une **écriture simple** sur le Proxy : un `Change`,
aucune Operation (ADR-0003, ADR-0027 §6). `property.get` et `property.set` restent inchangés
et réservés au Component porteur — les étendre d'un port d'Object aurait fait qu'un fil change
silencieusement **quel objet est muté** sur un nœud qui se lit « écris ma propriété ».

**Un port `object` non connecté rend `null`, jamais « Self ».** L'argument d'ADR-0031 §1 —
« trois nœuds littéraux pour additionner deux constantes » — ne transfère pas : un littéral a
une valeur qui peut vivre dans le nœud, un Object n'en a aucune, et c'est précisément
l'invariant 2.

### 3.4 Deux familles d'échec

La règle existait dans le dépôt sans avoir jamais été écrite. Elle l'est ici :

> **Ce qu'une vérification de conception peut résoudre et ne résout pas est une ERREUR. Ce
> que seule la scène en cours peut résoudre et ne résout pas n'est pas une erreur : la valeur
> est conservée, rien ne s'exécute, rien n'est levé, et le fait est montré là où un humain le
> voit.**

| Cas | Famille | Traitement |
|---|---|---|
| Type de Component inconnu du registre | conception | validateur ERREUR, nœud cerné en rouge, `GraphError` au runtime |
| Propriété absente du schéma nommé | conception | `MISSING_PROPERTY`, graphe **non réécrit** (ADR-0027 §8) |
| Port `object` non connecté | conception | avertissement |
| L'Object n'existe plus | **exécution** | `null` ; lecture = défaut déclaré ; écriture = no-op ; **rien n'est levé** |
| Le Component n'est pas attaché à cet Object | **exécution** | idem |

La seconde famille est celle de `Sprite` : une `source` cassée ne dessine pas, ne lève pas et
garde sa valeur (`runtime/rendering/components/sprite.js:48`). Une cible disparue est un état
de jeu normal — l'ennemi est mort — et non une faute d'auteur. La rapporter à chaque pas
ferait du silence de Legacy son contraire exact : du bruit permanent.

### 3.5 Une référence persistante est une propriété de Component — amende ADR-0023 §2

Un nouveau `PropertyType`, valeur `ObjectId | null`.

```json
// dans le .px — LE TYPE, portée projet
"properties": { "target": { "id": "p_9", "type": "objectref", "default": null } }

// dans la scène — L'INSTANCE, portée scène
{ "type": "res_c3", "values": { "target": "obj_7f3a" } }
```

ADR-0023 §2 retirait `object` parce que le Core n'avait de réponse à aucune de ses trois
questions. Il les a toutes pour celle-ci : défaut `null`, valide si `null` ou chaîne,
sérialise en chaîne. Le raisonnement n'est pas renversé, il est **payé**, exactement comme
ADR-0030 §1 l'a fait pour `resource`. Le nom n'est pas `object` : ADR-0023 a retiré ce mot
pour désigner *une structure à champs*, et le réutiliser rendrait cet ADR-là illisible.

> **Une propriété `objectref` se lit comme un Object et s'écrit avec un Object. L'identité
> est ce qui est stocké, et elle n'apparaît jamais dans le graphe.**

**`objectref` est un type PERSISTANT et rien d'autre. Aucun port n'est jamais typé
`objectref`.** Le type déclaré d'une propriété est traduit en type de port au moment où le
port est construit. Vérifié exhaustivement : **exactement deux endroits** du dépôt
construisent un port depuis le type déclaré d'une propriété — `core/graph/standard.js:134`
(`property.get`) et `:149` (`property.set`) — et tous deux emploient l'expression identique
`property?.type ?? ANY_TYPE`. `property.getOn` et `property.setOn` en feront un troisième et
un quatrième, donc la traduction est **une fonction partagée** et non une expression répétée.
`typesCompatible()` n'est pas touché, aucun cas particulier n'existe, et `objectref` reste
confiné à ce qui est persisté.

Le membre n'est enregistré dans `PropertyType` que lorsque son contrôle d'Inspector existe :
un type sans contrôle est une impasse silencieuse, et le dépôt s'y est refusé deux fois
(ADR-0023 §3, ADR-0030 §1).

**Ce que le reste du modèle a à faire : rien, et c'est vérifié plutôt que supposé.**
`editor/project/reconcile.js` ne mentionne aucun `PropertyType`, n'importe rien de
`properties/types.js` et ne branche sur aucun type ; le cycle complet a été exécuté sur une
propriété de forme identique (`string | null`) et les trois cas — renommage suivant
l'identité, ajout prenant son défaut, suppression retirant la valeur — sont corrects. La
sérialisation, la reconstruction et `Scene.remove()` sont tout aussi agnostiques.

Ce qui doit changer se réduit à : le membre de `PropertyType` ; un `case` dans `isValidValue`
(sans lui, la branche `default: return true` accepterait `42` comme référence d'Object) ; la
table `KIND_BY_PROPERTY_TYPE` de l'Editor et le contrôle qui va avec. `defaultForProperty`
rend déjà `null` par sa branche par défaut.

### 3.6 La porte que le format laissait ouverte, et ce qui la ferme

Mesuré dans le **chemin d'évaluation du runtime**, pas dans l'Editor, avec un catalogue
déclarant un port de type `object` :

| Cas | Ce que le nœud reçoit aujourd'hui |
|---|---|
| Port `object` réellement non connecté | `null` — correct |
| `node.inputs["target"] = "obj_7f3a91c2"` | **la chaîne brute** |
| Port `object` relié à un port `object` | le handle — correct |
| `node.inputs["target"] = 42` | **`42`** |
| `node.inputs["target"] = { id: 'obj_fake', name: 'Fake' }` | **un objet forgé**, indiscernable d'un handle pour un nœud canard-typé |

Et la valeur est **écrite dans le payload `.px`** : `"inputs":{"target":"obj_7f3a91c2"}` —
donc l'invariant 1 tombe par la même porte.

La cause est que `defaultOf()` rend la valeur de graphe **avant même de regarder le port**
(`runtime/scripting/interpreter.js:335`), et que `Graph.setInput()` ne vérifie aucun port.

> **Un port de type `object` ignore toute valeur de graphe et rend `null`.**

Une ligne, dans `defaultOf()` — la fonction qu'ADR-0031 §1 désigne déjà comme *le* seul
endroit où la priorité d'un port est résolue. Aucune garde nouvelle dans `setInput()`, aucun
second chemin, et l'Editor n'est pas l'autorité : le contrat est tenu par le Runtime.

Le cas de l'objet forgé est ce qui décide de la forme de la protection : elle ne peut pas
être « refuser ce qui n'est pas un Object », elle doit être « ignorer la valeur de graphe ».

**Les autres portes sont déjà fermées, et il faut dire par quoi.** Une connexion
`string -> object` est refusée au geste par `canConnect()` (`TYPE_MISMATCH`, mesuré). Une
connexion mal typée écrite à la main est rapportée par `validateGraph()` en ERREUR et rend
`runnable()` faux ; l'interprète ne la bloque pas — choix d'ADR-0027 §7, général à tous les
types et non propre à `object` — mais la chaîne qui arrive est **inoffensive**, parce que
rien ne peut la transformer en Object.

C'est ce qui rend l'absence de `scene.resolve(string -> object)` porteuse et non stylistique :

> **Aucun nœud ne résout une chaîne contre la Scene.** `scene.get()` n'est atteignable que
> depuis l'`evaluate` ou l'`execute` d'un nœud, donc depuis le catalogue. Un nœud qui
> convertirait une chaîne en Object rouvrirait à lui seul toutes les portes que cet ADR ferme.

### 3.7 Le glisser-déposer sur la toile est refusé, avec sa raison

Object, Component, Property, Resource, Scene et `.px` : tous refusés, chacun avec sa phrase.
ADR-0027 §11 a refusé le dépôt d'une propriété parce que `Get` ou `Set` est un choix qu'on ne
prend pas à la place du créateur ; le même argument tient pour les autres.

Pour un **Object**, deux raisons de plus, chacune suffisante :

- un repli sur le nom écrirait un **nom d'affichage librement modifiable** dans un type de
  portée projet, ce qu'ADR-0010 interdit à la racine ;
- un objet sans tag exigerait qu'on lui en pose un, donc qu'**un geste écrive dans deux
  ressources ayant deux piles d'undo** (ADR-0024) — le point ouvert qu'ADR-0024 et ADR-0027
  signalent tous les deux comme non traité.

Ce n'est pas un « non » permanent : c'est « pas avant qu'un geste non ambigu soit conçu ».
Rien ne régresse en attendant — il n'existe aujourd'hui aucune zone de dépôt sur la toile.

> **Amendé par ADR-0037 (2026-08-22) — le dépôt d'un Object est autorisé.** Le raisonnement
> ci-dessus supposait que la référence s'encoderait comme un **tag**, donc par une écriture
> dans la Scene ; la seconde raison en découlait entièrement. ADR-0037 encode le geste
> autrement : le dépôt déclare sur le `.px` une **propriété `objectref`** nommée d'après
> l'Object, et un nœud qui la lit. **Une seule ressource est écrite**, sous un seul batch de
> sa propre pile — la question inter-ressources ne se pose plus, et la première raison est
> respectée telle quelle : le nom nomme une propriété, dont le lien reste porté par son `id`.
> Aucune identité de scène n'entre dans le `.px` : l'invariant 1 est tenu à la lettre.
>
> Les refus de Component, Property, Resource, Scene et `.px` **sur toile nue** deviennent des
> gestes explicites au point du dépôt (ADR-0037 §2.4) ou restent refusés avec leur phrase.
>
> **Amendé par ADR-0039 (2026-08-27) — le dépôt d'une Resource est autorisé.** Le refus
> ci-dessus rangeait la `ResourceId` avec l'`ObjectId`, alors que l'invariant 1 ne parle pas
> d'identités en général : il parle d'identités de portée **scène**, parce qu'un `.px` sert
> plusieurs scènes. Une `ResourceId` est de portée **projet** — la portée du `.px` lui-même
> (ADR-0020) — donc rien de ce raisonnement ne l'atteint. Un nœud `value.resource` la porte
> comme un littéral, et l'invariant 1 est intact : aucune identité de scène n'entre nulle part.

---

## 4. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `findByTag` / `findByName` / `findByComponent` rendent l'ordre canonique | sauvegarde puis rechargement, et suppression puis undo, donnent le même premier résultat |
| Un port `object` ignore toute valeur de graphe | après `setInput()` sur un port `object`, le nœud reçoit `null` — vérifié à travers l'interprète |
| Une écriture depuis un graphe ne produit aucune Operation | compteur sur la pipeline de la Scene après N pas |
| Une cible disparue ne produit aucun rapport d'erreur | `onError` n'est pas appelé |
| Une valeur `objectref` traverse la sérialisation à l'octet | aller-retour `serializeScene` / `deserializeScene`, cible supprimée comprise |
| Le même `.px` dans deux Scenes n'y transporte aucune identité commune | comparaison des deux payloads |

---

## 5. Tests nécessaires

| # | Test | Protège |
|---|---|---|
| T1 | Même scène sauvegardée puis rechargée, puis supprimée puis rétablie : `findByTag` rend le même premier résultat | invariant 6 |
| T2 | Tout objet d'une Scene est atteignable depuis ses roots, quel que soit le chemin d'ajout | invariant 7 |
| T3 | Aucun `definition.params[*].reference` du catalogue n'appartient à un genre de référence résolu contre une Scene | invariant 2 |
| T4 | Aucun `evaluate` / `execute` livré ne nomme `.id` ni `createId` — extension du test de pureté de `core/graph/nodes.test.js` | invariants 2 et 5 |
| T5 | Un port `object` reste à `null` après `setInput()`, y compris avec une chaîne, un nombre et un objet forgé — **testé à travers l'interprète** | §3.6 |
| T6 | Après N pas avec les nœuds de scène, la pipeline de la Scene n'a émis aucune Operation | invariant 5 |
| T7 | Un Object disparu : lecture = défaut, écriture = no-op, `onError` non appelé | §3.4 |
| T8 | Une valeur `objectref` survit à l'aller-retour de sérialisation, cible supprimée comprise | §3.5 |
| T9 | Le même `.px` chargé dans deux Scenes n'y transporte aucune identité commune | invariant 1 |
| T10 | Cent Components du même type avec des valeurs d'instance différentes ne partagent aucun état | invariant 3 |

---

## 6. Conséquences

### Positives

- Un créateur peut écrire un jeu où deux objets se parlent, sans JavaScript.
- L'ordre observable d'une scène cesse d'être une propriété de son historique.
- Aucune Operation nouvelle, aucun inverse, aucun gestionnaire : les invariants sont des
  tests, pas du code.
- `reconcile.js` n'a rien à faire, et c'est vérifié plutôt que supposé.

### Négatives

- Le parcours canonique alloue à chaque appel. Le dépôt assume déjà ce coût plutôt qu'un
  cache, pour la raison que `scene-renderer.js` énonce : un cache invalidé à chaque écriture
  est une optimisation spéculative et un état de plus à tenir juste.
- Le validateur ne peut rien dire d'une référence morte, parce qu'il ne voit pas la scène.
  Limite structurelle, pas manque à combler.
- Un port `object` non connecté coûte un nœud `Self` de plus sur la toile.

---

## 7. Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Un mode de ciblage en paramètre sur chaque nœud de propriété | Incomposable — « le parent de mon parent » est inexprimable — et le vocabulaire de ciblage dupliqué sur chaque nœud. **Réhabilité sous condition par ADR-0039 §0.1 :** l'objection portait sur un param qui REMPLACE le port, donc sur un MODE. Le param retenu n'en est pas un — la prise reste toujours là, le sélecteur est à côté, et une connexion l'emporte simplement en existant. « Le parent de mon parent » reste donc exprimable exactement comme avant, et le fil disparaît du seul cas qui n'a rien à calculer : une cible que le créateur peut désigner |
| Un type de port `component` | Rien ne le consommerait ; additif plus tard sans rien casser |
| `Get Component` puis `Get Property` scindés | Le second nœud ignore de quel type il tient un composant : plus de typage, plus de sélecteur |
| Inférer le type d'un port à travers les connexions | Les ports deviendraient fonction de la topologie du graphe et non du seul nœud |
| Étendre `property.get` / `property.set` d'un port d'Object | Un fil changerait silencieusement quel objet est muté |
| Une ObjectId sur le fil, résolue par un nœud `scene.resolve` | Elle deviendrait atteignable depuis un nœud `Text`, et rouvrirait toutes les portes de §3.6 |
| Un port `object` non connecté valant Self | La magie implicite que le reste de cet ADR interdit |
| Lever quand une cible a disparu | Contredit `Sprite` et `MissingComponent`, et transforme un état de jeu normal en erreur par frame |
| Ordonner `findByTag` par `id` | Déterministe et inexplicable : le créateur ne peut pas prévoir le résultat |
| Un repli pour les objets non atteignables depuis les roots | Masquerait un défaut d'ajout au lieu de le révéler |
| Rendre `Scene.objects()` canonique | Une refonte : le stockage, le renderer, l'Editor et leurs tests en dépendent |
| Garder `objectref` comme type de port | `typesCompatible('objectref','object')` serait faux : un nœud `Self` ne pourrait pas alimenter un `Set Property On` |

---

## 8. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **L'ordre d'exécution de `Runtime.step()`** | Décision moteur indépendante : **ADR-0035** |
| Un type de port `component` | Additif le jour où quelque chose en consomme un |
| `Find All By Tag`, un tableau d'Objects | Aucun nœud de boucle n'existe, et un tableau de handles n'est pas persistable |
| ~~Le dépôt d'un Object préremplissant un nœud~~ | **Décidé par ADR-0037** : le dépôt déclare une propriété `objectref`, n'écrit qu'une ressource, et n'attend donc plus ADR-0024 |
| L'ordre de dessin à `layer` égal | Même cause que §3.1, autre consommateur : ADR-0035 |
| La divergence de « premier pas » d'un client qui rejoint | Préexistant, assumé par ADR-0029 §3 |
| Le prefab | Reste reporté (ADR-0026 §7) ; les refus de §3.7 ne le préjugent pas |
