# Documents archivés

Ces documents précèdent la Phase 0. Ils sont **conservés comme sources d'intention**,
pas comme descriptions du comportement du code.

Plusieurs de leurs affirmations sont **contredites par le code** — c'est ce qui a motivé
la règle d'étiquetage OBSERVÉ / DÉCISION HISTORIQUE / PROPOSITION V2 / QUESTION À VALIDER
(voir `../CONVENTIONS.md`).

| Affirmation | Réalité vérifiée |
|---|---|
| « The editor never mutates engine state directly » | L'Editor écrit `scene.current.$x = …` directement (`editor/system/handler.js`) |
| « Local update: `obj.setProperty('x', 100)` / Network: `obj.syncProperty(...)` » | Ces méthodes existent mais l'Editor utilise en réalité l'accesseur `$prop` |
| « No component-to-component coupling » | `Animator` pilote `Animation` ; `Controller` appelle `self.translate()` qui appelle `components.collider.update()` |
| « If something is visible, it owns a renderer component » | `Object.select()` et `Object.preview()` dessinent depuis le Core, hors composant |

| Fichier | Remplacé par |
|---|---|
| `project-vision.md` | `../PROJECT.md` |
| `architecture.md` | `../ARCHITECTURE.md` + `../architecture/*.md` |
| `coding-guidelines.md` | `../CONVENTIONS.md` |
| `documentation.md` | réparti entre `../PROJECT.md` et `../CONVENTIONS.md` |

Rien n'a été perdu : ces fichiers restent lisibles ici et dans l'historique git.
