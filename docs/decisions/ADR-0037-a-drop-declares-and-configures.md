# ADR-0037 — Un dépôt déclare, configure, et ne devine jamais

- **Statut :** **accepté** (2026-08-22)
- **Décide :** ce qu'un glisser-déposer venu de l'Editor peut faire dans un graphe `.px`
- **Dépend de :** ADR-0010 (identité par ID), ADR-0016 / ADR-0026 (un `.px` est **une** ressource), ADR-0021 (identité de Component), ADR-0023 (`PropertyType`), ADR-0024 (undo par ressource), ADR-0027 (modèle de graphe), ADR-0034 (références d'Object), ADR-0036 (frontière `objectref` ↔ `object`)
- **Amende :** ADR-0027 §11 ; ADR-0034 §3.7 (ligne *Object*) et son tableau « ne décide pas »
- **Ne décide pas :** le préremplissage de la valeur d'instance ; le geste de drag d'une ligne de propriété dans l'Inspector ; un type de port `component`, qui reste refusé par ADR-0034 §3.2

---

## 1. Le fait qui décide, et qu'aucun ADR n'avait écrit

Un `.px` **est un type de Component**, de portée projet. La fenêtre Graph le lie comme tel :
`graph.bind(workspace.attached(id))` rend une `ComponentDefinition`, jamais un exemplaire.

> **Quand un `.px` est ouvert, il n'existe aucune instance courante.** Il peut être attaché à
> zéro Object de la scène ouverte, ou à cinquante, et la sélection d'Object est indépendante
> — ADR-0032 les rend même mutuellement exclusives.

Déposer *Player* dans le graphe de *Door.px* : **sur laquelle des cinq portes écrirait-on
`target = Player` ?** La question n'a pas de réponse. Ce n'est donc pas une contrainte d'ADR
qu'il faudrait assouplir, c'est l'absence d'un destinataire.

Ce fait invalide l'idée qu'un nœud puisse porter la cible, et il désigne du même coup la
seule forme que le geste peut prendre.

---

## 2. Décision

### 2.1 Le dépôt déclare une **prise**, pas une cible

> **Déposer un Object dans un graphe déclare sur le `.px` une propriété `objectref` nommée
> d'après cet Object, et un nœud qui la lit. L'identité de l'Object n'entre nulle part.**

Le créateur voit `[Player]`. Le fichier contient « une prise appelée Player ». Chaque Object
portant le Component dit dans l'Inspector où **sa** prise pointe (ADR-0034 §3.5).

```json
// dans le .px — portée PROJET
"properties": { "Player": { "id": "p_a1", "type": "objectref", "default": null } }

// dans la scène — portée SCÈNE, une valeur par instance
{ "type": "res_door", "values": { "Player": "obj_7f3a" } }
```

C'est ce qui rend un `.px` **réutilisable** plutôt que verrouillé sur une scène — et le
créateur le lit : une prise nommée se remplit, un identifiant gravé ne se remplit pas.

### 2.2 Un dépôt écrit dans **une** ressource, celle qui est ouverte

Les propriétés et le graphe d'un `.px` partagent **une** pipeline et **une** pile
(ADR-0027 §5). Déclarer la propriété, ajouter le nœud et poser le fil se font sous **un
batch** : un `Ctrl Z` reprend tout le geste.

> **Aucun dépôt ne modifie la Scene.** La question de la portée d'undo inter-ressources
> qu'ADR-0034 §3.7 attendait **ne se pose pas** : rien hors du `.px` n'est touché.

### 2.3 Ce qui entre dans un `.px` est toujours de portée projet

| Ce qui est déposé | Ce qui entre dans le `.px` | Portée |
|---|---|---|
| Object | un **nom** de propriété, et son type `objectref` | projet |
| Component | son `componentType` dans un param | projet |
| Property | `componentType` + `property.id` dans deux params | projet |
| Resource | sa `ResourceId` dans un param — **ajouté par ADR-0039** | projet |

L'invariant 1 d'ADR-0034 est tenu à la lettre : **aucune identité de scène**. Un nom
d'affichage sert à nommer une propriété — dont le lien reste porté par son `id`, insensible
au renommage (ADR-0027 §4) — et non à désigner quoi que ce soit.

### 2.4 Là où le geste serait ambigu, le créateur tranche au point du dépôt

ADR-0027 §11 refusait le dépôt d'une propriété parce que lire et écrire sont deux intentions
et qu'en choisir une serait magique. Il annonçait lui-même la levée : « la règle pourra être
ajoutée le jour où **un geste non ambigu** sera conçu ».

> **Ce geste est un menu ouvert à l'endroit où le pointeur a lâché.** Le choix est explicite,
> local, et fait par le créateur.

C'est le menu que toute création ouvre déjà dans cet Editor (ADR-0026 §10) ; il n'en est pas
créé un second.

**Atterrir sur un nœud existant n'ouvre aucun menu** : poser ce nœud *était* le choix. Un
dépôt sur un nœud **configure** ses params ; un dépôt sur toile nue **crée**, après la
question.

> **Étendu par ADR-0039 §3 — le dépôt crée un nœud FINI, pas un nœud à moitié rempli.**
> Le dépôt d'une propriété écrivait `component` et `property` et laissait la cible vide : le
> créateur devait ensuite draguer l'Object depuis la Hierarchy et tirer un fil vers `Target`,
> alors que l'Inspector affichait déjà cet Object au moment du geste. Le dépôt déclare
> désormais (ou réutilise) la prise `objectref` de cet Object et vise le nœud dessus, sous
> **un seul batch**. Ce qui entre dans le `.px` est inchangé : un NOM de prise et deux
> identités de portée projet — l'`ObjectId` voyage avec le glissement et n'est écrit nulle
> part (invariant 1 d'ADR-0034).

### 2.5 Le typage reste la chaîne existante

```
Reference → Object → Component → Property → PropertyType
```

Le type d'un port vient de `(componentType, propertyId)` par `portTypeOf()` — **jamais de
l'Object**, qui n'y contribue rien et ne le peut pas (aucune Scene dans le contexte de port).
Une propriété `objectref` est portée comme `object` (ADR-0036). Aucune table de types
parallèle, `typesCompatible()` intact, aucune famille de ports nouvelle.

### 2.6 Les références invalides restent visibles

Rien n'est réécrit pour masquer un problème. Object supprimé → la valeur d'instance est
conservée, résout vers `null`, l'Inspector l'affiche en rouge (ADR-0034 §3.4, ADR-0036).
Component ou propriété disparus → `MISSING_PROPERTY`, nœud cerné, graphe non réécrit
(ADR-0027 §8).

---

## 3. Ce que cet ADR amende

| ADR | Section | Ce qui change |
|---|---|---|
| **0034** | §3.7, ligne *Object* | l'argument **(b)** — « un geste écrirait dans deux ressources ayant deux piles d'undo » — supposait un encodage par **tag**, donc une écriture dans la scène. La prise n'écrit qu'une ressource : l'argument tombe. L'argument **(a)** — pas de nom d'affichage servant d'identité — **reste, et est respecté** : le nom nomme une propriété, l'`id` porte le lien |
| **0034** | « ne décide pas » | « le dépôt d'un Object préremplissant un nœud » cesse d'attendre ADR-0024 |
| **0027** | §11 | le refus du dépôt d'une propriété est levé, par le geste non ambigu que §11 appelait |

**Restent valides et intouchés :** ADR-0034 invariants 1-7, §3.1 à §3.6 ; ADR-0023 ;
ADR-0027 §3, §5, §8, §9 ; ADR-0036 ; ADR-0024. **Reste refusé :** le port `component`
(ADR-0034 §3.2) — rien ne le consomme dans ce modèle.

---

## 4. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Aucune identité de scène dans un `.px` | le payload sérialisé ne contient aucun `ObjectId`, l'Object déposé fût-il réel |
| Un dépôt d'Object est un seul geste | un `undo` retire la propriété **et** le nœud ; un `redo` les remet |
| Un dépôt ne touche pas la Scene | aucune Operation sur la pipeline de la scène ; sérialisation identique |
| Un nom de prise n'écrase rien | deux dépôts du même Object déclarent `Player` puis `Player 2` |
| Le choix Get/Set est explicite | sans réponse du menu, aucun nœud n'est créé |
| Un dépôt sur un nœud configure, ne crée pas | le nombre de nœuds ne change pas |
| Le type est celui de la propriété | le port d'un nœud configuré porte le type déclaré, `objectref` excepté (ADR-0036) |

---

## 5. Conséquences

### Positives

- Un créateur prend ce qu'il voit et le dépose ; il n'a plus à connaître `Get Property On`
  avant d'avoir commencé.
- Un `.px` reste réutilisable, et la prise nommée le **montre**.
- Un nœud configuré se lit : `Get Health.hp`, `Player`.
- Aucun geste ne franchit deux piles d'undo.

### Négatives

- La valeur d'instance reste à renseigner : déposer *Player* ne fait pas pointer la prise
  vers Player, il déclare la prise. C'est le prix de la réutilisabilité, et il est
  volontairement payé (voir §6).
- Le `.px` gagne une propriété par Object déposé. Un créateur qui en dépose cinq déclare cinq
  prises, ce qui est ce qu'il a demandé mais qu'il peut ne pas avoir voulu.

---

## 6. Ce que cet ADR laisse ouvert

| Point | Pourquoi |
|---|---|
| **Préremplir la valeur d'instance** quand le `.px` n'est attaché qu'à un seul Object | seul endroit où une écriture inter-ressources réapparaîtrait ; à décider avec ADR-0024, pas au détour d'un dépôt |
| ~~**Le geste de drag d'une ligne de propriété dans l'Inspector**~~ | **Tranché (ADR-0039) :** la poignée dédiée que ce point appelait existe — six points sur la ligne, qui arrêtent le `pointerdown` pour que le scrub du libellé ne voie jamais les événements d'un glissement. Une ligne appariée (`Position`) n'en a pas : c'est deux propriétés, et le Core n'a pas de type vecteur (ADR-0023 §2) |
| **Un type de port `component`** | refusé par ADR-0034 §3.2 ; rien ne le consomme |
