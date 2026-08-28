# ADR-0030 — Une référence se choisit, un rang est deux opérations, une recherche se note, et une palette répond à deux questions

- **Statut :** **accepté** (2026-08-18)
- **Amendé par :** ADR-0039 (2026-08-27) — la palette de §4 passe de six à sept teintes, parce que « rendre une référence » et « accéder à une propriété » ne pouvaient pas être distinguées avec six
- **Dépend de :** ADR-0007 (schéma d'Inspector), ADR-0018 (ordre structurel), ADR-0019 (Operations structurelles), ADR-0020 (Resources), ADR-0023 (types de propriétés), ADR-0024 (Undo/Redo), ADR-0026 (drag & drop transverse), ADR-0027 (modèle de graphe), ADR-0028 (reflow et feedback), ADR-0029 (transport)
- **Amende :** ADR-0023 (`resource` n'était pas éditable), ADR-0029 §7 (le Core gagne `restoreScene()`)

## Contexte observé

La passe précédente a livré le modèle. En s'en servant, quatre manques du même genre sont
apparus — **une décision correcte au moment où elle a été prise, et devenue fausse depuis
que la brique qui lui manquait existe.**

| Constat | Ce qui manquait à l'époque | Ce qui existe maintenant |
|---|---|---|
| `Sprite.source` affichait `res_a7f3` en lecture seule | un navigateur de ressources | la fenêtre Project, ses icônes, ses aperçus |
| Les propriétés d'un `.px` ne pouvaient pas être réordonnées | une opération portant un rang | `REMOVE_PROPERTY` porte déjà son index |
| Le menu de nœuds montrait vingt entrées derrière un seul défilement | rien — c'était `label.includes()` | huit catégories, et des alias à déclarer |
| Le canvas de graphe était monochrome | un vocabulaire de couleurs | six teintes, et deux questions à leur poser |

Et un cinquième, mesuré : `editor.js` refusait de dessiner un transport tant que
l'instantané n'existait pas (ADR-0029). Il existe.

## Décision

### 1. Une propriété `resource` a un contrôle — amende ADR-0023

**VALIDÉ.** `inspector/schema.js` disait, et c'était juste :

> « a `resource` holds a ResourceId, and picking one needs a resource browser — the Project
> window is where that will live, and inventing a text field for an opaque identifier would
> invite a creator to type over it and break the reference. »

Le raisonnement n'est pas renversé, il est **payé**. Ce qu'il refusait était un champ de
texte ; ce qui arrive est `ui/resource-field.js` :

- il montre **ce que la référence désigne** — nom, vignette réelle, icône du kind ;
- il ouvre le même dropdown catégorisé que tous les autres (ADR-0026 §10) ;
- il accepte un dépôt, et le refuse avec sa raison (ADR-0028 §3) ;
- il se vide d'un clic ;
- une référence cassée s'affiche **en rouge**, jamais vide : un pointeur mort est un fait
  que le créateur doit pouvoir voir (même règle qu'ADR-0027 pour un nœud pointant vers une
  propriété supprimée).

**Ce qu'une référence accepte est déclaré, jamais deviné.** `kind` et `mime` (ADR-0007) sont
lus par **une** table : la liste du sélecteur et `rules.acceptsResource()` en sortent
toutes deux, donc une ressource que le menu propose ne peut pas être refusée au dépôt.
`Sprite.source` déclare désormais `kind: 'asset', mime: 'image/'` — un Sprite pointé sur une
scène n'est pas un état qu'il faut pouvoir atteindre.

`array` **reste** en lecture seule : ce qui lui manque est un contrôle de liste, et c'est un
travail visible plutôt qu'une impasse silencieuse.

### 2. Réordonner une propriété est `REMOVE_PROPERTY` + `ADD_PROPERTY`, sous un `batch`

**VALIDÉ. Pas de `MOVE_PROPERTY`.**

ADR-0026 §5 avait créé `MOVE_RESOURCE` avec un argument précis : `SET_PROPERTY` ne peut pas
porter un rang. Il ne s'applique pas ici, parce que **deux opérations existantes le portent
déjà** : `REMOVE_PROPERTY` transporte le descripteur *et* l'index qu'il occupait,
`ADD_PROPERTY` place un descripteur *à* un index.

```
moveProperty(id, index)  ->  REMOVE_PROPERTY { property, index: from }   batch: b
                             ADD_PROPERTY    { property, index: to }     batch: b
```

- **une** entrée d'historique, parce que c'est un `batch` (ADR-0024 §4) ;
- l'inverse est gratuit : `invert()` connaît déjà les deux, et une pile qui les rejoue à
  l'envers remet la propriété là où elle était ;
- **l'identité survit** — le descripteur est réinséré avec le même `id`, donc tout nœud qui
  lisait cette propriété y est toujours câblé (ADR-0027).

Une troisième opération aurait demandé son inverse, son gestionnaire et ses tests pour dire
ce que ces deux-là disent déjà.

> **La limite, et elle est réelle :** l'enregistrement réactif est recréé, donc un
> observateur attaché au descripteur lui-même est perdu. C'est acceptable parce que le
> panneau se redessine sur une opération structurelle — ce que cette paire *est*. Le jour
> où quelque chose devra survivre à un déplacement sans redessin, ce sera l'argument pour
> `MOVE_PROPERTY`, et pas avant.

### 3. Un menu long s'ouvre sur ses catégories, et une recherche se **note**

**VALIDÉ.**

`label.toLowerCase().includes(query)` n'est pas une recherche, et le catalogue de nœuds est
l'endroit où ça cesse d'être une opinion : `float` ne trouvait rien (le nœud s'appelle
`Number`), `event` ne trouvait les deux nœuds d'événement que par accident.

Deux changements, dans `ui/menu.js` et `ui/relevance.js` :

**Le menu a trois états, et la requête choisit lequel.**

| État | Ce qui est montré |
|---|---|
| une requête est tapée | les résultats notés, toutes catégories confondues |
| mode `browse`, aucune catégorie ouverte | une ligne par catégorie, avec son compte |
| sinon | les entrées, sous leurs en-têtes |

`browse` est une option, pas un second format : une catégorie *est* un `heading` suivi de
ses entrées — la forme que tous les menus de l'Editor passent déjà.

**Le score est pur, et il est testé.** `ui/relevance.js` lit le nom, le type, la catégorie
et les alias déclarés, et classe : exact, préfixe, début de mot, sous-chaîne, puis
sous-séquence en dernier recours. Une correspondance sur le **nom** bat toujours une
correspondance sur la catégorie — sinon taper `not` répondrait par tout le groupe Logic.

Le classement est la partie d'un sélecteur qu'on ne peut pas vérifier en la regardant, donc
elle vit dans un module pur avec son fichier de tests, et non dans un menu qui aurait besoin
d'un navigateur pour tourner.

`Escape` **défait la dernière étape** — la requête, puis la catégorie, puis le menu.

### 4. Six teintes, et elles répondent à **deux** questions

**VALIDÉ.**

Un graphe doit dire *ce qu'est un nœud* et *ce que transporte un fil*. Une teinte par
catégorie, c'est vingt couleurs et aucun sens. Donc : **une** palette, et les deux questions
y puisent.

```
--px-hue-flow        l'ordre d'exécution — un fil, pas une valeur
--px-hue-number      number, int        · Math, Compare
--px-hue-boolean     boolean            · Logic
--px-hue-text        string             · Values
--px-hue-reference   une propriété, une ressource, une couleur · Properties
--px-hue-any         sans contrainte    · Debug
```

Events prend l'accent du produit, parce qu'un événement est l'endroit où tout commence.

Un nœud `Multiply` et un port `number` sont **délibérément** du même bleu : c'est la même
idée vue deux fois, et le créateur n'apprend la palette qu'une fois. Les mêmes teintes
habillent les ports, les fils et le badge de type d'une propriété dans l'Inspector.

Ce sont des **tokens**, pas des littéraux, parce qu'un shadow root voit les propriétés
personnalisées et ne voit rien d'autre.

### 5. Une icône de Resource, une icône de catégorie de Node, et une icône de Graph

**VALIDÉ.** Les trois étaient un seul dessin, ce qui faisait lire le menu de création comme
vingt copies de la fenêtre depuis laquelle il avait été ouvert.

- **Resource** : `iconForResource()` — ce qu'on ouvre (`.px`, `.scene`, une image) ;
- **canvas de graphe** : `graph` — deux nœuds et le fil entre eux ;
- **Node** : `iconForNode()` — **par catégorie**, pas par type. Vingt dessins seraient vingt
  choses à reconnaître ; huit disent de quel *genre* de nœud il s'agit, ce qui est la
  question qu'on se pose le menu ouvert. Un type qui veut le sien peut le déclarer.

Et sept glyphes pour les **formes de valeur** (ADR-0023), qui servent au badge d'une
propriété, au sélecteur de Type et aux ports.

### 6. Le Core gagne `restoreScene()` — amende ADR-0029 §7

**VALIDÉ.** ADR-0029 disait que le Runtime ne gagnerait qu'une méthode, `Clock.reset()`.
C'est tenu. Mais le `Stop` a besoin d'une chose de plus, et elle est dans le **Core** :

```js
restoreScene(scene, snapshot, { registry })   // remet une scène en place, EN PLACE
```

`deserializeScene()` construit une **nouvelle** `Scene`, ce qui est la mauvaise forme pour
`Stop` : le Runtime, le Viewport, la Hierarchy et l'Inspector tiennent tous la scène de
départ, et leur en donner une autre serait exactement la copie qu'ADR-0029 §1 refuse. Les
deux partagent maintenant leurs trois passes, parce que **l'ordre des passes est le contrat
du format** et l'écrire deux fois, c'est deux lecteurs qui finiront par diverger.

Elle n'émet **aucune** Operation : restaurer n'est pas une intention d'auteur, c'est
l'Editor qui défait une session que personne n'a enregistrée (ADR-0029 §5).

### 7. La boucle appartient au Viewport, et il faut la réveiller

**VALIDÉ.** Le Viewport possède déjà le seul `requestAnimationFrame` de l'Editor, et il est
**piloté par la demande** : une frame est demandée quand quelque chose qu'il *observe*
change. `Runtime.running` n'est rien de tout cela — c'est un drapeau sur un objet qu'il
possède mais qu'il n'observe pas. D'où `viewport.wake()`, appelé une fois par le transport ;
à partir de là, la branche « en cours d'exécution » de son propre tick redemande une frame.

Le temps d'une frame est **plafonné** (`frameDelta`, 0,25 s) : un onglet en arrière-plan
cesse de recevoir des frames, et y revenir livre un écart de plusieurs secondes que
l'horloge rattraperait fidèlement — c'est-à-dire une scène qui bondit d'une demi-minute au
moment où on la regarde. Le plafond est une fonction pure et testée, parce que c'est la
seule arithmétique de la boucle vérifiable sans navigateur.

## Ce que cet ADR ne décide pas

- **Le prefab** : toujours reporté (ADR-0026 §7). Glisser un Object vers Project reste
  refusé, avec sa raison.
- **Un contrôle de liste** pour `array` (§1).
- **Les valeurs éditées dans le nœud lui-même** : un nœud montre ses ports ; ses `params`
  s'éditent dans l'Inspector. Un champ dans un SVG mis à l'échelle est une décision à part.
- **Le pas à pas, la vitesse de lecture, « jouer depuis ici »** : ADR-0029 les laisse
  ouverts et rien ici ne les ferme.
- **La saisie clavier pendant Play** : `Input` existe et rien ne l'alimente depuis le DOM,
  parce qu'aucun nœud standard ne la lit encore. Le jour où un nœud `On Key` existe, c'est
  un écouteur dans le Viewport et une ligne dans le catalogue.

## Conséquences

### Positives

- Une référence se voit et se choisit : `Sprite.source` cesse d'être un identifiant opaque.
- Réordonner une propriété n'a coûté **aucune** nouvelle opération, aucun inverse, aucun
  gestionnaire.
- Taper `multiply`, `float` ou `event` répond du premier coup, et le classement est testé
  sous Node.
- Le canvas se lit en couleur avec six teintes au lieu de vingt.
- `Stop` restaure vraiment, et la scène rendue est la même instance : rien à re-lier.

### Négatives

- Un déplacement de propriété recrée l'enregistrement réactif (§2). Documenté, et c'est la
  condition qui justifierait un jour `MOVE_PROPERTY`.
- Deux modes de menu à maintenir (§3) : le `browse` et le plat. Assumé — un menu de trois
  entrées qui s'ouvrirait sur ses catégories serait une étape de plus pour rien.
- La palette (§4) ajoute deux teintes au thème. Bornées, nommées par rôle, et réutilisées
  par les deux systèmes qui en avaient besoin.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Un champ de texte pour une `ResourceId`** | Invite à écraser une référence qu'on ne peut pas relire |
| **`MOVE_PROPERTY`** | Deux opérations existantes portent déjà le descripteur et le rang |
| **Garder `label.includes()` et allonger le menu** | `float` ne trouve pas `Number`, et vingt entrées ne se parcourent pas |
| **Une couleur par catégorie de nœud** | Vingt couleurs, aucune apprise, et un canvas illisible |
| **Un second Runtime pour Play** | Détruit la promesse du produit : éditer pendant que ça tourne (ADR-0029 §1) |
| **`deserializeScene()` pour le `Stop`** | Une nouvelle `Scene` oblige à re-lier chaque fenêtre — la copie qu'ADR-0029 refuse |
| **Une boucle d'animation dans le transport** | Une seconde boucle à tenir en phase avec celle du Viewport |
