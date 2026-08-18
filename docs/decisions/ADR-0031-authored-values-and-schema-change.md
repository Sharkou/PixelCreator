# ADR-0031 — Une valeur autorisée vit sur l'instance, une déclaration vit sur le type, et changer le type ne détruit pas ce qu'un créateur a écrit

- **Statut :** **accepté** (2026-08-18)
- **Dépend de :** ADR-0003 (Property System), ADR-0007 (schéma d'Inspector), ADR-0008 (Operations), ADR-0011 (autorité), ADR-0016 (définition de Component), ADR-0021 (identité de Component), ADR-0023 (types de propriétés), ADR-0024 (Undo/Redo), ADR-0026 (`.px` = une ressource), ADR-0027 (modèle de graphe), ADR-0030 (références et rangs)
- **Amende :** ADR-0023 (`enum` et `array` n'avaient pas de configuration), ADR-0027 (un port n'avait pas de valeur d'instance)

## Contexte observé

Un audit headless des cycles de vie que l'Editor prétend supporter (ressources, `.px`,
descripteurs) est passé sur **tout** sauf trois points — et ces trois-là ne sont pas des
bugs, ce sont les trois endroits où **une décision manque** :

| Constat mesuré | Ce qui manque |
|---|---|
| `fieldFor('x', { type: 'enum' })` → `readonly` | un `enum` déclaré par un créateur n'a **nulle part** où mettre ses options |
| `fieldFor('x', { type: 'array' })` → `readonly` | idem pour les éléments d'une liste |
| `graph.addNode({ type: 'math.add' }).params` → `{}`, `ports.inputs[].default` → `0` | un port porte le défaut **du type**, et l'instance n'a aucun endroit où en écrire un autre |
| une propriété ajoutée à un `.px` déjà attaché : `instance.speed` → `undefined` | rien ne dit ce qu'un changement de schéma fait aux instances vivantes |

Les trois posent **une seule** question, et c'est pour cela qu'ils sont dans un seul ADR :

> **Où vit une valeur qu'un créateur a écrite, quand ce qu'elle configure appartient à un
> type — et que le type peut changer ?**

## La contrainte qui tranche : le multijoueur

`docs/PROJECT.md` §3.2 : le serveur exécute la même `Scene` et le même Core. Cela n'est pas
une intention lointaine, c'est ce qui **élimine** la moitié des réponses possibles :

- une valeur autorisée doit être **sérialisable** — sinon elle ne traverse pas le réseau ;
- elle doit changer par une **Operation** — sinon elle ne se réplique pas et ne s'annule pas
  (ADR-0008, ADR-0024) ;
- sa résolution doit être **déterministe et pure** — même graphe, mêmes entrées, même état,
  sur le client comme sur le serveur (ADR-0011) ;
- rien de tout cela ne doit demander de DOM (ADR-0006).

Toute solution qui garde une valeur « dans le contrôle » ou « dans le panneau » est donc
morte avant d'être écrite. C'est le filtre appliqué aux trois sections ci-dessous.

## Décision

### 1. Un port a une valeur d'instance, à côté des params — amende ADR-0027

**VALIDÉ.** Un nœud gagne **un** champ, symétrique de `params` :

```js
{ id, type, x, y, params: {…}, inputs: { a: 3 } }
```

`inputs` associe un **identifiant de port d'entrée** à la valeur que ce port prend **quand
rien n'y est branché**.

**La priorité, dans cet ordre, et il n'y en a pas d'autre :**

```
connexion  >  node.inputs[port]  >  port.default déclaré par le type
```

C'est l'ordre du plus spécifique au plus général, et c'est le seul qui rende les trois
utiles : une connexion est un choix explicite et immédiat ; une valeur d'instance est un
choix explicite et durable ; un défaut de type est ce que le catalogue promet à un nœud que
personne n'a touché.

**Résolu en UN endroit**, `defaultOf()` dans `runtime/scripting/interpreter.js` — la
fonction qui répond déjà « que vaut une entrée non connectée ». Elle consulte `node.inputs`
avant le port. Il n'y a pas de second chemin, donc pas de moyen pour l'Editor et le Runtime
de répondre différemment.

**Pourquoi pas dans `params`.** `params` est ce que le TYPE déclare (`definition.params`) ;
les entrées sont ce que le type déclare comme PORTS. Les mélanger ferait qu'un type gagnant
un param nommé comme un port écraserait silencieusement une valeur, et qu'un `Set Property`
— qui a un param `property` **et** un port `value` — n'aurait plus deux espaces de noms.

**Pourquoi pas un nœud « Number » branché à la place.** C'est ce qu'il fallait faire jusqu'à
maintenant, et c'est la raison de cette décision : trois nœuds littéraux pour additionner
deux constantes, c'est un graphe qui décrit sa propre plomberie.

**Ce que ça coûte :** rien de neuf. `setInput()` soumet un `SET_PROPERTY` sur `inputs`,
exactement comme `setParam()` le fait sur `params` — donc réplication, inversion et
historique sont déjà écrits. La sérialisation écrit `inputs` seulement quand il n'est pas
vide, donc un graphe existant ne change pas d'un octet.

**Une valeur d'instance sur un port CONNECTÉ est conservée, pas effacée.** Débrancher un fil
rend la valeur qui était là avant — ce qui est ce qu'un créateur attend, et ce qui rend le
branchement/débranchement non destructeur. L'Editor la montre grisée pendant qu'elle est
masquée par une connexion.

### 2. `Choice` : les options vivent dans le descripteur — amende ADR-0023

**VALIDÉ.** Une propriété `enum` déclarée par un créateur porte ses options **dans son
propre descripteur**, sous `values` — le champ qu'ADR-0007 lit déjà pour les composants
écrits en JavaScript :

```js
properties: {
  color: { id: 'p_1', type: 'enum', values: ['red', 'green', 'blue'], default: 'red' }
}
```

**Pas de ressource, pas de structure dédiée, et c'est la partie qui mérite d'être défendue.**
Une « ressource Enum » partageable est séduisante et fausse ici : elle ajoute une identité,
un cycle de vie, une résolution, une référence cassée possible et une question de propriété
— pour une liste de trois mots qui appartient à une propriété d'un seul Component. Le jour
où deux Components doivent partager une énumération, ce sera une ressource, et cette
décision-ci ne l'empêche pas : `values` deviendra une référence, ce qui est exactement le
mouvement qu'ADR-0030 §1 a fait pour `resource`.

| Question | Réponse |
|---|---|
| **Identité d'une option** | **Aucune.** Une option EST sa valeur. C'est ce qui est stocké dans l'instance, ce qui est sérialisé et ce qu'un nœud compare. Ajouter un id demanderait une table de correspondance et une migration à chaque renommage, pour un gain nul : renommer une option **est** changer la valeur, et §4 dit ce que ça fait aux instances |
| **Ajouter / supprimer / réordonner** | `setPropertyField(id, 'values', [...])` — un `SET_PROPERTY` sur le descripteur réactif, donc réplicable, inversible, une entrée d'historique par session de frappe (ADR-0027 §renommage) |
| **Valeur par défaut** | La première option, quand celle qui était choisie disparaît. Un `enum` dont le défaut n'est pas dans ses options est une valeur invalide au sens d'ADR-0023 |
| **Sérialisation** | `values` est un tableau de chaînes dans le payload `.px`. Déjà JSON |
| **Zéro option** | Reste `readonly`, **et c'est correct** : un choix sans choix n'est pas un contrôle. L'Inspector le dit au lieu de dessiner une liste vide |

### 3. `List` : homogène, typée par déclaration — amende ADR-0023

**VALIDÉ.** Une `array` déclare **le type de ses éléments** :

```js
properties: { waypoints: { id: 'p_2', type: 'array', of: 'number', default: [] } }
```

**Homogène, et le refus de l'hétérogène est la décision.** Une liste hétérogène n'a pas de
contrôle possible (quel champ dessine-t-on ?), pas de validation possible, et pas de port
possible dans un graphe — `typesCompatible()` n'aurait rien à comparer. Un créateur qui veut
des choses différentes ensemble veut un Component, pas une liste.

`of` prend n'importe quel `PropertyType` **sauf `array`** : une liste de listes est une
structure, et une structure est la question qu'ADR-0023 laisse ouverte, pas celle-ci.

| Question | Réponse |
|---|---|
| **Défaut** | `[]`. Jamais `null` : une liste vide est une liste, l'absence de liste n'est pas un état qu'un créateur peut vouloir |
| **Ajouter / supprimer / réordonner** | Sur la valeur, par `setProperty` du tableau complet — une liste est **une valeur**, pas une collection structurelle. Les Operations structurelles (ADR-0019) sont pour ce qui a une identité ; un élément de liste n'en a pas |
| **Édition** | Une ligne par élément, avec le contrôle de `of` — la même dérivation que partout ailleurs, donc rien de neuf à écrire par type |
| **Sérialisation** | Un tableau JSON de valeurs déjà sérialisables, puisque `of` est un `PropertyType` |
| **`of` absent** | `any`, et la liste est en lecture seule : on peut voir ce qu'elle contient, pas l'éditer. Honnête plutôt que deviné |

### 4. Changer le schéma d'un `.px` : les instances se **réconcilient**, elles ne se remplacent pas

**VALIDÉ.** C'est la décision la plus lourde des quatre.

Ce qui se passait : `definitions.install()` réenregistrait la classe, et les instances déjà
attachées gardaient l'ancienne — donc une propriété ajoutée était invisible jusqu'à un
rechargement de scène. Ce qui NE doit pas se passer : recréer les composants, ce qui
effacerait toutes les valeurs qu'un créateur a réglées.

**La réconciliation, propriété par propriété :**

| Cas | Ce qui arrive à l'instance | Pourquoi |
|---|---|---|
| **Propriété ajoutée** | prend la valeur par défaut déclarée | c'est ce qu'une instance neuve aurait ; il n'y a pas d'autre valeur candidate |
| **Propriété supprimée** | la valeur est **retirée** de l'instance | la garder ferait une donnée que rien ne lit, que la sérialisation écrirait et qu'aucun panneau ne montrerait |
| **Propriété renommée** | la valeur **suit le nom**, parce que l'identité suit | un descripteur porte un `id` stable (ADR-0027) : renommer n'est pas supprimer-puis-ajouter, et le modèle le sait déjà |
| **Type changé** | la valeur est remise au défaut du nouveau type | `setPropertyType()` fait déjà exactement ça sur le descripteur (ADR-0027) ; l'instance suit la même règle plutôt qu'une deuxième |
| **Valeur locale d'une propriété conservée** | **intacte** | c'est tout l'intérêt : changer une déclaration ne doit pas coûter le réglage de trente objets |

**Elle est AUTOMATIQUE, et non versionnée.** Un schéma de `.px` n'a pas de version parce
qu'il n'a pas d'historique publié : c'est un fichier du projet ouvert, édité par la personne
qui l'utilise, dans la même session. Une migration versionnée sert à faire traverser un
format à des données qu'on ne contrôle plus ; ici les deux côtés sont sous la main. Ce qui
serait faux serait de demander un clic : « votre Component a changé, voulez-vous mettre à
jour les objets ? » est une question dont la réponse est toujours oui.

**Elle passe par des Operations.** Chaque valeur ajoutée ou retirée est un `SET_PROPERTY`
sur le composant, `origin: EDITOR`, groupée sous **un** `batch` — donc un `Ctrl Z` défait la
réconciliation entière, elle se réplique, et un serveur qui rejoue la session obtient le
même état. C'est ce qui la rend compatible avec ADR-0011 plutôt que d'être une écriture
sauvage.

**Un type de `.px` est UNE classe pour toute la session, mise à jour sur place.**

C'est la partie que la première rédaction de cet ADR avait sautée, et l'implémentation l'a
trouvée : réconcilier les *valeurs* ne suffit pas. Une instance porte sa classe, et
`componentSchema(instance)` lit `instance.constructor.schema` — donc réenregistrer une
**nouvelle** classe laissait chaque instance déclarer l'ancien schéma. L'Inspector
n'affichait aucune ligne, alors que la valeur venait d'être écrite.

Les deux issues possibles, et pourquoi une seule tient :

| Issue | Verdict |
|---|---|
| Remplacer l'instance par une neuve et recopier les valeurs | Change l'identité du composant, son rang dans la collection (ADR-0018) et casse toute référence tenue ailleurs |
| **Garder la classe, mettre son schéma à jour sur place** | L'identité d'un type EST sa ResourceId (ADR-0021) : deux classes pour un type étaient déjà l'anomalie |

Donc l'installateur tient **un enregistrement de schéma vivant par type**, et une
réinstallation le **mute** au lieu de le remplacer. Le constructeur généré par
`defineComponent()` itère cet enregistrement à chaque construction, et `static schema`
pointe dessus — la même référence, donc les instances anciennes et neuves lisent la même
chose, par construction plutôt que par synchronisation.

**Le Core ne change pas d'une ligne.** C'est la couche Project qui décide qu'un type a une
classe pour la session, ce qui est exactement le genre de décision qu'ADR-0016 lui laisse.

**Les nœuds qui référencent une propriété supprimée ne sont pas réécrits**, et ADR-0027 a
déjà tranché ça : `validateGraph()` retourne `MISSING_PROPERTY`, la fenêtre marque le nœud,
l'interprète lève une `GraphError` structurée. Une réconciliation qui débrancherait des
nœuds ferait qu'annuler une suppression de propriété ne rendrait pas le graphe.

### 5. Ce que tout cela préserve pour le multijoueur

Chacune des quatre décisions produit **de la donnée JSON changée par des Operations** :

- `node.inputs` : sérialisé avec le nœud, écrit par `SET_PROPERTY` ;
- `values` et `of` : dans le payload `.px`, écrits par `SET_PROPERTY` ;
- la réconciliation : une suite de `SET_PROPERTY` sous un batch.

Rien n'introduit d'état vivant hors modèle, rien ne dépend de l'ordre dans lequel une
fenêtre s'est ouverte, et rien n'exige un navigateur. Le serveur qui exécutera `advance()`
sur la même `Scene` lira les mêmes valeurs par le même `defaultOf()`.

## Ce que cet ADR ne décide pas

- **Les structures** (un type `object` avec des champs nommés) : ADR-0023 les laisse
  ouvertes et §3 s'arrête volontairement avant.
- **Le partage d'une énumération entre deux Components** (§2) : ce sera une ressource, le
  jour où deux Components la demandent.
- **Le protocole réseau lui-même** : rien ici n'en écrit une ligne, et c'est délibéré.
- **La migration d'un projet enregistré vers un format futur** : §4 traite une session
  vivante, pas un fichier venu d'une autre version.

## Conséquences

### Positives

- Un `Add` s'additionne sans trois nœuds littéraux autour.
- `Choice` et `List` cessent d'être des entrées de menu qui ne mènent nulle part.
- Déclarer une propriété sur un `.px` la fait apparaître sur les objets qui le portent déjà,
  sans perdre un seul réglage.
- Les quatre passent par le même chemin que tout le reste : Operation, historique,
  réplication.

### Négatives

- Le format de nœud gagne un champ. Borné : omis quand vide, donc invisible pour un graphe
  qui n'en a pas.
- La réconciliation écrit dans la scène quand un `.px` change, donc marque le projet comme
  modifié. Correct — il l'est — mais c'est un effet qu'un créateur verra sans l'avoir demandé
  explicitement.
- Une liste homogène refuse un cas que quelqu'un finira par vouloir. Assumé (§3).

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Valeur de port dans `params`** | Un type qui gagne un param homonyme d'un port écrase une valeur en silence |
| **Défaut de port modifié sur le TYPE** | Le catalogue est partagé : régler `a = 3` sur un `Add` les changerait tous |
| **Options d'enum dans une ressource** | Une identité, un cycle de vie et une référence cassable pour trois mots |
| **Options d'enum avec un id par option** | Une table de correspondance et une migration par renommage, pour un gain nul |
| **Liste hétérogène** | Aucun contrôle, aucune validation, aucun port possible |
| **Migration versionnée du schéma `.px`** | Un format à faire traverser à des données qu'on contrôle des deux côtés |
| **Recréer les composants au changement de schéma** | Efface toutes les valeurs réglées, ce que la migration existe précisément pour éviter |
| **Une nouvelle classe par réinstallation** | Les instances existantes déclarent alors l'ancien schéma : la valeur est écrite et aucun panneau ne la montre |
| **Demander confirmation avant de réconcilier** | Une question dont la réponse est toujours oui |
