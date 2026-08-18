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
proposition non encore tranchée n'est jamais un ADR (voir la section suivante).

| ADR | Décision |
|---|---|
| [0001](decisions/ADR-0001-object-stays-object.md) | `Object` reste `Object` |
| [0002](decisions/ADR-0002-transform-component.md) | `Transform` composant, `object.x` en façade |
| [0003](decisions/ADR-0003-property-system.md) | Property System par `Proxy`, ergonomie inchangée |
| [0004](decisions/ADR-0004-component-lifecycle.md) | `update()` / `draw()` conservés |
| [0005](decisions/ADR-0005-runtime-modules-not-systems.md) | Modules de domaine, pas de « Systems » |
| [0006](decisions/ADR-0006-editor-web-components.md) | Editor en Web Components natifs |
| [0007](decisions/ADR-0007-inspector-schema.md) | Inspector à schéma, réflexif en repli |
| [0008](decisions/ADR-0008-operations.md) | Mutations formalisées en Operations |
| [0009](decisions/ADR-0009-px-and-js.md) | `.px` = graphe, `.js` = JavaScript |
| [0010](decisions/ADR-0010-game-identity.md) | Identité par ID, pas par nom |
| [0011](decisions/ADR-0011-authority.md) | Le serveur est l'autorité ; l'Editor émet des opérations autorisées |
| [0012](decisions/ADR-0012-runtime-error-isolation.md) | Le Runtime isole et rapporte les erreurs, il ne modifie pas le modèle |
| [0013](decisions/ADR-0013-camera-and-viewport.md) | La caméra est un Object, le viewport est l'écran |
| [0014](decisions/ADR-0014-input-passed-in.md) | Input abstrait, indexé par owner, passé au pas de simulation |
| [0015](decisions/ADR-0015-component-graph-behavior.md) | Un Component peut avoir un graphe `.px` qui définit son comportement |
| [0016](decisions/ADR-0016-component-definition.md) | Une définition décrit un type de Component : propriétés + graphe |
| [0017](decisions/ADR-0017-editor-selection.md) | La sélection et le picking appartiennent à l'Editor, jamais aux Colliders |
| [0018](decisions/ADR-0018-structural-order.md) | L'ordre des Components et des racines est de la donnée |
| [0019](decisions/ADR-0019-structural-operations.md) | Les Operations structurelles ; `REPARENT` couvre quatre gestes |
| [0020](decisions/ADR-0020-resources.md) | `Resource`, `ResourceStore`, et la couche `project/` |
| [0021](decisions/ADR-0021-component-identity.md) | Le `type` d'un Component utilisateur est le `ResourceId` de sa définition |
| [0022](decisions/ADR-0022-reparent-transform.md) | Un reparentage conserve le placement monde |
| [0023](decisions/ADR-0023-property-types.md) | `PropertyType` au Core, `FieldKind` dérivé dans l'Editor |
| [0024](decisions/ADR-0024-undo-redo.md) | `invert()` au Core, `History` à l'Editor, une pile par ressource |
| [0025](decisions/ADR-0025-folders-and-resource-inspection.md) | Un dossier est une `Resource` ; l'Inspector inspecte les ressources |
| [0026](decisions/ADR-0026-drag-and-drop-and-px.md) | Le drag & drop est une capacité transverse ; `.px` est **une** ressource ; `active` est le seul état de vie |
| [0027](decisions/ADR-0027-graph-model-and-interpreter.md) | Le modèle de graphe `.px`, ses propriétés utilisateur, et son interprète |

ADR-0001 à 0015 acceptées le 2026-08-12, y compris le mode d'exécution de `.px`
(ADR-0009, Q7 : interprété) ; ADR-0016 et ADR-0017 le 2026-08-13 ; ADR-0018 à ADR-0024 le
2026-08-14 ; ADR-0025 le 2026-08-17 ; ADR-0026 et ADR-0027 le 2026-08-18. ADR-0015 a été
révisé le 2026-08-12 : la couture « Component `Script` avec `kind` + `source` » est
remplacée par « un graphe est le comportement d'un type de Component ».

## Propositions en cours d'arbitrage

Documents d'audit et de proposition. **Ils ne font pas autorité** : rien de ce qu'ils
proposent n'est décidé ni implémenté tant qu'un ADR ne l'a pas enregistré.

Chantier « fondations du modèle de données », en trois passes :

- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md)
  — **audit** : ce que le modèle est réellement, et ce qui lui manque
- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md)
  — **proposition** : ordre structurel, Operations structurelles, `Resource` / `ResourceId`,
  Components utilisateur, Undo/Redo, `.px` et fenêtre `Graph`
- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_3.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_3.md)
  — **consolidation** : séquence d'implémentation, dépendances, risques, et les décisions
  requises avant de commencer

**Aucune implémentation n'a commencé.** Sept décisions attendent un arbitrage
(Phase 3, § « Décisions requises avant implémentation »).

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
