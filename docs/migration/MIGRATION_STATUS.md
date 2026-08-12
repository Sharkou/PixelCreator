# État de la migration

**Dernière mise à jour :** 2026-08-12

## Phase actuelle

```
Comprendre → Cartographier → Documenter → Comparer → Proposer → Faire valider ✅
    → ◄ IMPLÉMENTER → Tester → Comparer avec Legacy → Documenter
```

**Phase 0 close. Décisions validées le 2026-08-12.**

Aucune ligne de code v2 n'a été écrite. Aucun fichier de `legacy/` n'a été modifié.

**Étape 1 faite** : le harnais de parité existe et capture 39 scénarios.

```bash
node tools/parity/run.js
```

Voir `tools/parity/README.md`. Prochaine action : étape 1 bis (serveur de dev corrigé,
test de règle de dépendance des couches), puis étape 2 — `core/`.

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
| `.px` | traité comme du JavaScript | ressource graphe JSON |
| `childs`, `uid` | — | `children`, `owner` |

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
