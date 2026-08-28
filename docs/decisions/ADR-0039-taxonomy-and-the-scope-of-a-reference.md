# ADR-0039 — Une cible qu'on désigne est un paramètre ; une catégorie dit ce qu'un nœud EST ; une identité entre selon sa PORTÉE

- **Statut :** **accepté** (2026-08-27)
- **Décide :** comment un nœud de propriété désigne l'Object sur lequel il agit ; la taxonomie des nœuds et ce qu'elle alimente ; quelles identités un `.px` peut contenir ; où un nœud configuré se lit
- **Dépend de :** ADR-0020 (Resources), ADR-0023 (`PropertyType`), ADR-0027 (modèle de graphe), ADR-0030 (§4, la palette), ADR-0033 (rangées), ADR-0034 (références d'Object), ADR-0037 (un dépôt déclare)
- **Amende :** ADR-0034 §7 (le « mode de ciblage en paramètre » est réhabilité sous condition) ; ADR-0037 §2.4 (un dépôt produit un nœud fini) et §6 (la poignée de propriété est tranchée) ; ADR-0030 §4 (six teintes deviennent sept) ; ADR-0034 §3.7 et ADR-0037 §2.3 (le refus du dépôt d'une **Resource** est levé)
- **Ne décide pas :** un type de port `component` ou `property`, qui restent refusés — voir §4

---

## 0. Le défaut principal : le créateur devait redire ce que l'Editor savait déjà

Pour écrire « fais tourner le joueur », il fallait :

1. glisser `Player` depuis la Hierarchy ;
2. glisser `Transform.rotation` depuis l'Inspector ;
3. tirer un fil du premier nœud vers le port `Target` du second.

Or à l'étape 2 l'Inspector **affichait Player**. L'Object, le Component et la propriété
étaient tous les trois connus au moment du geste, et le modèle en demandait deux de plus.

### 0.1 Décision — le mode n'existe pas ; il n'y a qu'une question posée deux fois

> **Un nœud ne demande jamais à un créateur si sa cible est « statique » ou « venue d'un
> fil ». Ce sont des mots sur l'implémentation, pas sur le jeu. Il a une prise Object,
> toujours visible, et un sélecteur sur la même ligne : connectez quelque chose et la
> connexion est la cible, laissez vide et le sélecteur l'est.**

Une première version exposait ce choix — un menu `Target : [ Player | From Wire ]` — et
c'était une faute d'UX : un débutant ne sait pas ce que « From Wire » veut dire, et n'a pas à
connaître le modèle interne d'un nœud pour s'en servir. **Le mode est déduit du geste.**

| Ce que le créateur fait | Ce que le nœud fait |
|---|---|
| il choisit un Object dans le sélecteur | le nœud agit dessus |
| il connecte quelque chose sur la prise | la connexion l'emporte, le sélecteur se grise et dit pourquoi |
| il retire le fil | le sélecteur répond de nouveau, avec ce qu'il nommait déjà |

**La prise ne disparaît jamais.** Une prise qu'on ne voit pas est une prise qu'on ne peut pas
connecter — et connecter est précisément la moitié du geste que le param ne couvre pas. Les
deux partagent une ligne parce qu'ils répondent à une seule question.

**Une connexion l'emporte en EXISTANT, pas en produisant un Object.** Un `Find By Tag` qui ne
trouve personne doit écrire sur personne, et non retomber sur ce que le sélecteur nomme :
`io.wired(port)` répond à la question structurelle, donc le repli est une règle et non une
devinette.

`property.getOn` et `property.setOn` gagnent donc un param `target` — l'id d'une prise
`objectref` du `.px`, ou rien. Absent, la prise répond : c'est exactement ce que fait tout
graphe écrit avant ce param, donc **aucune migration**.

**Le param ne nomme jamais un Object.** Il nomme une **prise** — une propriété que ce `.px`
déclare — donc une identité de portée projet (ADR-0027 §4). L'`ObjectId` reste là où
ADR-0034 §3.5 le met : dans la valeur que chaque Object attaché porte. Un `.px` visé
statiquement reste réutilisable dans cinquante scènes et le dit dans l'Inspector.

**La résolution n'ouvre aucune porte.** Une prise est une valeur d'instance dont le schéma
déclare `objectref` : c'est exactement la provenance qu'ADR-0036 §2 autorise, résolue par le
`portValueOf()` que `property.get` emploie déjà. Aucun nœud ne convertit une chaîne
arbitraire en Object.

**Le typage ne bouge pas.** Le type de `value` vient de `(component, property)`, lus dans le
nœud seul — donc exact que la cible soit désignée ou calculée. C'est la raison pour laquelle
la cible est un param et non une « Property Reference » circulant sur un fil : ce modèle-là
rendrait le type fonction de ce qui est branché, et le premier producteur dynamique le ferait
retomber sur `any`. Voir §4.

### 0.2 Décision — un dépôt produit un nœud FINI

Le dépôt d'une propriété déclare (ou **réutilise**) la prise de l'Object que l'Inspector
montrait, et vise le nœud dessus — sous un seul batch, donc un seul `Ctrl Z`.

Réutiliser, et non uniquifier : déposer l'Object lui-même EST le geste « déclare une entrée »
et deux dépôts en déclarent deux (ADR-0037) ; déposer une propriété est le geste « vise cette
propriété », où la prise est un moyen. Demander trois propriétés de Player ne doit pas laisser
trois prises à remplir trois fois.

| Geste | Ce que le créateur voit | Ce que le `.px` gagne |
|---|---|---|
| Hierarchy `Player` → toile | un nœud **`Get Object`** avec `Object: Player` | une propriété `objectref` nommée `Player` |
| Inspector `Transform` (poignée) → toile | menu Get/Set, puis un nœud **visé** | la prise + `{ target, component }` |
| Hierarchy `Player` → **sur un nœud** | ce nœud est pointé sur Player | la prise, et un param |
| Inspector `Transform.rotation` (poignée) → toile | menu Get/Set, puis un **`Set Property On`** déjà rempli | la prise + `{ target, component, property }` |
| Project `hero.png` → toile | un nœud `Resource` | `{ value: ResourceId }` |

**Aucun `ObjectId` dans aucun de ces payloads.** L'identité voyage avec le glissement pour que
la règle puisse nommer la prise ; elle s'arrête là.

---

## 1. Trois défauts, et ils venaient de deux confusions

| Constat | Cause réelle |
|---|---|
| `Key` et `Pointer` se lisaient comme `Branch` | `Input` n'avait **aucune ligne** dans la table des teintes et retombait sur le gris d'`any`, à un cheveu de l'acier de `Flow` |
| `Self` et `Get Property On` portaient le même violet | Tout ce qui sortait du Component s'appelait `Scene` : **rendre une référence** et **accéder à une propriété** étaient une seule catégorie |
| Déposer une image sur la toile était refusé | La règle d'ADR-0034 — « aucune identité dans un `.px` » — était appliquée à une `ResourceId` alors qu'elle parle d'une `ObjectId` |

Les deux premières sont la même confusion : **la catégorie d'un nœud n'était pas une réponse à
« qu'est-ce que c'est ? »**, mais à « d'où ça vient ? ». La troisième est une confusion entre
**genre d'identité** et **portée d'identité**.

---

## 2. Décision : une catégorie répond à « qu'est-ce que ce nœud EST »

`NODE_CATEGORIES` devient :

```
Events · Input · References · Properties · Flow · Values · Math · Compare · Logic · Debug
```

`Scene` disparaît, et ce qu'il contenait se range selon ce que les nœuds **font** :

| Nœud | Avant | Après | Pourquoi |
|---|---|---|---|
| `Self`, `Parent`, `Find By Tag`, `Is Valid` | Scene | **References** | ils rendent un handle et ne participent à aucune exécution |
| `Get Property On`, `Set Property On` | Scene | **Properties** | ce sont `Get`/`Set Property` **visés ailleurs** : même sémantique, même écriture simple, même référencement par identité (ADR-0034 §3.3) |

**Une catégorie est de la présentation et n'est jamais sérialisée.** Un nœud porte son `type`,
ses params et sa position ; la famille est lue dans le catalogue au chargement. Renommer une
catégorie ne coûte donc **aucune migration**, et aucun graphe écrit avant cette ligne ne change
de sens.

### 2.1 La palette gagne une septième teinte — amende ADR-0030 §4

ADR-0030 §4 plaidait pour six teintes contre « une par catégorie, qui n'apprend rien ». L'argument
tenait contre vingt ; il ne tient pas contre **sept**, et six ne pouvaient pas dire la différence
que §1 vient d'établir :

| Famille | Teinte |
|---|---|
| Events **et** Input | `--px-accent` — le monde extérieur qui arrive : un instant et un état qui dure sont une famille pour l'œil, deux groupes dans le menu |
| References | `--px-hue-reference` — **le violet du port `object` lui-même**, donc un `Self` et la prise qu'il alimente sont visiblement la même chose |
| Properties | `--px-hue-property` — **nouveau** |
| Flow | `--px-hue-flow` |
| Values | *aucune* — un littéral porte la teinte de ce qu'il contient (ADR-0033 §4) |

> **C'est la dernière.** Toute catégorie suivante prend une teinte qui existe déjà.

### 2.2 Un oubli de table devient un test

Le défaut de `Input` était **silencieux** : la table vivait dans `windows/graph.js`, qui définit un
Custom Element et ne peut pas être chargé sans DOM — donc rien ne pouvait la vérifier. Elle est
extraite dans `editor/graph/palette.js`, sans DOM, et `palette.test.js` exige que **toute catégorie
déclarée par le catalogue ait une teinte et un glyphe**.

---

## 3. Décision : une identité entre dans un `.px` selon sa PORTÉE

> **Ce qu'ADR-0034 interdit n'est pas « une identité », c'est une identité de portée SCÈNE.**

Un `.px` est de portée **projet**. Une `ObjectId` nomme quelque chose dans **une** scène, alors
qu'un `.px` en sert plusieurs : c'est cette **inadéquation de portée** que l'invariant 1 protège,
et rien d'autre. Une `ResourceId` nomme quelque chose dans le **projet** — exactement la portée du
`.px` qui la contiendrait (ADR-0020).

Appliquer à la seconde le raisonnement écrit pour la première était une erreur de lecture, et son
prix était concret : **échanger le sprite d'un objet depuis un graphe était impossible sans
JavaScript**, alors qu'un nœud `Text` portant une chaîne arbitraire n'a jamais posé de question.

### 3.1 `value.resource`

Un littéral de plus, à côté de `Number`, `Boolean` et `Text` :

```
value.resource   params { value: ResourceId | null }   →  data('value', 'resource')
```

- il **ne résout rien** : le Core n'atteint jamais le stockage (ADR-0020), il fait circuler l'identité ;
- son port sort en `resource`, donc `typesCompatible('resource','resource')` le relie à
  `Sprite.source` **sans une seule règle nouvelle** — `portTypeOf()` typait déjà ce port depuis la
  déclaration de la propriété ;
- il porte la teinte de son type (règle des littéraux, ADR-0033 §4), c'est-à-dire le violet des
  pointeurs : une ressource EST un pointeur.

### 3.2 Le dépôt — amende ADR-0034 §3.7 et ADR-0037 §2.3

| Déposé | Sur toile nue | Sur un nœud |
|---|---|---|
| **Resource** (non-dossier) | crée `value.resource` déjà configuré | configure le param `value` d'un nœud qui en déclare un |

**Aucun menu**, contrairement au dépôt d'une propriété : `Get` ou `Set` sont deux intentions
(ADR-0037 §2.4), une ressource n'en a qu'une — *cette valeur*. Un **dossier** reste refusé : ce
n'est pas une valeur.

Le tableau d'ADR-0037 §2.3 gagne donc une ligne, et elle est de portée projet comme les trois
autres :

| Ce qui est déposé | Ce qui entre dans le `.px` | Portée |
|---|---|---|
| Resource | sa `ResourceId`, dans un param | projet |

---

## 4. Ce qui reste refusé, et pourquoi ce n'est pas du conservatisme

Un port `property` — donc `Property Reference → Set Property` par un fil — a été réexaminé et
**reste refusé**, pour une raison mesurable et non par respect de l'ADR précédent.

> **Correction d'un argument antérieur.** Il avait été écrit que ce modèle rendrait le type
> « fonction de la topologie ». C'est inexact : la dépendance serait d'**un seul saut**, par
> une variable de type déclarée, ce qu'un `array<X>` fait déjà dans cette grammaire. Ce qui
> le condamne est ailleurs, et c'est plus fort.

`Set Property On` type son port `value` depuis `(component, property)`, lus **dans le nœud seul**.
Sur un fil, ce type deviendrait fonction de la **topologie** : il faudrait remonter la connexion,
lire les params du nœud source, et recommencer à chaque changement de fil ou de param — dans le
Core, le validateur et le renderer. Et la première fois qu'une source serait elle-même dynamique,
le type retomberait sur `any` : **on échangerait un port typé, coloré et refusé au geste contre un
port sans forme.** C'est exactement ce que le modèle actuel achète.

### Les quatre modèles, comparés

| | A — tout en dropdowns | B — références sur fils | C — DnD crée des nœuds de référence | **E + D+ — retenu** |
|---|---|---|---|---|
| Nœuds pour lire `Player.Transform.rotation` | 2 + 1 fil | 2 + 1 fil | 3-4 + fils | **1, aucun fil** |
| Typage de `value` | exact | 1 saut, **dégrade en `any`** dès une source dynamique | exact | exact |
| Refus au moment du geste | oui | non | oui | oui |
| Dropdowns à remplir à la main | **trois** | aucun | aucun | **aucun, si l'on dépose** |
| Cible calculée (`Find By Tag`) | oui | oui | oui | **oui — la prise est toujours là** |
| Complexité ajoutée au Core | nulle | **forte** (`portsOf` a besoin du graphe) | nulle | nulle |
| Concept nouveau pour un débutant | non | **oui : un pointeur** | oui | non |

**Ce qui condamne B n'est pas le typage, c'est le concept.** « Une référence à une propriété
est elle-même une valeur qui circule sur un fil » est un pointeur — l'idée la plus difficile
du modèle, dans un langage visuel destiné à des gens qui ne programment pas. Unreal Blueprints
et Unity Visual Scripting l'évitent tous les deux : un pin `Target`, et la propriété cuite
dans l'identité du nœud. E fait la même chose sans même le pin, quand la cible se désigne.

**D = les params portent le TYPAGE, le glisser-déposer porte l'AUTORAT.** Le créateur ne remplit
plus les dropdowns : il dépose un Object, un Component ou une propriété, et le nœud arrive
configuré (ADR-0037). Les dropdowns restent pour le clavier, la relecture et la correction — ils
ne sont plus le chemin principal.

C'est le modèle que le dépôt avait déjà ; ce qui manquait était **le geste**, et il manquait pour
une raison qui n'avait rien d'architectural : la résolution de cible du shell interrogeait une
fenêtre **cachée**, qui revendiquait tous les dépôts. Aucune règle n'était jamais consultée.

---

## 5. Décision : le titre d'un nœud est son type, toujours

Un `Pointer Button` réglé sur Middle s'appelait `Middle Button` — un nœud introuvable dans une
documentation, un tutoriel ou une recherche, et dont le nom ne disait plus ce qu'il faisait.

> **L'en-tête d'un nœud est le nom de son TYPE, et rien d'autre. Ce avec quoi il est
> configuré se lit à l'intérieur, sur les lignes où cela se change.**

Une version intermédiaire autorisait un titre configuré tant que « les mots qui nomment le
nœud survivent » — `Set Player.Transform.rotation`. C'était encore faux, pour deux raisons
qui se voient à l'usage :

- **une valeur occupait la place d'un type.** `Get Ground`, `Set Sprite.height`,
  `Middle Button` : le même nœud portait un nom différent dans chaque graphe, et un tutoriel
  ne pouvait plus le nommer. « Ajoutez un Set Property » doit désigner le même nœud une heure
  plus tard, et un créateur doit pouvoir relier l'en-tête qu'il lit à l'entrée du menu ;
- **la syntaxe à points est du code.** `Sprite.height` est une expression de programmation
  dans un outil qui n'en est pas un. Deux champs — `Component: Sprite`, `Property: Height` —
  disent la même chose sans rien demander à personne.

Le catalogue ne déclare donc **plus aucun `title()`**, et un test y tient toutes ses
définitions. `NodeDefinition.identity`, qui existait pour encadrer l'exception, disparaît avec
elle : une règle sans exception n'a pas besoin d'être bornée.

`title(node, context)` reste au catalogue et garde son rôle d'ADR-0037 §5 (`Get Health.hp`) : il
alimente le `<title>` du nœud, où une phrase longue ne coûte rien. Et il commence **toujours** par
le label du type — vérifié pour tout le catalogue par un test, pas par une liste tenue à la main.

---

## 6. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Toute catégorie déclarée a une teinte et un glyphe | `palette.test.js`, sur le catalogue réel |
| `Self` et `Get Property On` ne portent pas la même couleur | `categoryHue('References') !== categoryHue('Properties')` |
| `Input` ne porte pas la couleur de `Flow` | idem, et `Input === Events` |
| Un littéral porte la teinte de son type, pas de sa famille | `Values` est absent de la table des catégories |
| Un `.px` ne contient aucune `ObjectId` | le payload sérialisé, après un dépôt d'Object réel |
| Un `.px` **peut** contenir une `ResourceId` | le param de `value.resource` après un dépôt |
| Une ressource se relie à `Sprite.source` | `typesCompatible(sortie, portTypeOf(Sprite.schema.source))` |
| Un titre configuré commence par le label du type | tout le catalogue, `nodes.test.js` |
| Un import nommé désigne un export réel | `tools/check-exports.js`, sur `src/` et `tools/` |

---

## 7. Conséquences

### Positives

- La couleur répond à « qu'est-ce que ce nœud ? » avant que le titre soit lu.
- Un oubli de palette ne peut plus être silencieux.
- Échanger un sprite depuis un graphe devient possible sans JavaScript.
- Le glisser-déposer devient le chemin principal ; les dropdowns deviennent le recours.
- Un nœud garde son nom, donc il peut être documenté et cherché.

### Négatives

- Sept teintes au lieu de six : une de plus à apprendre, et c'est le prix d'une distinction que
  six ne pouvaient pas exprimer.
- `value.resource` fait entrer une `ResourceId` dans un `.px`. Un projet qui supprime la ressource
  laisse un nœud pointant sur rien — montré en **rouge** par le contrôle, jamais réécrit, ce qui
  est le traitement qu'ADR-0034 §3.4 donne déjà à une référence morte.
- La catégorie `Scene` disparaît du vocabulaire ; les ADRs qui la nomment se lisent avec §2.

---

## 8. Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Garder `Input` sans teinte | Le défaut d'origine : gris, indiscernable de `Flow` |
| Donner à `Properties` une teinte existante | Le vert est celui de `Text`, l'ambre celui de `boolean` : deux idées, une couleur |
| Un port `property` (modèle B) | Typage fonction de la topologie, dégradant en `any` — §4 |
| Un nœud `Object Reference` distinct | `property.get` sur une prise `objectref` EST cette lecture ; un second nœud serait deux mécanismes pour une idée |
| Refuser la Resource « puisque rien ne la consomme » | On ne conçoit pas une architecture d'après ce qui existe déjà ; c'est le nœud qui manquait |
| Un menu Get/Set au dépôt d'une ressource | Une ressource n'a qu'une intention ; demander serait de la cérémonie |
