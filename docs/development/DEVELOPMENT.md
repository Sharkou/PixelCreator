# Développement

## Exécuter l'Editor v2

`src/` utilise des imports **relatifs**, donc la racine servie n'a pas d'importance tant
que `src/` en fait partie. Depuis la racine du dépôt :

```bash
tools/dev-server.sh 8099 .
```

puis `http://localhost:8099/src/editor/index.html`.

Équivalent direct : `python -m http.server 8099`.

Aucune dépendance, aucune étape de build : ce sont des modules ES chargés tels quels.

## Exécuter Legacy

`legacy/` utilise des imports absolus (`/src/core/object.js`, `/editor/...`).
**Il doit donc être servi depuis `legacy/` comme racine**, pas depuis `engine/`.

```bash
cd legacy && python -m http.server 8099
```

puis `http://localhost:8099/index.html`.

`tools/dev-server.sh` sert désormais `legacy/` comme racine par défaut (port et racine
paramétrables en arguments), ce qui revient au même que la commande ci-dessus.

### Objets de débogage exposés

`app.js` publie `window.scene`, `window.project`, `window.loader`. C'est le point
d'entrée pour inspecter l'état depuis la console — et c'est ainsi que les vérifications
de `../migration/LEGACY_ANALYSIS.md` ont été faites.

```js
scene.objects                        // tous les objets
scene.current                        // objet sélectionné
scene.getObjectByName('Player')
```

### Mode en ligne

`app.js` contient `const online = false`. Passer à `true` fait tenter une connexion à
`apps.pixelcreator.io:443` (serveur privé) et le téléchargement des ressources du projet.

**Attention :** hors ligne, le runtime est partiellement cassé (les composants qui lisent
les entrées lèvent une erreur par frame — voir `../MIGRATION.md` §4.1).

## Structure du dépôt

```
engine/
├── src/         Pixel Creator v2 — core/ project/ runtime/ editor/ preview/
├── docs/        documentation — mémoire de projet, guide utilisateur, doc développeur
├── legacy/      archive de référence, LECTURE SEULE
├── tools/       outillage de développement et vérifications
└── .github/     CI, modèles d'issues et de PR, instructions Copilot
```

Le détail complet, couche par couche, est dans
[`../developer/repository-structure.md`](../developer/repository-structure.md).

### `legacy/` est en lecture seule

On peut lire, chercher, analyser, comparer, documenter.
On ne refactore pas, on ne nettoie pas, on ne modernise pas, on ne supprime pas.

Legacy répond à « comment Pixel Creator fonctionnait-il réellement ? ».
Il ne définit pas « comment la v2 doit être implémentée ».

### `docs/reference/` décrit une API souhaitée — et c'est celle de Legacy

**Attention :** ces documents ne décrivent pas le code actuel. Exemples :

- `docs/reference/core/object.md` documente `new Object({ name, x, y })` en objet d'options,
  alors que le constructeur réel de Legacy est positionnel
  `new Object(name, x, y, width, height, layer)` — et celui de la v2 est différent des deux ;
- `docs/reference/editor/collab.md` documente un module `Collab` fondé sur Socket.IO,
  **absent du code**.

À traiter comme une source d'intention, jamais comme une description du comportement. Chaque
page porte désormais un bandeau qui le dit, et
[`../reference/README.md`](../reference/README.md) explique où sont les réponses actuelles.

## Le serveur privé

Il vit **hors** de ce dépôt :

```
PixelCreator/            (public)
└── legacy/

PixelCreator-private/    (privé)
└── legacy-server.js
```

Il ne doit **jamais** être déplacé ni copié dans le dépôt public. Son analyse est dans
`../architecture/NETWORK.md`, sans reproduction de code au-delà du strict nécessaire.

Technologie : Deno, `std@0.117` pour WebSocket (API obsolète), TLS, écriture des
ressources sur disque.

## Validation navigateur

Pour tout changement d'UI, d'interaction, de rendu ou de runtime, valider dans le
navigateur, proportionnellement à la taille du changement :

1. servir `legacy/` (ou la v2, selon le cas) ;
2. attacher des écouteurs `console` et `pageerror` ;
3. tester **le comportement directement concerné** ;
4. si cela fonctionne sans erreur pertinente, s'arrêter.

Ne pas transformer un problème local en refonte architecturale.

## Avant d'implémenter la v2

Les décisions d'architecture sont **validées** (`../ARCHITECTURE.md` §10).

La séquence est dans `../MIGRATION.md` §5. **L'étape 1 est l'outillage et le harnais de
parité — avant toute migration de code.** Le risque R1 (rupture silencieuse du Property
System) n'est détectable d'aucune autre manière.
