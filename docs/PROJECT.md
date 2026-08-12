# Pixel Creator — Projet

> Document d'entrée. Lire dans l'ordre : `PROJECT.md` → `ARCHITECTURE.md` → `MIGRATION.md` → `CONVENTIONS.md`.

## 1. Ce qu'est Pixel Creator

Un environnement de création de jeux 2D **dans le navigateur**, orienté multijoueur, pensé
autour de trois verbes :

```
CREATE  →  PLAY  →  SHARE
```

Le créateur ouvre l'éditeur, compose une scène, appuie sur Play, voit son jeu tourner,
et le partage. Le réseau est censé être invisible pour lui.

Ce n'est **pas** un clone de Unity/Godot, pas un ECS académique, pas un framework
générique. C'est un produit avec une ergonomie propre qu'il faut préserver.

## 2. Le vocabulaire du produit

Le vocabulaire est stable depuis l'origine et ne change pas en v2 :

| Terme | Sens |
|---|---|
| `Project` | Un jeu : ses scènes, ses ressources, son identité |
| `Scene` | Un ensemble d'`Object` |
| `Object` | Une entité de scène — **jamais** renommée `Entity` |
| `Component` | Un morceau de comportement/données attaché à un `Object` |
| `Property` | Une valeur observable d'un `Object` ou d'un `Component` |
| `Resource` | Un fichier de projet (image, script, graphe) |

```
Project
└── Scene
    └── Object
        ├── Object
        ├── Object
        └── Component…
```

## 3. Les deux idées qui définissent le projet

Toute l'ergonomie de Pixel Creator repose sur deux mécanismes historiques. Ils sont la
raison pour laquelle le projet mérite d'être modernisé plutôt que réécrit.

### 3.1 L'écriture de propriété est le canal de communication

`object.x = 100` ne fait pas que changer une valeur : cela propage l'information à toutes
les vues et, si demandé, au réseau. L'utilisateur n'écrit jamais `network.updateProperty(...)`.

**Cette ergonomie est non négociable.** (voir `architecture/CORE.md`)

### 3.2 Le Core est partagé client/serveur

Le serveur historique importe littéralement le même module que le client :

```js
import * as components from 'https://editor.pixelcreator.io/src/core/mod.js';
```

Il n'existe pas de `ServerObject` ni de `ClientObject`. Le serveur exécute `obj.update()`,
le client exécute `obj.update()` puis `obj.draw()`. Cette symétrie est un acquis majeur.
(voir `architecture/NETWORK.md`)

## 4. Rôle de l'Editor

L'Editor n'est pas un outil externe qui pilote le moteur : c'est une **vue administrateur
sur un runtime vivant**. Le créateur doit pouvoir observer le jeu, voir les joueurs
connectés, modifier un objet et voir l'effet immédiatement — y compris pendant que le
jeu tourne.

C'est pour cela que l'Editor et le Runtime partagent la même `Scene` et les mêmes `Object`,
et non deux copies synchronisées.

## 5. Identité des jeux

**VALIDÉ** (ADR-0010). L'identifiant d'un jeu est un ID opaque, pas son nom :

```
play.pixelcreator.io/7f3a91c2
```

```json
{ "id": "7f3a91c2", "name": "Medieval Arena" }
```

Deux jeux peuvent porter le même nom. Un slug esthétique pourra être ajouté plus tard
comme alias, jamais comme identité.

**OBSERVÉ DANS LEGACY.** Il n'existe aujourd'hui aucune notion de `Project` persistée :
la scène serveur est un singleton (`let scene = new Scene()`), sans identité ni nom
de projet. Tout est à construire.

## 6. Hors périmètre de la v2 initiale

- **Collaboration temps réel multi-utilisateurs.** Direction future. L'architecture ne doit
  pas la rendre impossible, mais elle n'est pas implémentée maintenant.
- **Intégration IA.** Lya est un projet séparé (agent autonome en Rust). Pixel Creator
  doit fonctionner parfaitement sans Lya et n'en dépend jamais.
- **Marketplace, forum, blog.** Autres parties du site, hors moteur.

## 7. Contraintes structurelles

- **Natif.** Pas de React/Vue/Angular/Svelte. Web Components, DOM, classes JS.
- **Pas de dépendances lourdes.** Le projet doit rester lisible intégralement.
- **Le serveur historique reste privé.** Il ne doit jamais être commité dans le dépôt
  public. Voir `architecture/NETWORK.md` pour son analyse, faite depuis une copie externe.
- **`legacy/` est en lecture seule.** Archive de référence fonctionnelle. On lit, on
  compare, on documente ; on ne refactore pas.

## 8. Phrase directrice

> Moderniser Pixel Creator, pas le remplacer.
> On garde le magicien, on améliore la baguette.

Toute décision d'architecture doit être confrontée à cette phrase. Ne jamais moderniser
quelque chose au seul motif qu'une autre approche paraît plus moderne — le dépôt contient
déjà un contre-exemple documenté (voir `migration/LEGACY_ANALYSIS.md`, §« champs privés »).
