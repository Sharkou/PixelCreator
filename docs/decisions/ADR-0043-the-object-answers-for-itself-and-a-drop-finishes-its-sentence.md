# ADR-0043 — L'Object répond de lui-même, un dépôt finit sa phrase, et une intention vaut un nœud

- **Statut :** **accepté** (2026-08-29)
- **Décide :** comment un graphe atteint les propriétés propres de l'Object ; où va l'`ObjectId`
  quand un dépôt nomme un Object ; ce qui justifie un nœud utilitaire ; ce qui reste refusé
- **Dépend de :** ADR-0001 (Object reste Object), ADR-0002 (Transform est un Component),
  ADR-0007 (Inspector à schéma), ADR-0023 (`PropertyType`), ADR-0024 (undo par ressource),
  ADR-0026 (drag & drop), ADR-0027 (modèle de graphe), ADR-0034 (références d'Object),
  ADR-0037 (un dépôt déclare), ADR-0039 (portée d'une identité), ADR-0040 (un nœud par
  intention), ADR-0041 (moments, états, chemins de propriété)
- **Amende :** ADR-0037 §2.4 (le dépôt d'un Object n'écrit plus *seulement* dans le `.px`) ;
  ADR-0007 (les champs d'Object de l'Inspector sont dérivés, non réécrits)
- **Ne décide pas :** un port `component` ou `property`, toujours refusés (§5) ; le dépôt d'un
  Component dans un graphe, toujours refusé (§6) ; une phrase de refus pour la liste de
  Components de l'Inspector (§7)

---

## 1. Le défaut : les quatre propriétés qu'un débutant voit d'abord étaient les quatre qu'un graphe ne pouvait pas toucher

L'Inspector ouvre sur `Name`, `Tag`, `Layer`, `Active`. Ce sont littéralement les premières
lignes qu'un créateur rencontre. Aucune n'était atteignable depuis un graphe.

La cause n'est pas un oubli, c'est une conséquence : le sélecteur de propriétés est alimenté
par le **registre des Components** (`componentCatalogue()`), et ces quatre-là n'appartiennent à
aucun Component — elles appartiennent à l'Object (ADR-0001). Rien ne les déclare, donc rien ne
les offre.

Mesuré : `objectFields()` les écrivait **à la main** dans l'Editor, et le Core n'en disait rien.
Deux lecteurs, une seule liste écrite, l'autre inexistante.

> « Éteins cet ennemi », « renomme cet objet », « change son plan de dessin » : trois phrases
> ordinaires, inécrivables.

---

## 2. Décision : `Object` est un ESPACE DE NOMS de propriétés, jamais un Component

> **`component: 'Object'` dans un `.px` se résout vers l'Object lui-même. Ce n'est pas un type,
> ce n'est dans aucun registre, et `getComponent('Object')` ne répondra jamais.**

| | |
|---|---|
| **Problème** | Le seul chemin qui menait à une propriété passait par un Component. Les quatre propriétés de l'Object n'en ont pas. |
| **Décision** | Le Core déclare `OBJECT_COMPONENT = 'Object'` et `objectProperties()` — `name`, `tag`, `layer`, `active`, dans la forme exacte que `declaredProperties()` rend. Le sélecteur ouvre sur ce groupe ; l'interprète, en le voyant, rend **l'Object** au lieu d'un de ses components. |
| **Justification UX** | Le créateur lit `Object ▸ Name` à côté de `Transform ▸ X`, dans une seule liste groupée. Il n'apprend rien de neuf : c'est la forme d'ADR-0041 §2, appliquée à ce qui était déjà sous ses yeux. |
| **Impact Core** | Une déclaration (`core/object.js`), deux branches (`targetComponent()`, `catalogueOf()` dans `graph/standard.js`). Aucun type nouveau, aucun `PropertyType` nouveau, aucun port nouveau. |
| **Impact runtime** | Aucun mécanisme nouveau : l'Object est déjà le Proxy réactif que la Scene tient, donc `object.name = …` depuis un graphe est le même `Change` que depuis l'Inspector (ADR-0003, ADR-0015 §5). |
| **Sérialisation** | `component: 'Object'` est un **mot fixe du moteur**, de portée projet exactement comme `'Transform'`. Aucune identité de scène n'entre nulle part : ADR-0034 invariant 1 est intact. |
| **Migration** | Aucune. Aucun graphe existant ne nomme `Object`. |

### 2.1 Pourquoi pas un vrai Component

Un `ObjectProperties` enregistré aurait donné le même sélecteur — et aurait menti trois fois :
il serait apparu dans **Add Component**, il aurait pu être **retiré** d'un Object, et il aurait
fallu l'ajouter aux cinquante objets d'une scène existante pour que leurs graphes marchent.
Un Object *a* un nom ; il ne se le fait pas donner.

### 2.2 Ce qui protège le mot

Le sentinelle est un mot, donc quelque chose pourrait le prendre. Trois faits le rendent sûr, et
le troisième est un test :

- aucune classe livrée ne s'appelle `Object` ;
- un `.px` est identifié par sa `ResourceId` et ne peut pas réclamer un nom ;
- `builtins.test.js` échoue le jour où un type enregistré s'appelle `Object`.

### 2.3 `lock` et `owner` sont absents, délibérément

`lock` est un confort d'édition que la Hierarchy possède et que la simulation ne lit jamais ;
`owner` nomme un joueur et appartient au vocabulaire multijoueur, qui n'a pas encore d'histoire
côté créateur. Ni l'un ni l'autre n'est une propriété du **jeu**.

### 2.4 Une déclaration, deux lecteurs

`objectFields()` (Inspector) **dérive** désormais de `objectProperties()`. Les libellés et les
infobulles restent dans l'Editor — c'est de la présentation — mais la liste et les types
viennent du Core. Écrite deux fois, elle aurait divergé au cinquième champ, et un créateur
aurait rencontré une propriété d'un côté et pas de l'autre.

---

## 3. Décision : un dépôt qui NOMME un Object écrit son identité dans la SCÈNE

> **Le `.px` reçoit un nom de prise. La scène reçoit l'`ObjectId`. Un seul geste fait les deux.**

| | |
|---|---|
| **Ancienne décision** | ADR-0037 §2.4 : déposer un Object sur un graphe déclare une propriété `objectref` nommée d'après lui, et un nœud qui la lit — et **s'arrête là**, « une seule ressource est écrite ». |
| **Problème, mesuré** | Le geste produisait un nœud qui *paraissait* fini et ne faisait **rien**. La prise valait `null` sur chaque exemplaire, donc `Set Property` visé dessus n'écrivait nulle part, en silence (ADR-0034 §3.4 — et c'est correct). Il fallait ensuite sélectionner chaque Object porteur et régler la valeur dans l'Inspector : trois étapes que rien n'annonce. C'est la façon la plus courante dont cette fonctionnalité échouait. |
| **Nouvelle décision** | Le geste écrit aussi la valeur d'instance : pour chaque Object de la **scène ouverte** portant ce Component, la prise est pointée sur l'`ObjectId` nommé — **uniquement là où rien n'est encore répondu**. |
| **Justification UX** | « Fais glisser Player sur ton graphe » doit produire un graphe qui **tourne**. Le modèle de ADR-0037 reste enseignable — un `.px` déclare une entrée, chaque Object dit quoi y brancher — mais un défaut se constate, il ne se cherche pas. |
| **Impact Core** | Aucun. La commande vit dans l'Editor (`editor/commands.js:pointSocketAt`). |
| **Impact runtime** | Aucun. |
| **Sérialisation** | Aucune du côté `.px`. Côté scène, c'est une valeur `objectref` ordinaire, celle qu'ADR-0034 §3.5 a définie. |
| **Migration** | Aucune. Les `.px` déjà écrits gardent leurs prises ; elles se remplissent au prochain dépôt. |

### 3.1 Seulement là où rien n'est répondu

Un créateur qui a visé la porte n°3 sur un autre Player le garde. **Un geste qui nomme un défaut
ne doit pas défaire une décision.** La règle est donc « remplir le vide », jamais « écraser ».

### 3.2 Deux ressources, deux annulations — et c'est dit

Le geste écrit dans le `.px` et dans la Scene. ADR-0024 donne à chaque ressource sa pile, donc
`Ctrl Z` sur la toile retire la prise et le nœud, et les valeurs que la scène a gagnées
s'annulent sur la pile de la scène.

C'est exactement la forme qu'ADR-0041 §6.2 a déjà tranchée pour le dépôt d'un fichier, et le
moins surprenant des deux partages : une scène continue de pointer vers l'Object qu'un créateur
a désigné même s'il change d'avis sur le nœud.

**ADR-0037 §2.4 est amendé sur ce point, et sur celui-là seulement.** Sa phrase « une seule
ressource est écrite » servait à écarter la question d'annulation inter-ressources ; cette
question a depuis reçu sa réponse (ADR-0041 §6.2), donc la prémisse a cessé d'être nécessaire.
L'invariant qu'elle protégeait — aucune identité de scène dans un `.px` — n'est pas touché.

### 3.3 Les écritures sont AUTORISÉES, pas silencieuses

`setProperty()`, comme toute valeur que l'Editor écrit : une Operation, répliquée, annulable
(CONVENTIONS.md). Une écriture simple aurait atteint la valeur sans jamais atteindre l'historique.

---

## 4. Décision : `Translate` — une intention mérite un nœud, une mécanique n'en mérite pas

> **`Translate` déplace un Object relativement à sa position. Ce n'est pas `Set Position`, et
> les deux restent.**

| | |
|---|---|
| **Problème, compté** | Avancer d'un cran le long de X coûtait `Get Property ▸ x` + `Add` + `Set Property ▸ x` : trois nœuds, deux fils, deux passages dans le sélecteur. Sur les deux axes, **six nœuds**. Aucun des trois ne parle de déplacer ; ils parlent de la manière dont un déplacement se calcule. |
| **Décision** | Un nœud `transform.translate`, catégorie `Properties`, avec `Object` (prise + sélecteur, comme Get/Set Property), `X`, `Y`, et un flux d'entrée/sortie. |
| **Justification UX** | « Bouge » est une intention ; `Get`, `Add`, `Set` sont sa mécanique (ADR-0040). Le critère n'est pas « combien de nœuds économisés » mais « est-ce une phrase que le créateur pense ». |
| **Pourquoi pas une septième catégorie** | Une catégorie répond à « qu'est-ce que ce nœud EST » (ADR-0039 §2) et lui donne une teinte. `Translate` change ce qu'un Object tient — c'est la famille `Properties`, la même que le `Get`+`Add`+`Set` qu'il abrège. |
| **Pourquoi X et Y et pas un Vector2** | Le Core n'a pas de type vecteur, et ADR-0023 §2 a retiré l'idée délibérément. `x` et `y` sont deux nombres partout ailleurs — dans Transform, dans la rangée appariée de l'Inspector, dans `Pointer`. Inventer un type pour un nœud serait l'abstraction que ce catalogue existe sans. |
| **Espace local** | `Transform.x` est une position dans l'espace du parent (ADR-0002), donc `Translate` s'y ajoute. Un déplacement en espace monde exigerait l'inverse de la matrice du parent et contredirait discrètement le nombre que l'Inspector montre pour le même Object. |
| **Un Object sans Transform** | Rien ne se passe, rien n'est levé, le flux continue — la famille d'échec d'ADR-0034 §3.4. |

### 4.1 Ce qui n'a PAS été ajouté, et pourquoi

`Set Position`, `Rotate`, `Scale`, `Clamp`, `Destroy`, `Spawn`, `Random`, `Delay` restent
absents. `Translate` a été admis parce qu'il abrège une phrase **mesurée** à six nœuds ; les
autres attendent la même mesure. En particulier : `Destroy` et `Spawn` sont des changements
**structurels** de la Scene, et ADR-0034 invariant 5 dit qu'un nœud ne produit aucune Operation
— c'est une décision à prendre, pas une ligne à écrire. `Random` et `Delay` heurtent le
déterminisme (ADR-0011) et l'absence d'état d'exécution par instance.

---

## 5. Refusé : un Component ou une propriété fournis par un fil

La question a été reposée sérieusement, avec le code sous les yeux.

**Ce n'est pas faisable proprement, et la raison est le typage, pas le conservatisme.**

Le port de sortie de `Get Property` est typé par `resolvedProperty(node, context)`, résolu
**localement**, depuis les params du nœud lui-même. C'est ce qui permet trois choses :

| Ce que le typage local donne | Ce qu'il devient si le Component arrive par un fil |
|---|---|
| Le port de sortie a le type exact de la propriété | il retombe sur `ANY_TYPE` |
| Le sélecteur propose les propriétés du type nommé | il n'a rien à proposer |
| Un mauvais fil est refusé **au moment du geste** (`canConnect`) | il n'est plus refusable qu'à l'exécution |
| `shapeDependsOnNode()` sait quand redessiner | la forme dépendrait de la topologie du graphe |

C'est exactement le scindage `Get Component → Get Property` qu'ADR-0034 §3.3 a écarté par
argument, et qu'ADR-0039 §4 a confirmé en refusant les types de port `component` et `property`.

**Décision : inchangé.** Ce qu'un créateur veut réellement — « lire telle propriété de tel
Component, sur un Object éventuellement dynamique » — est déjà entièrement exprimable : la
**propriété** est l'intention et elle est connue à l'écriture ; l'**Object** est ce qui varie,
et il varie déjà (prise, sélecteur, ou `Self`). Une demi-solution n'est pas fabriquée.

---

## 6. Refusé, pour la troisième fois : un Component déposé dans un graphe

| Geste | Ce que le créateur veut | Ce qui est produit | Durable ? |
|---|---|---|---|
| **Object → graphe** | « travailler sur cet Object » | une entrée nommée, un nœud qui la lit, et la scène pointée dessus (§3) | oui |
| **Property → graphe** | « lire/écrire cette valeur » | un nœud visé et configuré | oui |
| **Component → graphe** | — | un paramètre que le premier clic réécrit | **non** |

Le sélecteur de propriété écrit **les deux moitiés**. Un dépôt de Component règle `component` et
laisse `property` ouverte ; choisir la propriété — la toute première chose que le créateur fera —
réécrit `component`. Mesuré une fois (ADR-0040 §4), remesuré (ADR-0041 §6.1), inchangé ici.

Un Component garde une signification, une seule : **se donner à un Object**. Le refus le dit.

---

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `Object ▸ Name/Tag/Layer/Active` est offert par le sélecteur, en premier groupe | `inspector/node.test.js` |
| Aucun type enregistré ne s'appelle `Object` | `runtime/builtins.test.js` |
| Les rangées d'Object de l'Inspector et le groupe du sélecteur viennent d'une seule déclaration | `inspector/schema.test.js` |
| Écrire `Object ▸ Active` depuis un graphe retire l'objet de l'image suivante | `runtime/pipeline.test.js` |
| Un dépôt d'Object pointe les exemplaires de la scène, et seulement ceux qui n'ont pas de réponse | `editor/commands.test.js` |
| Une prise vide ou morte n'écrit rien et ne rapporte rien | `runtime/pipeline.test.js` |
| `Translate` ajoute, deux fois de suite ajoute deux fois | `interpreter.test.js` |
| `Translate` et `Get`+`Add`+`Set` atteignent le même état | idem |
| Une touche pressée déplace l'objet, et l'image le dessine à sa nouvelle place et pas à l'ancienne | `runtime/pipeline.test.js` |
| Un fichier déposé sur la liste de Components importe et attache | `dnd/dnd.test.js` |

## 8. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| Une phrase de refus pour la liste de Components de l'Inspector | Un refus silencieux y existe déjà pour les ressources non consommables ; le combler est cohérent (ADR-0026 §6) mais concerne toute la zone, pas cette tranche |
| `Destroy`, `Spawn` | Changements structurels de la Scene ; ADR-0034 invariant 5 doit être tranché d'abord |
| `Random`, `Delay` | Déterminisme (ADR-0011) et état d'exécution par instance |
| Une transition d'input plus courte qu'un pas | Antérieur, consigné par ADR-0041 §3.4 |
| Un sélecteur d'Object listant la scène depuis le nœud | Le glisser-déposer est le geste conçu, et il suffit désormais ; un sélecteur de scène dans un éditeur de portée projet est une question distincte |
