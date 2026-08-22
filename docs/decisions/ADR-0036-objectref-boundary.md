# ADR-0036 — La frontière `objectref` ↔ `object` traduit la valeur, pas seulement le type

- **Statut :** **accepté** (2026-08-22)
- **Décide :** ce qui traverse la frontière entre une référence d'Object **persistée** et une référence d'Object **qui circule dans un graphe**, dans les deux sens
- **Dépend de :** ADR-0003 (écriture simple contre intention), ADR-0007 (schéma déclaré), ADR-0010 (identité par ID), ADR-0023 (`PropertyType`), ADR-0027 (modèle de graphe), ADR-0034 (références d'Object dans le graphe)
- **Amende :** ADR-0034 §3.6 — « aucun nœud ne résout une chaîne contre la Scene » gagne le critère de **provenance** qui la rend applicable
- **Complète :** ADR-0034 §3.5 — le contrat y est énoncé et n'était appliqué qu'au type ; sa décision ne change pas, elle est tenue
- **Ne décide pas :** le glisser-déposer vers la toile, les futurs nœuds de référence, un type de port `component` ou `property`

---

## Pourquoi c'est un ADR

ADR-0034 §3.5 énonce un contrat en toutes lettres :

> Une propriété `objectref` se lit comme un Object et s'écrit avec un Object. L'identité est
> ce qui est stocké, et elle n'apparaît jamais dans le graphe.

ADR-0034 §3.6 énonce, tout aussi catégoriquement :

> **Aucun nœud ne résout une chaîne contre la Scene.** `scene.get()` n'est atteignable que
> depuis l'`evaluate` ou l'`execute` d'un nœud, donc depuis le catalogue. Un nœud qui
> convertirait une chaîne en Object rouvrirait à lui seul toutes les portes que cet ADR ferme.

**Les deux ne peuvent pas être vraies telles quelles.** Une propriété `objectref` est stockée
comme une chaîne ; la lire « comme un Object » est exactement l'opération que §3.6 interdit.
Le dépôt a tranché en n'implémentant ni l'une ni l'autre : `portTypeOf()` traduisait le
**type**, la traduction de la **valeur** n'a jamais été écrite, et le défaut ci-dessous en
découle directement.

Ce n'est donc pas la documentation d'une implémentation : c'est le critère manquant qui rend
les deux sections compatibles. Sans lui, la correction se lit comme une violation d'ADR-0034,
et un lecteur futur aurait raison de la défaire.

---

## Le défaut mesuré

Mesuré sur un `.px` déclarant `target: objectref`, entièrement constructible depuis l'Editor —
`objectref` figure dans `authorableTypes()` et le sélecteur de propriété l'offre. Aucune
édition manuelle de payload n'est nécessaire.

**Sens lecture.** `property.get` rendait `io.component[name]`, c'est-à-dire l'`ObjectId`, sur
un port que `portTypeOf()` avait typé `object`. `canConnect()` autorisait le fil et
`validateGraph()` restait muet : le système de types disait *handle*, la valeur était une
chaîne.

| État de la référence | `Is Valid` | `Parent` | Attendu |
|---|---|---|---|
| vivante | `true` | **`null`** | l'Object parent |
| morte (cible supprimée) | **`true`** | `null` | `false` |
| vide | `false` | `null` | conforme |

`Is Valid` est ce qu'ADR-0034 §3.3 nomme « ce que le créateur a pour se défendre d'une cible
absente ». Il répondait `true` sur une référence morte, parce qu'une chaîne non vide n'est pas
`null` — le seul nœud dont c'est la raison d'être était le seul à mentir.

**Sens écriture.** `Self.object → Set Property.value` sur cette même propriété écrivait le
Proxy réactif dans la valeur d'instance. `serializeScene()` écrivait alors l'enregistrement
d'Object entier dans le payload de scène :

```json
{ "target": { "id": "…", "name": "Hero", "tag": "", "layer": 0,
              "active": true, "lock": false, "owner": null } }
```

C'est l'invariant 3 d'ADR-0034 — « un handle n'est jamais persisté, ni sérialisé » — rompu
par un fil que le système de types autorisait, parce que le port et la propriété
s'accordaient sur le type et divergeaient sur la forme.

---

## Décision

### 1. La traduction de la valeur est une paire, au même endroit que celle du type

Deux fonctions, dans `core/graph/standard.js` — le catalogue de nœuds, qui tient déjà
`io.ctx.scene` et qui est le seul endroit où un graphe lit ou écrit une valeur de Component :

```
portValueOf(property, value, scene)    valeur stockée  → valeur de port
storedValueOf(property, value)         valeur de port  → valeur stockée
```

Elles sont le **jumeau de `portTypeOf()`**, et le raisonnement est le sien : quatre nœuds
construisent un port depuis le type déclaré d'une propriété, donc l'expression est une
fonction partagée et non répétée. Les quatre mêmes nœuds — `property.get`, `property.set`,
`property.getOn`, `property.setOn` — franchissent désormais la frontière par ces deux-là.

**Une propriété qui n'est pas `objectref` traverse inchangée.** Pas de repli nullish : `0`,
`false` et `''` sont des valeurs.

**Ce qui ne se résout pas devient `null`, jamais soi-même.** Cible supprimée, référence vide,
absence de Scene, valeur d'une forme inattendue : toutes répondent `null`, ce qu'un port typé
`object` promet et ce qui redonne son sens à `Is Valid`.

**`storedValueOf` lit `value?.id`.** Une chaîne rend `undefined`, donc `null` : rien ici ne
promeut une chaîne arbitraire en référence stockée.

### 2. Ce que §3.6 interdit est la **provenance**, pas l'opération

> **Un nœud ne résout jamais une valeur de graphe. Il résout une valeur d'instance dont le
> schéma déclare le type `objectref`, et rien d'autre.**

C'est le critère qui manquait, et il est vérifiable plutôt qu'affirmé :

| | valeur de graphe (`node.inputs`) | valeur d'instance déclarée `objectref` |
|---|---|---|
| Portée | **projet** — un `.px` sert plusieurs scènes | **scène** — l'identité y est déjà légale |
| Qui peut l'écrire | n'importe quel payload, y compris forgé à la main | le schéma du Component, et lui seul |
| Forgeable | oui — un enregistrement `{ id, name }` est indiscernable d'un handle | non — le type est déclaré, pas deviné |
| Traitement | **refusée sans inspection** (`defaultOf`, ADR-0034 §3.6) | **résolue**, par `scene.get()` |

Les deux règles sont la même règle vue des deux côtés d'une frontière : `defaultOf()` refuse
qu'une identité entre dans le graphe par le payload, `portValueOf()` autorise qu'une identité
déclarée devienne un handle par le modèle. Ce que §3.6 protégeait — qu'un `.px` ne transporte
aucune identité de scène — est intact : rien de ce qui est résolu ici n'a jamais été écrit
dans un `.px`.

**Aucun nœud générique `Resolve(string) → Object` n'est introduit, et cet ADR n'en autorise
aucun.** La déclaration est l'autorisation ; sans déclaration, il n'y a pas de résolution.

### 3. Aucune compatibilité rétroactive pour les valeurs corrompues

Une exécution du défaut a pu écrire un enregistrement d'Object là où une chaîne est attendue.
Le dépôt **n'ajoute aucune lecture tolérante**, et le refus est motivé :

- **La donnée n'existe pas ici.** Aucun `.px`, aucune scène, aucune fixture JSON du dépôt ne
  déclare une propriété `objectref` ; le projet de départ n'en contient pas.
- **Le chemin est étroit.** Il faut déclarer la propriété, câbler un port `object` vers un
  `Set Property`, lancer Play — le Runtime tourne sur la scène vivante (ADR-0029 §1) — et
  sauvegarder avant Stop, puisque Stop restaure l'instantané pris au départ.
- **La dégradation est déjà correcte et visible.** `scene.get(enregistrement)` répond
  `undefined`, donc `null` : la référence se lit comme vide dans le graphe et s'affiche en
  rouge dans l'Inspector, où `ui/object-field.js` montre une référence morte plutôt qu'un
  vide. Le fait est montré là où un humain le voit, ce qu'ADR-0034 §3.4 exige.
- **Un repli masquerait la corruption suivante.** Lire `value.id` quand la valeur est un
  enregistrement rendrait définitivement indétectable la classe de défaut que cet ADR ferme.
  C'est le raisonnement qu'ADR-0034 §3.1 tient sur un autre repli — celui qu'il refuse pour
  un objet non atteignable, parce qu'il masquerait un défaut d'ajout au lieu de le révéler.

---

## Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Une référence vivante circule comme un handle | `Parent` rend le parent réel de la cible — une chaîne ne peut pas le simuler |
| Une référence morte ne circule pas | `Is Valid` rend `false` après suppression de la cible, la valeur stockée étant conservée |
| Une écriture stocke l'identité | `typeof` de la valeur d'instance après un `Set Property` alimenté par `Self` |
| Aucun handle n'est sérialisé | aucune valeur de composant du payload n'est un enregistrement |
| L'aller-retour préserve la référence | sérialiser, désérialiser, relire : la cible se résout encore |
| Une valeur de graphe ne devient jamais un Object | un enregistrement forgé dans `node.inputs` rend toujours `null` |
| Une propriété non-`objectref` est inchangée | `0`, `false`, `''` traversent les quatre nœuds tels quels |

---

## Tests

Écrits dans `core/graph/nodes.test.js` (la paire, pure) et
`runtime/scripting/interpreter.test.js` (la frontière, à travers un graphe qui tourne).

| # | Test | Protège |
|---|---|---|
| B1 | Une référence stockée devient le handle que la Scene détient | §1 |
| B2 | Cible absente, référence vide, absence de Scene : `null`, jamais l'identité | §1 |
| B3 | Un handle devient l'identité ; une chaîne ne devient rien | §1, §2 |
| B4 | Une propriété non-`objectref` traverse inchangée, valeurs falsy comprises | §1 |
| B5 | `Get Property` : référence vivante → `Is Valid` vrai **et** `Parent` rend le vrai parent | le défaut principal |
| B6 | `Get Property On` : même comportement sur le Component d'un autre Object | §1 sur les quatre nœuds |
| B7 | Référence morte : `Is Valid` faux, `Parent` nul, valeur stockée conservée | le mensonge d'`Is Valid` |
| B8 | Référence vide : `Is Valid` faux | non-régression |
| B9 | `Set Property` / `Set Property On` alimentés par `Self` stockent une chaîne | invariant 3 |
| B10 | `serializeScene()` n'écrit aucun enregistrement dans une valeur de composant | invariant 3, énoncé comme invariant |
| B11 | Aller-retour : la référence revient et se résout encore | §3.5 dans le temps |
| B12 | Cible supprimée puis aller-retour : valeur conservée, résolution nulle | §3.4 après rechargement |
| B13 | Un enregistrement forgé dans `node.inputs` ne devient toujours pas un Object | **non-régression §3.6** |

Seize tests couvrent ces treize lignes. **Dix des treize échouent** contre l'implémentation
précédente, ce qui est la seule preuve qui vaille qu'elles gardent quelque chose. Les trois
autres — B4, B8, B13 — passaient déjà, et gardent contre une régression future : que la
traduction touche une valeur ordinaire, qu'une référence vide cesse d'être vide, ou que la
résolution ajoutée ici s'étende aux valeurs de graphe.

---

## Conséquences

### Positives

- `Is Valid` cesse de mentir, donc le seul moyen de défense qu'ADR-0034 donne au créateur
  fonctionne.
- `Parent`, `Get Property On` et `Set Property On` opèrent sur une référence persistée comme
  ils opèrent sur `Self` : une seule sémantique d'Object dans le graphe.
- Une scène cesse de pouvoir contenir un handle sérialisé.
- Le chemin complet « propriété `objectref` → graphe » devient utilisable : c'est la seule
  manière légale de désigner un Object précis depuis un `.px`, la portée projet interdisant
  d'y écrire une identité de scène.

### Négatives

- `property.get` sur une propriété `objectref` a besoin de `io.ctx.scene`. Un appelant qui
  n'en fournit pas lit `null` là où il lisait une chaîne. C'est la dégradation honnête — le
  port promet un handle — mais c'est un comportement qui change.
- Une valeur corrompue par le défaut se lit désormais comme une référence morte plutôt que
  comme une chaîne. Aucune donnée du dépôt n'est concernée.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Typer le port `objectref` plutôt que `object` | `typesCompatible()` compare des noms : le port ne serait plus compatible avec ce que produit `Self`. ADR-0034 §3.5 l'écrit déjà — « aucun port n'est jamais typé `objectref` » |
| Résoudre dans l'interprète plutôt que dans le catalogue | l'interprète ne connaît pas le schéma d'une propriété ; il aurait fallu lui donner ce que le catalogue tient déjà, et une seconde autorité sur ce qu'est une propriété |
| Un nœud `Resolve` explicite, à la charge du créateur | expose la mécanique interne au lieu de la fermer, et rouvre §3.6 pour de bon : le nœud accepterait n'importe quelle chaîne |
| Valider à l'écriture plutôt que traduire | `isValidValue()` n'est pas consultée par une écriture simple, et ADR-0003 exige que le graphe écrive simplement. Valider aurait exigé un second chemin d'écriture |
| Lire tolérante pour les valeurs corrompues | masquerait la classe de défaut que cet ADR ferme, pour une donnée dont l'existence n'a pas pu être constatée |
