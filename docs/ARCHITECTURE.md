# Architecture v2

> **Statut : DÉCISIONS VALIDÉES le 2026-08-12.** Les questions bloquantes de la Phase 0
> ont été tranchées. Rien n'est encore implémenté.
>
> Chaque décision structurante est justifiée par une observation de
> `migration/LEGACY_ANALYSIS.md`. Le relevé des décisions et la seule question encore
> ouverte sont en §10.

## Décisions validées — résumé

| Sujet | Décision |
|---|---|
| Property System | `object.x = 100` — mutation directe de l'état |
| | `object.setProperty('x', 100)` — mutation contrôlée via le Property System → Operation |
| | **`object.$x` est supprimé** — trop implicite pour une API publique |
| | Toute mutation du modèle est représentable par une **Operation** |
| Components | **Un seul Component par type** et par Object |
| | `Transform` est un Component normal ; `object.x` en est un accès pratique |
| Runtime | Domaines directement sous `runtime/`, **pas de couche `Systems/`** |
| | `Object.update()` / `Object.draw()` conservés ; un Component peut faire les deux |
| Rendering | **Canvas 2D** en v2, derrière une abstraction légère ouvrant WebGL/WebGPU |
| Multiplayer | **Le serveur est l'autorité de simulation.** Le modèle distingue mutation joueur et mutation éditeur autorisée |
| Scripting | `.px` = graphe visuel, `.js` = JavaScript natif. `.px` cesse d'être du JS |
| Editor | Web Components natifs, préfixe **`px-`**. Modèle central, vues réactives |
| Erreurs runtime | Le Runtime **isole et rapporte**, il ne modifie pas le modèle. Pas d'auto-désactivation |
| Input | Abstrait, indexé par owner, **passé à `step()`** — jamais un global |
| Caméra | Un `Object` ordinaire ; le `Viewport` est l'écran ; la matrice de vue est dérivée |
| Scripting | Un Component peut avoir un graphe `.px` qui définit son comportement. **Pas de Component `Script`**, pas de `ScriptSystem` |
| Graphe `.px` | Modèle au **Core** (`core/graph/`), interprète au Runtime, rendu SVG à l'Editor. Nœuds, ports et connexions par **identité** ; une propriété utilisateur porte un `id` qu'un renommage ne touche pas (ADR-0027) |
| Components créés par l'utilisateur | Une **définition** (`type` + propriétés + graphe) produit un Component ordinaire ; la définition appartient au type, jamais à l'instance |
| Feedback de drag | **Reflow live dans les listes plates, jamais dans l’arbre** : une liste plate pose une question (quel rang ?), un arbre en pose deux (quel parent, quel rang ?) et sa cible ne doit pas bouger pendant qu’on vise (ADR-0028) |
| Surfaces de l’Editor | Le **stage** porte ce qui s’édite — Viewport et Graph s’y échangent par onglets. Le Graph n’ira pas dans la bande basse : un éditeur nodal a besoin de surface (ADR-0028 §4) |
| Transport | **Play joue la scène vivante**, pas une copie. Play prend un instantané, Stop le restaure, les modifications faites en jeu sont perdues et l’historique est vidé au démarrage (ADR-0029) |
| Références | Une propriété `resource` est **choisie, déposée ou vidée — jamais tapée** : un contrôle qui montre ce que la référence désigne, et une déclaration (`kind`, `mime`) que le sélecteur et la règle de dépôt lisent tous les deux (ADR-0030 §1) |
| Rangs | Réordonner une propriété de `.px` est `REMOVE_PROPERTY` + `ADD_PROPERTY` **sous un `batch`** : deux opérations existantes portent déjà le descripteur et l'index, donc il n'y a pas de `MOVE_PROPERTY` (ADR-0030 §2) |
| Recherche | Un menu long **s'ouvre sur ses catégories**, et une requête est **notée** contre le nom, le type, la catégorie et les alias — module pur et testé, jamais un `includes()` (ADR-0030 §3) |
| Couleur | **Six teintes, deux questions** : ce qu'est un nœud et ce que transporte un fil puisent dans la même palette, donc un nœud Math et un port `number` sont le même bleu (ADR-0030 §4) |
| Projets Legacy | **Aucune migration de données à concevoir** — il n'existe pas de projets v1 |

---

## 1. Principe directeur

L'analyse de Legacy conduit à une conclusion nette : **les concepts sont bons, les
implémentations sont fragiles.** Le triple canal d'écriture, le Core partagé, le
`update/draw` avec `self` en argument, l'Inspector réflexif — tout cela fonctionne et
n'a pas d'équivalent plus simple.

Les problèmes réels sont ailleurs :

| Problème réel | Nature |
|---|---|
| Réactivité perdue sur les propriétés dynamiques et les champs `#` | implémentation |
| Sérialisation ×3 et enfants dupliqués | implémentation |
| `Core → Editor`, `Input → Network` | couplage |
| Ajouter une fenêtre = éditer 4 fichiers | modularité UI |
| Graphe sans modèle de données | fonctionnalité absente |
| Aucun test | outillage |

**Aucun de ces problèmes n'exige un ECS, une architecture Systems, ni un framework UI.**

---

## 2. Découpage

```
                          Pixel Creator
                                │
      ┌───────────┬─────────────┼─────────────┬─────────────┐
      │           │             │             │             │
    core/     project/      runtime/       editor/      network/
      │           │             │             │             │
  Object      Resource      clock/        windows/     protocol
  Scene       Project       physics/      inspector/   transport
  Component   Store         animation/    viewport/    replication
  properties  loading       rendering/    graph/       authority
  operations                input/        ui/
  events                    scripting/
  logger                    loop
```

**Règle de dépendance, unique et vérifiable :**

```
editor/  ──►  project/  ──►  core/
editor/  ──►  runtime/  ──►  core/
network/ ──►  core/
core/    ──►  (rien)
```

`core/` n'importe ni `project/`, ni `runtime/`, ni `editor/`, ni `network/`, ni le DOM.
`project/` — identité, stockage, chargement (ADR-0020) — n'importe ni le DOM, ni
`runtime/`, ni `editor/` : un serveur sans écran doit charger le même projet qu'un
navigateur. `runtime/ → project/` est interdit dans l'autre sens, parce que
`behaviors.bind(type, graph)` prend un graphe **résolu**.

Un test automatisé vérifie cette règle (voir `development/TESTING.md`), et depuis
2026-08-17 la même exécution échoue aussi sur un import statique qui ne résout vers aucun
fichier.

### Pourquoi pas de dossier `systems/`

**OBSERVÉ :** Legacy n'a jamais eu de « System ». La physique vit dans
`Collider.update()`, l'animation dans `Animator.update()`. L'organisation par module de
domaine (`physics/`, `anim/`, `input/`) est celle qui existe et qui se lit bien.

**PROPOSITION V2 :** on conserve l'organisation par domaine. Le mot « System » n'est
employé que lorsqu'un module orchestre réellement plusieurs objets — par exemple un
`CollisionSystem` qui remplacerait la boucle O(n²) actuelle par un balayage spatial.
Ce serait alors un vrai service, pas une case dans un schéma.

---

## 3. Core

### 3.1 Object

`Object` reste `Object` (ADR-0001). Il redevient un **conteneur** :

```js
class Object {
    id            // identité de l'objet
    owner         // ex-`uid` : le joueur propriétaire
    name, tag, layer
    active, visible, lock
    components    // Map<string, Component>   — un seul par type
    parent, children
}
```

Sortent de `Object` (vers `editor/`) : `detectMouse`, `detectSide`, `select`,
`createImage`, `preview`. Ce sont des opérations d'IDE, elles n'ont pas à empêcher le
chargement du Core côté serveur.

**Renommages retenus.** Ils étaient bloqués par la compatibilité des données ; la
décision « aucun projet v1 à migrer » lève ce blocage :

| Legacy | v2 | Raison |
|---|---|---|
| `childs` | `children` | anglais correct |
| `uid` | `owner` | `uid` désigne le **joueur propriétaire**, pas l'objet |
| `static` | *supprimé* | déclaré, jamais lu |

### 3.2 Transform devient un Component, `object.x` reste `object.x`

**VALIDÉ** (ADR-0002). `x`, `y`, `rotation`, `scaleX`, `scaleY` quittent `Object` pour
un composant `Transform`, **avec une seule source de vérité**. `width` et `height` n'en
font pas partie : une taille appartient aux composants de rendu et de collision.
Les valeurs sont **locales** ; la transformation monde est dérivée, jamais stockée.

```js
// Transform détient les valeurs
object.components.get('Transform').x   // ← source de vérité unique

// Object expose une façade — pas une copie
Object.prototype = {
    get x()  { return this.components.get('Transform').x; },
    set x(v) {        this.components.get('Transform').x = v; }
}
```

Les deux écritures suivantes sont donc strictement équivalentes et ne peuvent pas
diverger :

```js
object.x = 100;
object.getComponent('Transform').x = 100;
```

Bénéfices : la hiérarchie de transformation (aujourd'hui `_x`/`__x` codé en dur dans
`Object`) devient la responsabilité de `Transform` ; un objet purement logique n'a pas
besoin de position ; l'Inspector affiche `Transform` comme n'importe quel composant.

Risque assumé : deux indirections par lecture de `x` dans les boucles chaudes.
Le benchmark de §4.2 montre que le budget existe, mais le rendu devra lire
`transform` une fois par objet plutôt que `self.x` répété.

### 3.3 Property System

Le mécanisme conceptuel est conservé à l'identique. L'implémentation passe de
`Object.defineProperty` par propriété à un **`Proxy` par objet** (ADR-0003).

**Ce qui ne change pas — l'ergonomie :**

```js
object.x = 100;                   // change + notifie les vues, aucune Operation
object.setProperty('x', 100);     // change + notifie + produit une Operation
```

**Ce que le Proxy corrige, mesuré :**

| Défaut Legacy | Résolu |
|---|---|
| Propriété ajoutée après coup non réactive | ✅ le trap intercepte toute clé |
| Champs `#privés` invisibles | ✅ non concerné (état interne, hors modèle) |
| `_prop`/`$prop` énumérables, sérialisation ×3 | ✅ aucun stockage parasite |
| Écriture 301 ms / 3 M ops | ✅ **77 ms** — 4× plus rapide |
| Pas de valeur précédente | ✅ le trap la lit avant d'écrire |

### Les deux formes d'écriture — VALIDÉ

```js
object.x = 100;                   // mutation directe de l'état de l'objet
object.setProperty('x', 100);     // mutation contrôlée via le Property System
```

**`object.$x` est supprimé** — trop implicite et trop spécifique à Pixel Creator pour
constituer une API publique. Il n'existe ni en v2, ni comme syntaxe cible du harnais.

| Forme | Effet |
|---|---|
| `object.x = 100` | met à jour l'état, émet un `Change` — les vues réagissent. **Aucune Operation.** |
| `object.setProperty('x', 100)` | `Change` **et** Operation |

```
setProperty()  →  Property System  →  Operation  →  contexte / autorité / destination
```

**`setProperty()` n'est pas « la méthode réseau ».** C'est le chemin contrôlé du modèle.
Ce que devient l'Operation dépend du contexte : validation par l'autorité, réplication,
historique, undo/redo, collaboration, transmission à un autre système. Le réseau est
une destination possible, pas la définition.

Une Operation entrante reste explicitement identifiable par `origin: 'network'`.

> **⚠ Même nom, sens différent de Legacy.** Dans Legacy, `setProperty()` écrit `_x`
> directement et **ne réplique pas** ; c'est `$x` / `syncProperty()` qui répliquent.
> En v2, le rôle de `$x` / `syncProperty()` est repris par `setProperty()`, et le
> `setProperty()` historique disparaît en tant que tel. Tout raisonnement par analogie
> avec `legacy/` induira en erreur — le mapping est explicite dans le harnais de parité.

> **Les couches internes ne sont pas une API.** Legacy empile `object.x` → `_x` → `__x`.
> Ces niveaux sont documentés parce qu'ils expliquent le comportement observable, mais
> `_x` et `__x` restent de simples possibilités d'implémentation : ni les utilisateurs
> ni les composants n'ont à les manipuler, et aucune API publique v2 n'en dépend.

Le `Change` émis devient :

```js
{ object, component, prop, value, previous, origin }
```

`origin` ∈ `runtime` | `local` | `editor` | `player` | `network`. Il remplace l'astuce
actuelle (« quelle méthode a été appelée ») par une donnée explicite, et supprime le
besoin de `setProperty(prop, value, dispatch=false)` pour éviter les échos : la couche
réseau ignore simplement les changements d'origine `network`.

### 3.4 Serialization

Un `serialize()` explicite remplace la sérialisation implicite par `JSON.stringify` :

- pas de doublons `_`/`$` (il n'y en a plus),
- les enfants sont référencés par id, **jamais imbriqués en entier**,
- les images ne partent plus en base64 dans l'état de scène (référence par id de ressource),
- versionné, pour que les projets existants restent lisibles.

Gain attendu sur le heartbeat : facteur 3 sur la duplication `_prop`, plus la
suppression de la duplication des enfants.

### 3.5 Events et Logger

Le bus `System.addEventListener/dispatchEvent` est conservé (synchrone, ordonné,
prévisible). Il est extrait dans `core/events.js` et gagne un `off()` fiable.

`System` est démantelé : c'est aujourd'hui un fourre-tout (id, random, sync, fichiers,
validation d'`<input>`, événements, logs). Voir `architecture/CORE.md`.

Le logger conserve l'identité visuelle historique (catégories colorées) derrière une
API nommée — voir `development/LOGGING.md`.

---

## 4. Runtime

### 4.1 Components

Le contrat historique est conservé **et enfin explicite** (ADR-0004) :

```js
update(self, ctx)   // simulation      — client ET serveur
draw(self, renderer) // rendu          — client uniquement
```

`self` reste passé en argument (pas de `this.object`) : c'est ce qui garde les
composants sérialisables sans cycle. `ParticleSystem` reste l'exemple canonique —
simulation dans `update`, rendu dans `draw`, serveur sans `draw`.

`draw(self, renderer)` reçoit une abstraction de rendu au lieu de lire le singleton
`Graphics.ctx`. Cela n'impose **pas** de transformer les composants en « RenderSystems » :
un composant garde sa logique de rendu quand c'est pertinent.

Nouveauté : un composant **déclare son schéma** (ADR-0007), ce qui alimente l'Inspector,
la validation, et la sérialisation :

```js
static schema = {
    speed:  { type: 'number', default: 2, min: 0, max: 20 },
    layout: { type: 'enum', values: ['wasd', 'zqsd', 'arrows'], default: 'zqsd' }
};
```

Le schéma est **optionnel** : sans lui, l'Inspector retombe sur l'inférence réflexive
actuelle, qui fonctionne déjà. Écrire un composant reste une affaire de dix lignes.

**VALIDÉ :** un `Object` ne porte **qu'un seul Component d'un type donné**. La clé de
`components` reste le nom du type, comme dans Legacy.

**VALIDÉ :** un Component peut implémenter `update()`, `draw()`, ou les deux.
`ParticleSystem`, `Sprite` et `Tilemap` participent ainsi directement au rendu.

> **Conséquence sur Legacy.** Deux de ces trois cas ne sont pas conformes aujourd'hui :
> `Sprite` est une **sous-classe d'`Object`**, pas un Component, et `Tilemap` expose
> `draw(ctx, camera)`, signature incompatible avec `Object.draw()`. En v2, `Sprite`
> devient un Component et `Tilemap` adopte `draw(self, renderer)`. C'est un abandon
> délibéré de comportements Legacy erronés.

### 4.2 Organisation

**VALIDÉ.** Les domaines sont directement sous `runtime/`, sans couche intermédiaire :

```
runtime/
├── clock/         temps, delta-time, timers
├── physics/       collisions, corps, spatial hash
├── animation/     animator, animation, tween
├── rendering/     backend Canvas 2D + abstraction
├── input/         état des entrées par owner
├── scripting/     comportements de Components définis par un graphe .px
└── loop.js        orchestration des phases
```

Aucun `PhysicsSystem`, `RenderSystem`, `AnimationSystem` ou `ScriptSystem` n'est créé
par principe (ADR-0005).

### 4.3 Rendering

**VALIDÉ :** le backend v2 est **Canvas 2D**. Une abstraction légère est interposée pour
qu'un backend WebGL ou WebGPU reste possible plus tard — sans être conçue pour eux
aujourd'hui.

Concrètement, cela signifie une seule chose : `draw(self, renderer)` reçoit un objet
`renderer` au lieu de lire le singleton `Graphics.ctx`. L'abstraction se limite au
vocabulaire réellement utilisé par les composants existants (`rect`, `circle`, `image`,
`text`, `fill`, `stroke`, `light`, transformations).

**Ne pas surarchitecturer** : pas de graphe de commandes, pas de batching, pas de
matériaux, pas de passes tant qu'un besoin réel ne l'exige pas.

### 4.4 Boucle

Les phases sont séparées, comme le serveur le fait déjà :

```
frame:
  input.poll()
  for each object: object.update()     ← toute la simulation d'abord
  collisions.resolve()
  renderer.render(scene, camera)       ← puis tout le rendu
  editor.overlay()                     ← puis les surcouches IDE (si Editor)
```

**OBSERVÉ :** Legacy entrelace update et draw par objet, ce qui rend l'ordre
d'observation dépendant du tri par `layer` — non déterministe pour un moteur
multijoueur. Le serveur ne fait pas cette erreur.

Le tri par `layer` reste fait **à chaque frame**. `layer` peut changer à tout moment et
le tri est négligeable devant le rendu ; un cache invalidé sur écriture serait une
optimisation spéculative et un état de plus à maintenir. Il sera introduit si une mesure
le demande — voir `architecture/RUNTIME.md`.

Une exception levée par un Component est **isolée et rapportée**, jamais transformée en
mutation du modèle : le Runtime ne désactive rien (ADR-0012).

Le picking souris et les poignées de redimensionnement sortent de `Renderer.render()`
vers `editor/viewport/`. **C'est ce qui supprime `import { Dnd } from '/editor/...'`
dans le Core.**

### 4.5 Input

`Input` ne dépend plus de `Network` (correctif du bug §6.3 de l'analyse) :

```
runtime/input/  →  état abstrait, indexé par owner ; un owner "local" existe toujours
network/        →  alimente l'état des entrées des owners distants
```

> **Correction (ADR-0014).** Ce paragraphe plaçait initialement l'input dans `core/`,
> en contradiction avec `architecture/RUNTIME.md`. C'est `runtime/` qui est retenu : le
> Core est le modèle, il n'a ni temps ni entrées.

L'état est **abstrait** — touches, boutons, pointeur, axes — et ne connaît aucun
événement navigateur. Il est **passé au pas de simulation** :

```js
runtime.step(input);
runtime.advance(elapsed, input);
```

C'est ce qui rend la simulation déterministe et rejouable côté serveur. Un runtime
construit sans input tourne sur un input vide plutôt que d'aller chercher un global.

Conséquence directe : **le mode solo hors ligne fonctionne**, ce qui n'est pas le cas
aujourd'hui.

---

## 5. Editor

### 5.1 Ce qu'on garde absolument

La synchronisation temps réel actuelle est **bonne** et ne doit pas être remplacée par
un store ou un framework :

- source de vérité unique = l'`Object`,
- le DOM est une projection,
- la garde `document.activeElement` permet l'édition lettre par lettre.

### 5.2 Ce qu'on change : la modularité

**OBSERVÉ :** ajouter une fenêtre exige d'éditer `index.html` (700 lignes), `app.js`,
un CSS et le module ; `editor/windows/window.js` est un `// TODO` vide.

**PROPOSITION V2 :** des Web Components natifs comme primitives (ADR-0006). Chaque
fenêtre porte son propre balisage, ses styles (Shadow DOM) et son cycle de vie.

```
Primitives          Fenêtres construites dessus
──────────          ───────────────────────────
<px-window>         <px-hierarchy>
<px-panel>          <px-inspector>
<px-split>          <px-assets>
<px-tabs>           <px-scene>
<px-toolbar>        <px-graph>
<px-tree>           <px-players>
<px-list>           <px-console>
<px-property>
<px-viewport>
<px-modal>, <px-menu>
```

Ajouter une fenêtre devient : écrire un fichier, l'enregistrer auprès du layout.

La liaison propriété↔DOM par classe CSS globale (`<id>-<prop>` +
`getElementsByClassName` sur `document`) est remplacée par un **binding scopé** : le
composant `<px-property>` s'abonne au `Change` de la propriété qu'il affiche et se met
à jour lui-même. Même comportement observable, sans requête DOM globale, et compatible
Shadow DOM.

### 5.3 Inspector

Piloté par schéma quand il existe, réflexif sinon (ADR-0007). Zéro `if (component === …)`.
Cela corrige au passage : les décimales tronquées par `parseInt`, l'absence de min/max,
les couleurs mal détectées (`''` initial), et les branches `TODO Range`/`TODO Array`
mortes.

### 5.4 Viewport

`Handler` (27 ko, `switch` de 8 cas dupliqué) est découpé en **outils** :
`SelectTool`, `MoveTool`, `ResizeTool`, `PanTool`, `ZoomTool`. Un seul outil actif,
une interface commune. Le redimensionnement 8 directions devient une fonction unique
paramétrée par le côté.

---

## 6. Network et Operations

### 6.1 Constat

**OBSERVÉ :** le protocole actuel *est déjà* un système d'opérations qui ne dit pas son
nom. `update {id, component, prop, value}` = `SET_PROPERTY`. `addComponent`, `addChild`,
`add`, `remove` sont déjà des opérations nommées.

### 6.2 Proposition

**VALIDÉ :** toute mutation du modèle doit être représentable par une Operation interne.
C'est ce qui ouvre, à terme, réseau, historique, undo/redo, collaboration et IA.

On formalise ce qui existe déjà, sans changer l'ergonomie utilisateur (ADR-0008) :

```
object.setProperty('x', 100)   → Change { origin: 'editor' }
                               → Operation SET_PROPERTY { target, prop, value, previous }
                               → autorité (ADR-0011)
                               → état autoritaire → propagation
```

L'utilisateur n'écrit jamais une Operation à la main. Elle est **produite** par le
Property System.

`object.x = 100` (mutation directe) ne produit **pas** d'Operation : c'est une sortie de
simulation, pas une intention. Voir ADR-0003 pour la justification de cette frontière et
la garde de développement qui la protège.

Opérations : `SET_PROPERTY`, `ADD_OBJECT`, `REMOVE_OBJECT`, `ADD_COMPONENT`,
`REMOVE_COMPONENT`, `ADD_CHILD`, `REMOVE_CHILD`, `ADD_RESOURCE`, `REMOVE_RESOURCE`.

Ce que le format ajoute par rapport aux messages actuels :

| Champ | Débloque |
|---|---|
| `previous` | undo/redo |
| `seq` | ordre total, détection de perte |
| `author` | collaboration, attribution |
| `batch` | un drag = **une** opération, pas 300 |

Le batching répond directement au `delay = 0` qui neutralise le throttle actuel.

**Ce n'est pas un CRDT et pas de l'OT.** La collaboration multi-utilisateurs reste hors
périmètre ; on s'assure seulement de ne pas la rendre impossible.

### 6.3 Réplication d'état

Le heartbeat « scène complète toutes les 4 s » (qui écrase les saisies en cours) est
remplacé par des **snapshots delta** : seules les propriétés modifiées depuis le dernier
accusé de réception sont envoyées. La réconciliation complète reste disponible à la
connexion et à la demande.

### 6.4 Autorité — VALIDÉ

**Le serveur est l'autorité de simulation en multijoueur compétitif.** Voir ADR-0011.

Le modèle distingue deux natures de mutation :

| Nature | Émetteur | Traitement |
|---|---|---|
| **Mutation joueur/client** | un joueur en jeu | intention soumise au serveur ; le client peut prédire, le serveur tranche |
| **Mutation éditeur autorisée** | le créateur, avec les permissions | Operation autorisée → **validée côté serveur** → appliquée à l'état autoritaire → propagée |

Dans les deux cas, le chemin est le même : Operation → validation → état autoritaire →
propagation. Seules la source et la vérification changent.

**OBSERVÉ :** aujourd'hui le serveur n'a aucune autorité — il applique ce qu'on lui
envoie et rediffuse. Et l'Editor est de fait autoritaire, sans qu'aucune vérification
n'existe. C'est un abandon délibéré du comportement Legacy.

Le système de permissions complet **n'est pas implémenté maintenant**. L'architecture
doit simplement prévoir le point d'insertion : un `authority` qui reçoit chaque
Operation et répond accepté / rejeté / transformé.

---

## 7. Client / Serveur

```
                     core/  (identique des deux côtés)
                            │
              ┌─────────────┴─────────────┐
              │                           │
           Client                      Serveur
              │                           │
    runtime + renderer             runtime sans rendu
    editor (optionnel)             network + persistance
```

Pas de `ClientObject` / `ServerObject`. La différence n'est pas dans le modèle mais
dans les **modules chargés** : le serveur n'importe pas `renderer/`.

`mod.js` reste le point d'entrée partagé. La v2 le scinde en `core/mod.js` (partagé) et
`runtime/mod.js` (client), pour que le serveur cesse d'importer transitivement le
rendu et le DOM.

---

## 8. Scripting

Deux langages, un seul modèle objet (ADR-0009) :

| Extension | Nature | Exécution |
|---|---|---|
| `.px` | **graphe**, ressource structurée JSON | interprété (ou compilé) par le runtime |
| `.js` | vrai module JavaScript ES | `import()` dynamique, comme aujourd'hui |

**OBSERVÉ :** aujourd'hui `.px` est dans `allowedScriptsTypes` à côté de
`text/javascript` et passe par `import()` — c'est donc du JavaScript déguisé, ce que la
vision refuse explicitement. Le serveur, lui, connaît `application/pixelscript`.
**Les deux types MIME doivent être unifiés.**

Le graphe reçoit enfin un modèle de données sérialisable, indépendant du DOM.

> **Amendé le 2026-08-18 (ADR-0027).** L'exemple d'origine désignait un port par son
> **index** (`"from": ["nodeA", "out", 0]`) et portait des `variables`. Les deux sont
> abandonnés : un index est exactement le défaut mesuré dans Legacy — un type de nœud
> gagnant un port recâble silencieusement tous les graphes — et une variable de graphe *est*
> une propriété du Component (§ « Un Component créé par un utilisateur »).

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "event.update", "x": 40, "y": 96, "params": {} },
    { "id": "n2", "type": "property.set", "x": 320, "y": 96, "params": { "property": "p7" } }
  ],
  "connections": [
    { "id": "c1", "from": { "node": "n1", "port": "out" }, "to": { "node": "n2", "port": "in" } }
  ]
}
```

Un nœud, un port et une connexion ont chacun une **identité stable** ; `from` est toujours
la sortie et `to` toujours l'entrée, quel que soit le sens dans lequel le fil a été tiré.

L'éditeur de nœuds est reconstruit sur ce modèle plutôt que d'en être un : `core/graph/`
tient le modèle, `editor/graph/view.js` l'arithmétique de la toile, et
`editor/windows/graph.js` le rendu SVG. Les idées de rendu retenues de Legacy — Bézier
horizontale au décalage `max(50, distance × 0.4)`, pan/zoom par transformation de vue — le
sont explicitement ; le reste (un nœud est un `<div>`, un port se localise par
`getBoundingClientRect()`) est ce qu'ADR-0027 refuse de reproduire.

### Ce qu'un nœud est, et qui l'exécute (ADR-0027)

Un type de nœud déclare **sa forme et ce qu'il fait dans une seule table**, au Core : ses
ports (flux ou donnée, typés par `PropertyType`) et son évaluation, qui est pure — elle lit
ses entrées et écrit à travers le Component, sans horloge, sans aléatoire, sans DOM.

`runtime/scripting/interpreter.js` détient ce qui n'appartient à aucun nœud : l'ordre
d'exécution (flux poussé en profondeur d'abord, données tirées), l'état par instance, un
budget par événement, et des `GraphError` structurées que le runtime isole et rapporte
(ADR-0012). Un flux qui boucle est une **boucle**, pas une erreur ; un cycle de **données**
en est une, parce qu'une valeur définie par elle-même n'a aucun ordre d'évaluation.

`.px` et `.js` manipulent les mêmes `Object`, `Component`, `Property`, `Scene`,
`Resource`, `Event` : ce sont deux façades sur une seule API, pas deux moteurs.

### Où un graphe entre dans la simulation (ADR-0015)

Un graphe est le **comportement d'un type de Component**, jamais un composant :

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

**Il n'existe pas de Component `Script`** et un `.px` ne génère aucun type de composant.
Un `.js` en fournit un (classe exportée par défaut) ; un `.px` définit le comportement
d'un type qui existe déjà.

```
graph ──(interpret)──► create(component) ──► behavior.update(self, ctx)
        une fois par graphe    une fois par instance      à chaque pas
```

Le graphe est lu une fois et partagé par tous les composants de son type ; **chaque
instance a son propre état d'exécution**. Le comportement vit dans une `WeakMap`, jamais
dans les données sérialisées du composant. Le runtime exécute le graphe là où il exécute
le composant : même pas, même ordre, même isolation d'erreur, client comme serveur.

### Un Component créé par un utilisateur (ADR-0016)

Un Component est **propriétés + comportement**. Une **définition** écrit ce couple comme
donnée — `{ type, properties, graph }` — et `defineComponent()` en fait une classe de
composant ordinaire, enregistrée comme les autres. La définition appartient au **type** :
une instance ne porte que ses valeurs, jamais une copie du graphe.

C'est ce qui permet à l'Editor de créer un Custom Component, de définir ses propriétés,
d'éditer son graphe, d'enregistrer sa définition et de le réutiliser partout.

**Une propriété utilisateur a une identité (ADR-0027).** Le schéma reste indexé par nom —
c'est ce que lit `defineComponent()` et ce qu'affiche l'Inspector — mais chaque descripteur
porte un `id` frappé une fois, et c'est **lui** qu'un nœud stocke :

```json
"properties": { "speed": { "id": "p7", "type": "number", "default": 120 } }
```

Renommer `speed` en `walkSpeed` laisse donc le graphe câblé. C'est ADR-0021 une échelle plus
bas : l'identité n'est pas un nom. Une propriété supprimée ne laisse jamais de référence
pendante — le validateur la signale, la toile cerne le nœud, l'interprète lève une erreur
structurée.

`editor/graph/compiler.js` (lexer d'un langage type Rust, jamais exécutable) est
abandonné. `editor/graph/component.js` est renommé pour ne plus entrer en collision
avec les composants de jeu.

---

## 9. Ressources

- `Resource` devient réel et remplace le `File` augmenté (aujourd'hui `Resource` existe
  mais n'est jamais utilisée).
- Un id stable, indépendant du chemin (aujourd'hui `id = path + name` : renommer un
  fichier change son identité et casse les références).
- Les images ne sont plus stockées en DataURL base64 dans l'état de scène.
- Les Blob URL sont révoquées (fuite actuelle à chaque réimport).
- IndexedDB (`Store`, déjà écrit et inutilisé) sert de cache local et de mode hors ligne.
- Le hot reload par `import()` + événement `import` est conservé tel quel : il marche.

**État 2026-08-17 :** `project/` existe — `Resource`, `ResourceId`, `ResourceStore`
(implémentation mémoire), `Project` et son pipeline d'Operations, chargement des
définitions de Components et des scènes. IndexedDB reste à brancher : c'est un échange
d'implémentation derrière l'interface, sans effet sur les appelants.

**Complété le 2026-08-17 (ADR-0025) :** un dossier est une `Resource` de `kind: 'folder'`,
et le rangement est un lien `parent` — pas une chaîne `path`. Renommer un dossier ne
réécrit donc rien, déplacer une ressource est un `SET_PROPERTY`, et supprimer un dossier
emporte son contenu en un seul `batch` annulable. `MANIFEST_VERSION = 2`. Le chemin affiché
(`Assets/Images`) est dérivé des liens, jamais stocké. Les entrées portent aussi `created`
et `modified` ; la taille appartient au store, qui la mesure ou répond `null`.

---

## 10. Registre des décisions

### Tranchées le 2026-08-12

| # | Question | Décision |
|---|---|---|
| Q3 | Garde-t-on le sigil `$` ? | **Non — supprimé définitivement.** `object.x = v` est la mutation directe, `object.setProperty('x', v)` la mutation contrôlée. |
| Q4 | Deux composants du même type par objet ? | **Non.** Un seul par type, clé = nom du type. |
| Q5 | Autorité serveur | **Le serveur est l'autorité de simulation.** Le modèle distingue mutation joueur et mutation éditeur autorisée (ADR-0011). |
| Q6 | Compatibilité des projets Legacy | **Aucune.** Il n'existe pas de projets v1. Ne pas concevoir de migration de données. |
| Q8 | Cible du Renderer | **Canvas 2D**, derrière une abstraction légère ouvrant WebGL/WebGPU plus tard. Ne pas surarchitecturer. |

### Débloquées par Q6, tranchées par défaut

Ces deux renommages n'étaient bloqués que par la compatibilité des données, désormais
sans objet. Retenus sauf objection :

| # | Question | Décision |
|---|---|---|
| Q1 | `childs` → `children` ? | **Oui.** |
| Q2 | `uid` → `owner` ? | **Oui.** Le champ désigne le joueur propriétaire. |

| Q7 | `.px` : interprété ou compilé en JS ? | **Interprété**, pour le débogage et la sécurité. Le format n'aura pas à changer si une compilation s'avère nécessaire plus tard. |

**Toutes les questions bloquantes sont tranchées.** Il ne reste que des points mineurs,
décidables à l'implémentation, listés dans les ADR concernés (ex. `Transform` ajouté par
défaut ou non).

---

## 11. Ce qu'on ne fait pas

- Pas d'ECS, pas d'archétypes, pas de stockage colonnaire.
- Pas de dossier `systems/` par principe.
- Pas de renommage `Object` → `Entity`.
- Pas de suppression de `Component.draw()`.
- Pas de framework UI.
- Pas de store réactif séparé dans l'Editor — la source de vérité reste l'`Object`.
- Pas de remplacement du Property System par une API verbeuse.
- Pas de dépendance à Lya.
- Pas de publication du serveur privé.
- Pas de génération massive de fichiers avant validation de ce document.
