# Développement

## Exécuter Legacy

`legacy/` utilise des imports absolus (`/src/core/object.js`, `/editor/...`).
**Il doit donc être servi depuis `legacy/` comme racine**, pas depuis `engine/`.

```bash
cd legacy && python -m http.server 8099
```

puis `http://localhost:8099/index.html`.

> **OBSERVÉ :** `tools/dev-server.sh` sert `engine/` comme racine. Les imports `/src/...`
> ne résolvent donc pas et l'application ne démarre pas. À corriger.

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
├── docs/        documentation de projet — mémoire persistante
├── legacy/      archive de référence, LECTURE SEULE
├── reference/   documentation d'API (décrit une API souhaitée, pas l'actuelle)
├── tools/       outillage de développement
└── .github/     instructions Copilot, modèles d'issues
```

### `legacy/` est en lecture seule

On peut lire, chercher, analyser, comparer, documenter.
On ne refactore pas, on ne nettoie pas, on ne modernise pas, on ne supprime pas.

Legacy répond à « comment Pixel Creator fonctionnait-il réellement ? ».
Il ne définit pas « comment la v2 doit être implémentée ».

### `reference/` décrit une API souhaitée

**Attention :** ces documents ne décrivent pas le code actuel. Exemples :

- `reference/core/object.md` documente `new Object({ name, x, y })` en objet d'options,
  alors que le constructeur réel est positionnel `new Object(name, x, y, width, height, layer)` ;
- `reference/editor/collab.md` documente un module `Collab` fondé sur Socket.IO,
  **absent du code**.

À traiter comme une source d'intention, jamais comme une description du comportement.

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

**Rien ne doit être écrit tant que `../ARCHITECTURE.md` §10 n'est pas tranché.**
La séquence est dans `../MIGRATION.md` §5, et l'étape 1 est l'outillage de test —
avant toute migration de code.
