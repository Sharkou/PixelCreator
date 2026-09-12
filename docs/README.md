# Documentation Pixel Creator

Mémoire persistante du projet. Concise, structurée, et toujours explicite sur la nature
de ce qu'elle affirme.

## À lire en premier

| Ordre | Document | Contenu |
|---|---|---|
| 1 | [PROJECT.md](PROJECT.md) | Ce qu'est Pixel Creator, vocabulaire, périmètre |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture v2 + **registre des décisions** |
| 3 | [MIGRATION.md](MIGRATION.md) | Comparatif Legacy/v2, risques, séquence |
| 4 | [CONVENTIONS.md](CONVENTIONS.md) | Règles de code et de documentation |

## Comprendre l'existant

- [migration/LEGACY_ANALYSIS.md](migration/LEGACY_ANALYSIS.md) — **le document de
  référence** : comportement réel de Legacy, vérifié par exécution
- [migration/MIGRATION_STATUS.md](migration/MIGRATION_STATUS.md) — où en est le projet

## Par système

| Document | Sujet |
|---|---|
| [architecture/CORE.md](architecture/CORE.md) | Couche partagée, Property System, événements |
| [architecture/OBJECT.md](architecture/OBJECT.md) | `Object` et sa hiérarchie |
| [architecture/COMPONENTS.md](architecture/COMPONENTS.md) | Contrat, inventaire, client/serveur |
| [architecture/RUNTIME.md](architecture/RUNTIME.md) | Boucle, rendu, modules de domaine |
| [architecture/EDITOR.md](architecture/EDITOR.md) | Synchronisation temps réel, modularité UI |
| [architecture/NETWORK.md](architecture/NETWORK.md) | Protocole, serveur, Core partagé |

## Décisions

**ADR = Architecture Decision Record** — un enregistrement de décision d'architecture.
Un ADR consigne une décision **prise**, datée et acceptée : il fait autorité. Une
proposition non encore tranchée n'est jamais un ADR — les documents d'audit plus bas en sont,
et ce qu'ils proposaient a depuis été tranché ici.

| ADR | Décision |
|---|---|
| [0001](decisions/ADR-0001-object-stays-object.md) | `Object` reste `Object` |
| [0002](decisions/ADR-0002-transform-component.md) | Transform devient un Component, `object.x` reste une façade |
| [0003](decisions/ADR-0003-property-system.md) | Property System : Proxy, deux API de mutation répliquée |
| [0004](decisions/ADR-0004-component-lifecycle.md) | `update()` / `draw()` sont conservés |
| [0005](decisions/ADR-0005-runtime-modules-not-systems.md) | Le Runtime s'organise par modules de domaine, pas en « Systems » |
| [0006](decisions/ADR-0006-editor-web-components.md) | Editor modulaire par Web Components natifs |
| [0007](decisions/ADR-0007-inspector-schema.md) | Inspector piloté par schéma, réflexif en repli |
| [0008](decisions/ADR-0008-operations.md) | Formaliser les mutations en Operations |
| [0009](decisions/ADR-0009-px-and-js.md) | `.px` est un graphe, `.js` est du JavaScript |
| [0010](decisions/ADR-0010-game-identity.md) | L'identité d'un jeu est un ID, pas son nom |
| [0011](decisions/ADR-0011-authority.md) | Le serveur est l'autorité, l'Editor émet des opérations autorisées |
| [0012](decisions/ADR-0012-runtime-error-isolation.md) | Le Runtime isole et rapporte les erreurs, il ne modifie pas le modèle |
| [0013](decisions/ADR-0013-camera-and-viewport.md) | La caméra est un Object, le viewport est l'écran |
| [0014](decisions/ADR-0014-input-passed-in.md) | L'input est abstrait, indexé par owner, et passé au runtime |
| [0015](decisions/ADR-0015-component-graph-behavior.md) | Un Component peut avoir un graphe `.px` qui définit son comportement |
| [0016](decisions/ADR-0016-component-definition.md) | Une définition décrit un type de Component : propriétés + graphe |
| [0017](decisions/ADR-0017-editor-selection.md) | La sélection et le picking appartiennent à l'Editor |
| [0018](decisions/ADR-0018-structural-order.md) | L'ordre structurel est signifiant, persistant, et sérialisé comme tel |
| [0019](decisions/ADR-0019-structural-operations.md) | Operations structurelles, `invert()`, et `REPARENT` unifié |
| [0020](decisions/ADR-0020-resources.md) | `Resource`, `ResourceId`, `ResourceStore`, et la couche `src/project/` |
| [0021](decisions/ADR-0021-component-identity.md) | L'identité d'une définition de Component est distincte de son nom affiché |
| [0022](decisions/ADR-0022-reparent-transform.md) | Le reparentage préserve le monde, et cette politique appartient à l'Editor |
| [0023](decisions/ADR-0023-property-types.md) | `PropertyType` appartient au Core, `FieldKind` en est dérivé dans l'Editor |
| [0024](decisions/ADR-0024-undo-redo.md) | Undo/Redo : `invert()` au Core, `History` à l'Editor, une pile par ressource |
| [0025](decisions/ADR-0025-folders-and-resource-inspection.md) | Un dossier est une `Resource`, la hiérarchie est un lien `parent`, et l'Inspector inspecte les ressources |
| [0026](decisions/ADR-0026-drag-and-drop-and-px.md) | Le drag & drop est une capacité transverse, `.px` est une seule ressource, et `active` est le seul état de vie |
| [0027](decisions/ADR-0027-graph-model-and-interpreter.md) | Le modèle de graphe `.px`, ses propriétés utilisateur, et son interprète |
| [0028](decisions/ADR-0028-drag-feedback-and-editor-surfaces.md) | Le reflow live appartient aux listes plates, jamais à l'arbre ; le Graph reste dans le stage |
| [0029](decisions/ADR-0029-transport-and-play-mode.md) | Play travaille sur la scène vivante, Stop restaure un instantané, et l'historique s'arrête à la porte |
| [0030](decisions/ADR-0030-references-ranks-and-relevance.md) | Une référence se choisit, un rang est deux opérations, une recherche se note, et une palette répond à deux questions |
| [0031](decisions/ADR-0031-authored-values-and-schema-change.md) | Une valeur autorisée vit sur l'instance, une déclaration vit sur le type, et changer le type ne détruit pas ce qu'un créateur a écrit |
| [0032](decisions/ADR-0032-selection-intent.md) | Il y a un seul sujet, et une intention de sélection s'annonce au lieu de se propager |
| [0033](decisions/ADR-0033-node-rows-and-wire-gestures.md) | Un nœud est une suite de rangées, un fil se dessine sans se pointer, et une couleur dit ce qui circule |
| [0034](decisions/ADR-0034-object-references-in-the-graph.md) | Un graphe atteint d'autres Objects par un handle, jamais par une identité de scène |
| [0035](decisions/ADR-0035-runtime-step-order.md) | L'ordre d'exécution de `Runtime.step()` |
| [0036](decisions/ADR-0036-objectref-boundary.md) | La frontière `objectref` ↔ `object` traduit la valeur, pas seulement le type |
| [0037](decisions/ADR-0037-a-drop-declares-and-configures.md) | Un dépôt déclare, configure, et ne devine jamais |
| [0038](decisions/ADR-0038-pointer-in-two-spaces.md) | Le pointeur existe dans deux espaces, et c'est le viewport qui remplit le second |
| [0039](decisions/ADR-0039-taxonomy-and-the-scope-of-a-reference.md) | Une cible qu'on désigne est un paramètre ; une catégorie dit ce qu'un nœud EST ; une identité entre selon sa PORTÉE |
| [0040](decisions/ADR-0040-one-node-per-intention.md) | Un nœud par intention : le Component se range, la cible se désigne, le nom ne bouge pas |
| [0041](decisions/ADR-0041-events-are-moments-and-a-property-carries-its-path.md) | Un événement est un moment, un état est une question, et une propriété porte son chemin |
| [0042](decisions/ADR-0042-preview-is-a-runtime-client-addressed-by-id.md) | Un Preview est un client de runtime, adressé par un identifiant |
| [0043](decisions/ADR-0043-the-object-answers-for-itself-and-a-drop-finishes-its-sentence.md) | L'Object répond de lui-même, un dépôt finit sa phrase, et une intention vaut un nœud |
| [0044](decisions/ADR-0044-one-folder-one-identity-and-a-live-channel.md) | Un dossier, une identité, et un canal vivant |
| [0045](decisions/ADR-0045-two-questions-two-rows-and-a-shelf-for-moving.md) | Deux questions, deux lignes, et une étagère pour bouger |
| [0046](decisions/ADR-0046-one-gesture-one-model-and-two-widths.md) | Un geste, un modèle, et deux largeurs |
| [0047](decisions/ADR-0047-one-question-and-a-facing.md) | Une seule question, et une orientation |
| [0048](decisions/ADR-0048-a-property-is-named-the-way-it-is-read.md) | Une propriété se nomme comme elle se lit |
| [0049](decisions/ADR-0049-an-identifier-is-read-aloud.md) | Un identifiant se lit à voix haute |
| [0050](decisions/ADR-0050-turning-out-of-the-plane.md) | Tourner hors du plan |
| [0051](decisions/ADR-0051-rotation-is-a-pair.md) | Rotation est une paire |
| [0052](decisions/ADR-0052-a-drop-may-ask-a-question.md) | Un lâcher peut poser une question |
| [0053](decisions/ADR-0053-one-path-one-decoder.md) | Un chemin, un décodeur |
| [0054](decisions/ADR-0054-say-what-is-true.md) | Dire ce qui est vrai |
| [0055](decisions/ADR-0055-two-widths-and-one-grid.md) | Deux largeurs, une grille |
| [0056](decisions/ADR-0056-a-copy-is-the-model.md) | Une copie est le modèle, et un pas de simulation décide quand |
| [0057](decisions/ADR-0057-one-seed-and-two-streams.md) | Une graine, deux flux, et une identité d'édition n'est pas une identité de simulation |
| [0058](decisions/ADR-0058-an-execution-may-outlive-a-step.md) | Une exécution peut survivre au pas qui l'a commencée |
| [0059](decisions/ADR-0059-touching-is-simulation-not-drawing.md) | Se toucher est un fait de simulation, pas une image |
| [0060](decisions/ADR-0060-a-second-space-and-a-second-output.md) | Un second espace de dessin, et une seconde sortie |
| [0061](decisions/ADR-0061-a-prefab-is-a-resource-resolved-before-the-simulation.md) | Un prefab est une Resource, résolue **avant** la simulation |
| [0062](decisions/ADR-0062-one-table-of-resolved-resources.md) | Une seule table de ressources résolues, et le backend répond des pixels |
| [0063](decisions/ADR-0063-a-step-asks-and-the-application-answers.md) | Un pas demande, l'application répond |
| [0064](decisions/ADR-0064-measure-before-optimising-refuse-before-running.md) | Mesurer avant d'optimiser, refuser avant d'exécuter |
| [0065](decisions/ADR-0065-a-project-outlives-the-tab.md) | Un projet survit à l'onglet |
| [0066](decisions/ADR-0066-a-game-is-a-file-before-it-is-a-url.md) | Un jeu est un fichier avant d'être une URL |
| [0067](decisions/ADR-0067-a-wall-that-stops-you.md) | Un mur qui arrête vraiment |
| [0068](decisions/ADR-0068-a-level-is-painted-not-assembled.md) | Un niveau se peint, il ne s'assemble pas |
| [0069](decisions/ADR-0069-a-save-is-not-an-intention.md) | Un enregistrement n'est pas une intention |
| [0070](decisions/ADR-0070-a-cutting-is-a-resource.md) | Un découpage est une ressource |
| [0071](decisions/ADR-0071-un-apercu-suit-les-trois-modeles.md) | Un aperçu suit les trois modèles |
| [0072](decisions/ADR-0072-un-avertissement-n-arrete-rien.md) | Un avertissement n'arrête rien, et une attente a un plafond |

ADR-0001 à 0015 acceptées le 2026-08-12, y compris le mode d'exécution de `.px`
(ADR-0009, Q7 : interprété) ; ADR-0016 et ADR-0017 le 2026-08-13 ; ADR-0018 à ADR-0024 le
2026-08-14 ; ADR-0025 le 2026-08-17 ; ADR-0026 et ADR-0027 le 2026-08-18 ; les suivantes au
fil de l'implémentation, chacune datée dans son propre en-tête. ADR-0015 a été révisé le
2026-08-12 : la couture « Component `Script` avec `kind` + `source` » est remplacée par « un
graphe est le comportement d'un type de Component ».

**Cette table est la liste complète.** Un ADR qui n'y figure pas n'existe pas ; un fichier de
`decisions/` qui n'y figure pas est une ligne à ajouter ici.

## Documents d'audit

Les trois passes du chantier « fondations du modèle de données » sont conservées pour ce
qu'elles expliquent — pourquoi l'ordre structurel est de la donnée, pourquoi une `Resource` a
une identité opaque, pourquoi l'undo tient une pile par ressource. **Ce sont des documents
historiques :** ce qu'ils proposaient a été tranché par les ADR ci-dessus et implémenté.

- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md)
  — **audit** : ce que le modèle était, et ce qui lui manquait
- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md)
  — **proposition** : ordre structurel, Operations structurelles, `Resource` / `ResourceId`,
  Components utilisateur, Undo/Redo, `.px` et fenêtre `Graph`
- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_3.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_3.md)
  — **consolidation** : séquence d'implémentation, dépendances, risques

Les sept décisions que la Phase 3 attendait ont été prises : ADR-0018 à ADR-0027.

## Développement

- [development/DEVELOPMENT.md](development/DEVELOPMENT.md) — exécuter le projet
- [development/TESTING.md](development/TESTING.md) — stratégie de test
- [development/LOGGING.md](development/LOGGING.md) — journalisation

## Règle d'écriture

Toute affirmation est étiquetée :

**OBSERVÉ DANS LEGACY** · **DÉCISION HISTORIQUE** · **PROPOSITION V2** · **QUESTION À VALIDER**

Une proposition n'est jamais présentée comme un comportement existant.
Les documents antérieurs à la Phase 0 sont dans [archive/](archive/README.md), avec la
liste de leurs affirmations contredites par le code.
