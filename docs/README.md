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

Toutes acceptées le 2026-08-12. Seul le mode d'exécution de `.px` (ADR-0009, Q7) reste
ouvert, et il n'est pas bloquant.

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
