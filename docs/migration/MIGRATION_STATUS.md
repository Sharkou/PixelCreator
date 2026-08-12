# État de la migration

**Dernière mise à jour :** 2026-08-12

## Phase actuelle

```
Comprendre → Cartographier → Documenter → Comparer → Proposer → Faire valider ✅
    → ◄ IMPLÉMENTER → Tester → Comparer avec Legacy → Documenter
```

**Phase 0 close. Décisions validées le 2026-08-12. Implémentation en cours.**

Aucun fichier de `legacy/` n'a été modifié.

### Étapes réalisées

| Étape | Contenu |
|---|---|
| **1** | Harnais de parité — 39 scénarios capturés depuis Legacy (`tools/parity/`) |
| **1 bis** | `tools/dev-server.sh` sert `legacy/` ; `tools/layers/run.js` vérifie les couches |
| **2** | `core/` — `Object`, `Component`, `Scene`, Property System (Proxy), Operations, Authority, événements, sérialisation explicite, identité |
| **2.8** | `Transform`, matrices et composition hiérarchique ; abstraction de renderer ; backend Canvas 2D ; `SceneRenderer` ; `RectangleRenderer`, `Sprite`, `ParticleSystem`, `Tilemap` ; `Runtime` ; `Clock` |
| **2.9** | Modèle d'erreurs d'exécution — isolation et rapport séparés de la politique (ADR-0012) |
| **2.10** | `runtime/input/` (ADR-0014) ; `Camera` / `Viewport` et conversions monde↔écran (ADR-0013) ; socle `runtime/scripting/` — **révisé** : un Component peut avoir un graphe `.px` qui définit son comportement, il n'existe pas de Component `Script` (ADR-0015) |

| **2.11** | Définition de Component — propriétés + graphe, `defineComponent()` (ADR-0016) ; quatre formes de Component verrouillées et testées (ADR-0004) ; `preview()` retiré du contrat ; vérification des fondations avant l'Editor |

### État vérifié (2026-08-13, après étape 2.11)

```bash
tools/test.sh              # 381 tests, 381 passés
node tools/layers/run.js   # v2 : 0 violation — legacy : 1 violation trackée
node tools/parity/run.js   # 39 identical, 0 problems
```

`src/` contient `core/` et `runtime/`. **`editor/` et `network/` n'existent pas encore** :
les règles de couches qui les concernent sont déclarées mais ne vérifient rien tant que
ces dossiers sont absents.

### Laissé volontairement pour plus tard

| Sujet | Pourquoi |
|---|---|
| Adaptateur navigateur pour l'input | Appartient à la couche qui possède le DOM, pas au runtime (ADR-0014) |
| Interprète de graphe `.px` | Demande le modèle de graphe ; l'hôte `Behaviors` le reçoit en paramètre (ADR-0009, ADR-0015) |
| Chargement des ressources — qui appelle `behaviors.bind()` | Demande `Resource` et le chargement de projet (ADR-0009) |
| Migration des instances quand une définition change | Décision d'Editor, pas de runtime (ADR-0016) |
| Picking de l'Editor | `screenToWorld()` fournit le mapping ; la politique de sélection appartient à l'Editor (ADR-0013) |
| `runtime/physics/`, `animation/`, `audio/` | Domaines non entamés |

### Prochaine action

**Étape 3 — l'Editor et son UX.** Les fondations du Runtime sont suffisantes : cycle de
vie des Components (les quatre formes), input, caméra/viewport, rendu, comportement par
graphe, définitions de Components, sérialisation, erreurs, déterminisme et exécution
headless sont en place et testés. `runtime/physics/` et les autres domaines ne sont pas
requis pour commencer l'Editor.

## Décisions validées

| Sujet | Décision | Référence |
|---|---|---|
| Property System | `x =` mutation directe ; `setProperty()` mutation contrôlée → Operation. **`$x` supprimé** | ADR-0003 |
| Operations | Toute mutation du modèle est représentable par une Operation | ADR-0008 |
| Components | Un seul par type ; `update`/`draw`/les deux | ADR-0004 |
| Transform | Component normal, `object.x` en accès pratique | ADR-0002 |
| Runtime | Domaines directs sous `runtime/`, pas de `Systems/` | ADR-0005 |
| Rendering | Canvas 2D + abstraction légère | ADR-0004 |
| Autorité | Serveur autoritaire ; mutation joueur ≠ mutation éditeur autorisée | ADR-0011 |
| Scripting | `.px` = graphe **interprété** (débogage, sécurité), `.js` = JS natif | ADR-0009 |
| Editor | Web Components `px-*`, modèle central, vues réactives | ADR-0006 |
| Erreurs runtime | Le Runtime isole et rapporte ; il ne modifie pas le modèle. Pas d'auto-désactivation | ADR-0012 |
| Camera / Viewport | La caméra est un `Object` ; le viewport est l'écran ; la vue est dérivée | ADR-0013 |
| Input | Abstrait, indexé par owner, passé à `step()` — jamais un global | ADR-0014 |
| Scripting | Un Component peut avoir un graphe `.px` qui définit son comportement. Pas de Component `Script`, pas de `ScriptSystem` | ADR-0015 |
| Components utilisateur | Une définition (`type` + propriétés + graphe) produit un Component ordinaire ; elle appartient au type | ADR-0016 |
| Projets Legacy | Aucune migration de données à concevoir | — |
| Renommages | `childs` → `children`, `uid` → `owner`, `static` supprimé | ADR-0001 |

## Questions ouvertes

Aucune question bloquante. Q7 (mode d'exécution de `.px`) a été tranchée le
2026-08-12 : **interprété**, pour le débogage et la sécurité.

Restent des points mineurs, décidables à l'implémentation et listés dans les ADR
concernés (ex. `Transform` ajouté par défaut ou non).

## Changements de sémantique par rapport à Legacy

À signaler à toute personne qui lit `legacy/` comme référence :

| Sujet | Legacy | v2 |
|---|---|---|
| `setProperty()` | écrit `_x`, **ne réplique pas** | **chemin contrôlé** → Operation |
| `$x` / `syncProperty()` | chemins répliqués | **supprimés** — remplacés par `setProperty()` |
| `_x` / `__x` | couches internes observables | internes, **hors de toute API publique** |
| Autorité | aucune — le serveur applique et rediffuse | serveur autoritaire, `authority.check()` obligatoire |
| `Sprite` | sous-classe d'`Object` | Component |
| `Tilemap` | `draw(ctx, camera)` — cassé si attaché | `draw(self, renderer)` |
| `.px` | traité comme du JavaScript | ressource graphe JSON, **comportement d'un type de Component** |
| `childs`, `uid` | — | `children`, `owner` |
| Exception dans un Component | `try/catch` muet — l'erreur disparaît | isolée **et** rapportée (`onError`), jamais convertie en mutation du modèle |
| Input | singleton `Keyboard` → `Network.users` — solo cassé | état abstrait indexé par owner, passé à `step()` |
| `Camera` | le même nom désigne le composant, l'Object porteur et la projection | `Camera` = objectif ; l'`Object` = la position ; `Viewport` = l'écran |
| `Camera.offset` | seconde position concurrente de `camera.x` | supprimée — une seule API de position |

## Vérifications exécutées en Phase 0

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
| `Tilemap` / `Lighting` / `LightSource` | signatures non conformes au contrat de Component |

## Découvertes du harnais de parité (2026-08-12)

Obtenues en exécutant Legacy, pas en le lisant :

| Constat | Scénario |
|---|---|
| `copy()` depuis un `Object` vivant met `components` / `childs` / `image` à `undefined` | `scene/copy-from-live-object-wipes-containers` |
| `instantiate()` lève dès que la source porte un composant — prefabs et `Network.add` cassés | `scene/instantiate-throws-with-components` |
| `copy()` depuis du JSON brut fonctionne, ce qui masquait le défaut | `scene/copy-from-plain-json-works` |
| Construire un `Object` émet 19 notifications | `property/construction-emits-every-property` |
| 57 clés énumérables pour 19 propriétés publiques | `property/enumerable-pollution` |
| Le `setProperty()` de Legacy ne produit aucune opération (inversion confirmée) | `property/legacy-set-property-path` |
| 4 frappes → 4 opérations, aucun regroupement | `network/no-batching` |
| `gamepad.js` utilise une garde DOM différente des autres modules | `env/globals.js` |
