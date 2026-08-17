# ADR-0023 — `PropertyType` appartient au Core, `FieldKind` en est dérivé dans l'Editor

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0007 (Inspector à schéma)
- **Complète :** ADR-0007, § « Types envisagés »

## Contexte observé

Trois listes de types coexistaient, et aucune n'était la même :

| `core/definition.js` — `DEFAULTS` | `editor/inspector/schema.js` — `FieldKind` | ADR-0007 (envisagés) |
|---|---|---|
| number, int, boolean, string, color, array, **object** | number, int, **range**, boolean, string, color, **enum**, **readonly** | number, int, boolean, string, color, enum, range, vector2, resource, object, array, action |

Et dans le code livré : `Sprite.source` déclare `resource`, `Tilemap.tiles` et `palette`
déclarent `array` — trois propriétés dont le Core ne savait rien faire, et que l'Editor
affichait en lecture seule **par défaut de correspondance**, pas par décision.

`type: 'object'` n'apparaissait dans **aucun composant livré**. Seule occurrence du dépôt :
une fixture de test.

## Décision

La divergence n'était pas un oubli : **deux questions différentes étaient posées avec un
seul mot.**

- *« quelle forme a cette valeur ? »* → défaut, validation, sérialisation, réplication →
  **question du Core** ;
- *« avec quel contrôle l'éditer ? »* → curseur, case, sélecteur → **question de l'Editor**.

> **Le Core possède `PropertyType`. L'Editor en dérive `FieldKind`.**

### 1. `PropertyType` — huit membres, chacun justifié

| Type | Justification | Défaut |
|---|---|---|
| `number` | omniprésent | `0` |
| `int` | `layer`, `columns`, `rows` | `0` |
| `boolean` | `active`, `emitting`, `additive` | `false` |
| `string` | `name`, `tag` | `''` |
| `color` | `ParticleSystem.color`, `RectangleRenderer` | `''` |
| `enum` | déjà rendu par l'Inspector, sans défaut Core jusqu'ici | première valeur déclarée |
| `resource` | `Sprite.source` le déclare déjà ; indispensable au `.px` et aux Components utilisateur | `null` |
| `array` | `Tilemap.tiles` et `palette` le déclarent déjà | `[]` |

Pour chaque descripteur, le Core répond à trois questions : quelle est la valeur de départ
(`defaultForProperty`), cette valeur est-elle valide (`isValidValue`), comment se
sérialise-t-elle. **Un type est ajouté ici seulement quand le Core a les trois réponses.**

Aucun type n'est ajouté pour compléter une liste : deux étaient déjà déclarés dans le code
livré, un était déjà rendu, un est retiré.

### 2. `type: 'object'` est retiré

Sans schéma, sans validation, sans éditeur, sans sens pour la réplication. C'était le seul
membre que rien ne justifiait, et rien ne le déclarait.

### 3. Un type inconnu est refusé, pas ignoré

`defineComponent()` **jette** sur un `type` que le Core ne connaît pas. C'est ce qui
empêche une définition de déclarer une propriété que l'Inspector affichera en lecture seule
pour toujours, sans que personne ne sache pourquoi.

### 4. `FieldKind` est dérivé, membre par membre

La correspondance est **écrite**, pas laissée à une collision de noms : `number → NUMBER`
est une décision, pas une coïncidence, et `resource` comme `array` devaient y figurer pour
être **pris en charge** au lieu de tomber dans un défaut.

| `PropertyType` | `FieldKind` |
|---|---|
| number | NUMBER, ou **RANGE** quand `min` et `max` sont tous deux déclarés |
| int | INT |
| boolean | BOOLEAN |
| string | STRING |
| color | COLOR |
| enum | ENUM, ou READONLY quand `values` est vide |
| resource | READONLY *(voir ci-dessous)* |
| array | READONLY *(voir ci-dessous)* |

`resource` et `array` sont désormais de **vrais types au Core** — valeur de départ,
validation, sérialisation. Ce qui leur manque est un **contrôle** :

- un `array` affiche son nombre d'éléments, ce qui est vrai et utile ; l'éditer demande un
  contrôle de liste qui n'existe pas ;
- un `resource` porte un `ResourceId` **opaque** ; en choisir un demande un navigateur de
  ressources, dont la place est la fenêtre Project. Offrir un champ texte inviterait le
  créateur à écrire par-dessus et à casser la référence.

C'est un travail visible et nommé, plus une impasse silencieuse.

### 5. Deux membres de `FieldKind` n'ont pas de contrepartie au Core

- **`range`** n'est pas une forme de valeur : c'est un `number` borné aux deux bouts. Il est
  **dérivé** des contraintes qu'un composant déclare déjà, donc aucun composant n'est à
  réécrire — ADR-0007 le listait comme un type, c'est la même conclusion atteinte autrement.
- **`readonly`** est un repli d'affichage, jamais une donnée.

### 6. Écartés

| Type | Verdict |
|---|---|
| `vector2` | inutile — la table `PAIRS` de l'Inspector fait déjà de `x`/`y` une ligne unique |
| `action` | ce n'est pas une propriété. Un bouton est une commande, pas une donnée sérialisable. Sa place est un futur registre de commandes |

### 7. Le repli réflexif produit un `PropertyType`

La réflexion répond à la question du Core — quelle forme a cette valeur — et le contrôle en
est dérivé comme pour n'importe quelle autre. Une forme qu'elle ne sait pas nommer donne
`null`, et un descripteur sans forme s'affiche en lecture seule. **Le repli reste une
exigence, pas une tolérance** (ADR-0007).

## Ce que cet ADR ne décide pas

- Le contrôle de liste pour `array`, et le navigateur de ressources pour `resource`.
- La forme `min: 'max'` (une borne qui nomme une autre propriété), légale dans ADR-0007 :
  rien ne la lit encore, et elle est ignorée plutôt qu'à moitié honorée.

## Conséquences

### Positives

- Trois propriétés de composants livrés cessent d'être des impasses au Core.
- Un Component utilisateur ne peut plus déclarer une propriété que le Core initialise mal.
- La différence entre « forme de la valeur » et « contrôle d'édition » est nommée, donc
  elle cesse de dériver.

### Négatives

- `defineComponent()` devient plus strict : une définition qui déclarait `object` est
  refusée. Aucune n'existe.
- Une correspondance écrite à la main est une ligne à ajouter quand un type est ajouté —
  ce qui est le but : ajouter un type doit obliger à décider avec quoi on l'édite.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Une seule liste partagée** | Elle poserait deux questions avec un mot, ce qui est exactement la cause de la divergence mesurée. |
| **Garder `object`** | Invite à déclarer une propriété qu'on ne peut ni éditer, ni valider, ni differ. Rien ne la déclarait. |
| **Faire de `range` un type du Core** | Ce n'est pas une forme de valeur, et il se dérive de contraintes déjà déclarées. |
| **Laisser un type inconnu retomber en READONLY** | C'est ce qui rendait `resource` et `array` invisibles comme problème pendant des mois. |
