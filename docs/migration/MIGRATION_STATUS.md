# État de la migration

**Dernière mise à jour :** 2026-08-12

## Phase actuelle

```
Comprendre → Cartographier → Documenter → Comparer → Proposer → ◄ FAIRE VALIDER
    → Implémenter → Tester → Comparer avec Legacy → Documenter
```

**Phase 0 terminée. En attente de validation.**

Aucune ligne de code v2 n'a été écrite. Aucun fichier de `legacy/` n'a été modifié.

## Livrables de la Phase 0

| Document | Contenu |
|---|---|
| `../PROJECT.md` | Vision, vocabulaire, périmètre |
| `../ARCHITECTURE.md` | Proposition v2 complète + questions ouvertes |
| `../MIGRATION.md` | Analyse comparative, risques, séquence |
| `../CONVENTIONS.md` | Règles de code et de documentation |
| `LEGACY_ANALYSIS.md` | **Comportement réel de Legacy, vérifié** |
| `../architecture/*.md` | Core, Object, Components, Runtime, Editor, Network |
| `../development/*.md` | Développement, tests, logging |
| `../decisions/ADR-*.md` | 9 décisions justifiées |

## Vérifications exécutées

Les points suivants ont été confirmés en exécutant l'éditeur, pas seulement par lecture :

| Vérification | Résultat |
|---|---|
| Trois canaux d'écriture (`x`, `$x`, `setProperty`) | confirmé, comportement distinct |
| Propagation hiérarchique via `_x` | confirmée |
| Édition lettre par lettre Inspector ↔ Hierarchy | confirmée |
| Propriétés ajoutées après construction | **non réactives** |
| Champs `#privés` | **invisibles au Property System** |
| Surcoût de sérialisation | **facteur 3,09** |
| Enfants sérialisés deux fois | confirmé |
| Mode solo hors ligne | **cassé** — `TypeError` par frame, silencieuse |
| Benchmark Proxy vs accesseurs | Proxy : lecture égale, **écriture 4× plus rapide** |

## Décisions en attente

Bloquantes pour l'implémentation — voir `../ARCHITECTURE.md` §10 :

| # | Question |
|---|---|
| Q1 | `childs` → `children` ? |
| Q2 | `uid` → `owner` ? |
| Q3 | Garder le sigil `$` ? |
| Q4 | Plusieurs composants du même type par objet ? |
| Q5 | Frontière d'autorité serveur édition / jeu ? |
| Q6 | Compatibilité avec les projets Legacy ? |
| Q7 | `.px` interprété ou compilé ? |
| Q8 | Canvas 2D seul, ou préparer WebGL ? |

## Prochaine étape

Étape 1 de `../MIGRATION.md` §5 : **outillage**.
Test runner, correction de `tools/dev-server.sh`, test de règle de dépendance des couches.

Aucune migration de code avant que ce socle existe — le risque R1 (rupture silencieuse
du Property System) n'est pas détectable autrement.
