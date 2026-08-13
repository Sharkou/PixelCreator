# Core

> Le Core est la seule couche partagée entre client, serveur et éditeur.
> Il ne dépend de rien.

## Règle absolue

```
core/  ──►  (rien)
```

Pas de DOM, pas de `window`, pas de `document`, pas de Canvas, pas de WebSocket,
pas d'import vers `runtime/`, `editor/` ou `network/`.

**OBSERVÉ :** Legacy viole cette règle en trois endroits.

| Violation | Fichier | Effet |
|---|---|---|
| `import { Dnd } from '/editor/system/dnd.js'` | `src/core/renderer.js:6` | le Core importe l'IDE |
| `document.createElement('canvas' / 'img')` | `src/core/object.js` (`createImage`) | le Core manipule le DOM |
| `el.textContent` | `src/core/scene.js` (`updateName`) | le Core lit le DOM |

Le serveur ne charge ces chemins que par chance : il n'appelle jamais `createImage()`
ni le renderer. La v2 rend la règle vérifiable par un test (voir `../development/TESTING.md`).

---

## Contenu

```
core/
├── object.js         Object : identité, hiérarchie, composants
├── scene.js          Scene : collection d'Object
├── component.js      contrat + registre de composants
├── definition.js     définition d'un type de Component : propriétés + graphe (ADR-0016)
├── properties/       Property System (Proxy, Change, observe)
├── operations/       Operation, application, historique
├── resources/        Resource, registre, chargement
├── events.js         bus d'événements synchrone
├── serialize.js      sérialisation explicite et versionnée
├── id.js             génération d'identifiants
└── logger.js         journalisation par catégories
```

`operations/` est dans le Core, pas dans `network/` : une Operation existe même hors
ligne (historique, undo/redo). Le réseau en est un **transport**, pas le propriétaire.

---

## Démantèlement de `System`

**OBSERVÉ :** `src/core/system.js` est un fourre-tout de 257 lignes réunissant des
responsabilités sans rapport :

| Contenu actuel | Destination v2 |
|---|---|
| `createID()` | `core/id.js` |
| `random(a, b)` | `math/` (doublon de `Random`) |
| `sync(object, component)` | `core/properties/` (ADR-0003) |
| `createFile(...)` | `core/resources/` |
| `validate(e, event)` — valide un `<input>` DOM | `editor/ui/` |
| `dispatchEvent` / `addEventListener` / `removeEventListener` | `core/events.js` |
| `setIntervalX`, `include(url)` | supprimés (inutilisés ou obsolètes) |
| `stringify` / `parse` — sérialisent des **fonctions** | supprimés (voir ci-dessous) |
| `getDate()` | `core/logger.js` (aujourd'hui jamais appelé) |
| `log` / `debug` / `warn` | `core/logger.js` |
| `document.addEventListener('contextmenu', ...)` en effet de bord au chargement | `editor/` |

Le nom « System » disparaît (ADR-0005) : ce n'est pas un système.

### Note de sécurité

`System.stringify()` sérialise les fonctions en texte, et `System.parse()` était conçu
pour les réévaluer. La désérialisation a été désactivée (avertissement en console), mais
**la sérialisation reste**. En v2, aucune fonction ne transite dans l'état : un
comportement est référencé par le nom de son composant ou par l'id de sa ressource.

---

## Object

Voir `OBJECT.md`.

## Scene

```js
class Scene {
    id, name
    objects        // plat, indexé par id
    add(obj) / remove(obj) / instantiate(obj)
    getObjectById / getObjectsByName / getObjectsByTag
}
```

Ce qui sort de `Scene` :

- **`current` et `currentComponent`** — état de sélection de l'IDE. Migrent vers
  `editor/selection.js`. Lus aujourd'hui par Inspector, Hierarchy, Handler, Manager et
  Network : déplacement transverse à faire d'un bloc.
- **`updateName(el)`** — lit le DOM. Devient une écriture de propriété normale côté
  Editor.

Ce qui reste : la platitude de `objects` (la hiérarchie n'est qu'un lien `parent`/
`children`), les événements `add`/`remove`/`instantiate`, et `refresh()`.

**PROPOSITION V2 :** introduire `Project`, absent de Legacy — un projet contient des
scènes, des ressources et une identité (ADR-0010).

---

## Property System

Voir ADR-0003. Résumé du contrat :

```js
object.x = 100;                  // mutation directe — vues notifiées, aucune Operation
object.setProperty('x', 100);    // mutation contrôlée — vues + Operation + autorité
```

`object.$x` **n'existe pas en v2**.

```js
{ object, component, prop, value, previous, origin }
```

`origin` ∈ `runtime` | `local` | `editor` | `player` | `network`.
La couche réseau ignore `origin === 'network'` : c'est ce qui empêche l'écho, sans
recourir au drapeau `dispatch = false` de Legacy.

> **⚠ `setProperty()` porte le même nom dans Legacy, avec un autre sens.** Il y écrit
> `_x` directement et **ne réplique pas** ; ce sont `$x` et `syncProperty()` qui
> répliquent. En v2, `setProperty()` reprend ce rôle et les deux formes Legacy
> disparaissent. Appliquer un changement entrant se fait par une Operation
> `origin: 'network'`.

> **Les couches internes ne sont pas une API.** `_x` et `__x` restent des possibilités
> d'implémentation ; aucune API publique v2 n'en dépend, et ni les utilisateurs ni les
> composants ne les manipulent.

---

## Events

Le bus synchrone de Legacy est conservé — l'ordre est déterministe et le débogage
prévisible. Deux corrections :

- `removeEventListener` existe déjà mais **n'est appelé nulle part** : les écouteurs
  s'accumulent (chaque `new Properties()`, chaque import de script en ajoute).
  En v2, tout abonnement retourne une fonction de désabonnement.
- Une erreur dans un écouteur interrompt aujourd'hui la boucle `for` et prive les
  écouteurs suivants de l'événement. En v2, les erreurs sont isolées par écouteur.

### Les cinq événements de structure de la Scene — IMPLÉMENTÉ

Une écriture de propriété s'observe sur l'objet qui la porte (`object.observe`). Un
changement de **forme** n'est pas une propriété : il n'a pas de nom de champ auquel
s'abonner. La `Scene` l'annonce donc, et c'est la liste complète :

| Événement | Charge utile |
|---|---|
| `added` / `removed` | l'objet |
| `component:added` / `component:removed` | `{ object, component, type }` |
| `child:added` / `child:removed` | `{ parent, child }` |

```js
scene.on('component:added', ({ object, type }) => …);   // renvoie un désabonnement
```

Mécanique : en rejoignant une scène, un objet reçoit d'elle la fonction par laquelle
émettre (`attachToScene(object, scene, notify)`). L'objet n'importe donc pas `Scene`, et
personne d'autre que la `Scene` ne détient ce point d'entrée. Un objet détaché n'annonce
rien — il n'y a personne pour l'écouter.

**Ce n'est pas un bus de mutations.** La liste est fermée et ne couvre que ce qu'une
propriété ne peut pas exprimer. Elle existe pour que l'Editor n'ait pas à pousser ses
vues depuis le code qui écrit — l'inversion exigée par `EDITOR.md`.

---

## Serialization

`serialize()` explicite, versionné :

- pas de doublons `_prop` / `$prop` — ils n'existent plus ;
- **enfants référencés par id**, jamais imbriqués (Legacy sérialise chaque enfant deux
  fois : dans `parent.childs` et dans `scene.objects`) ;
- images référencées par id de ressource, jamais en base64 dans l'état de scène ;
- les propriétés dérivées ou d'affichage (`image`, vignettes) sont exclues par nature,
  et non par une liste noire.

**VALIDÉ :** le format est versionné **pour l'avenir**, pas pour le passé. Il n'existe
aucun projet v1 à relire : `deserialize()` n'a **aucun chemin de compatibilité Legacy**
à implémenter. Ne pas concevoir de migration de données.

Gain mesuré attendu sur le heartbeat : facteur 3 sur la duplication `_prop`, plus la
suppression de la duplication des enfants.

---

## Resources

Voir `../ARCHITECTURE.md` §9. Points clés :

- `Resource` devient réel — la classe existe dans Legacy (`src/core/resource.js`) mais
  **n'est jamais utilisée** ; `Loader` fabrique des `File` natifs augmentés à la place.
- Id stable, indépendant du chemin (ADR-0010).
- La réactivité des ressources (un fichier se comporte comme un `Object`) est conservée :
  c'est ce qui fait que renommer un script dans l'Inspector recompile le composant.

---

## Ce que le Core ne contient pas

- Le rendu (`runtime/rendering/`)
- Les entrées (`runtime/input/`)
- Le réseau (`network/`)
- Toute notion de sélection, de fenêtre, de curseur, de vignette (`editor/`)
- `Camera` — qui est aujourd'hui à la fois un composant et un `Object` porteur
  (`Camera.main` contient un `Object`, pas un `Camera`). Ambiguïté à lever dans
  `RUNTIME.md`.
