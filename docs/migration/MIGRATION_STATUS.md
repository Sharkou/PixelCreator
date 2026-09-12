# État de la migration

**Dernière mise à jour :** 2026-09-12

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
| **3** | **Premier vertical slice de l'Editor** — Shell, Viewport sur le Runtime réel, sélection et picking éditoriaux (ADR-0017), Hierarchy, Inspector piloté par schéma, ajout/retrait de Components. Complément Core : les cinq événements de structure de la `Scene` |
| **3.1** | **Editor UX-2** — shell à fenêtres redimensionnables (`window` / `tabs` / `splitter` / `layout`), Hierarchy avec recherche et actions par ligne, outils de Viewport (`select-tool` / `pan-tool`), resize 8 directions paramétré, zoom lissé, repères de curseur, Inspector à contrôles typés, toolbar de création par glisser, coquilles Project / Timeline |
| **3.2** | **Modern Pixel — design system** (`795a545`) : tokens à rôles sémantiques, accent corail, densité `row` / `control` / `hit`, icônes à deux tailles rendues (16 / 20), couches z nommées, easing et durées. Palette Legacy abandonnée |
| **3.3** | **Modern Pixel — Viewport** (`bb8268a`) : backing store DPR, détection de changement de DPR, resize robuste, picking et grille optimisés, cache des mesures DOM, `pointermove` coalescé, boucle de rendu *dirty*, tactile et pinch zoom |
| **3.4** | **Modern Pixel — Inspector** (`a38d90e`, `2cc7411`) : `.row > .label + .fields`, la grille appartient à l'Inspector, `px-field` réduit à une cellule, scrub, steppers empilés, valeurs en monospace ; `box-sizing` rétabli dans la feuille adoptée par les Shadow Roots |
| **3.5** | **Modern Pixel — chrome, fenêtres et layout L4** : `window` / `hierarchy` / `menu` / `splitter` / `tabs` / `toolbar` / `editor` convergés, bloc d'alias temporaires **supprimé**, `px-dock` scindé en `px-project` et `px-timeline`, disposition L4 (Hierarchy et Project à gauche, Inspector en colonne ininterrompue, Timeline conditionnelle) |

| **4** | **Ordre structurel et Operations structurelles** (ADR-0018 à ADR-0024) : `PropertyType`, collections ordonnées, stockage ordonné des Components, primitives structurelles, `seq` par pipeline, `invert()`, gestionnaires qui refusent, sérialisation v2 avec ordre explicite (`FORMAT_VERSION = 2`), `Matrix.decompose()`, couche `project/`, historique Undo/Redo, politique de reparentage |
| **4.4** | **Le graphe `.px`** (ADR-0027) : modèle de graphe au Core (`core/graph/` — nœuds, ports, connexions, tous par **identité**), catalogue de nœuds (événements, propriétés, flux, valeurs, arithmétique, comparaison, logique), propriétés utilisateur d'un Component avec un `id` stable qu'un renommage ne touche pas, `ComponentDefinition` — le modèle vivant d'un `.px`, une pipeline et une pile pour la ressource entière —, Operations `ADD_NODE` / `REMOVE_NODE` / `CONNECT` / `DISCONNECT` / `ADD_PROPERTY` / `REMOVE_PROPERTY` toutes inversibles, `validateGraph()` indépendant de l'UI, **interprète** headless (`runtime/scripting/interpreter.js`, flux poussé / données tirées, budget, `GraphError`), fenêtre **Graph** en SVG, `Workspace` multi-éditeurs avec ouverture et **fermeture**, Inspector des propriétés d'un `.px` et des nœuds |
| **4.3** | **Cohérence Project / Inspector / Drag & drop** (ADR-0026) : `.px` = **une** ressource (Component + graphe), `active` seul état de vie (`visible` supprimé), renommage identique dans Project et Hierarchy (second clic) et réactif dans l'Inspector avec **une** entrée d'undo par session de frappe, extension déterminée par le type, `MOVE_RESOURCE` (dossier **et** rang), système de drag & drop transverse (`editor/dnd/`), Project en navigateur d'assets avec aperçus, menus `+` catégorisés et `…`, `Share` et profil dans le titlebar |
| **4.2** | **Project / Resource UX** (ADR-0025) : dossiers comme `Resource` et hiérarchie par lien `parent` (`MANIFEST_VERSION = 2`), menu `+` extensible par table de kinds, navigation à fil d'Ariane, déplacement par glisser-déposer, suppression d'arbre en un `batch`, renommage validé (une opération, pas une par frappe), sélection et désélection de ressource dans le `Workspace`, panneau `Resource` de l'Inspector piloté par `describeResource()`, import et remplacement d'image, icônes de ressources distinctes des icônes de fenêtres |
| **4.1** | **Intégration Editor ↔ Project** : `Workspace`, scène déclarée comme `Resource`, `Ctrl S`, état « non enregistré » dérivé du pipeline, `<px-project>` listant le manifeste réel, reparentage et réordonnancement par glisser-déposer (Hierarchy et Inspector), vérification des imports morts dans `tools/layers/` |

### État vérifié (2026-09-12)

```bash
tools/test.sh                  # 2300 tests, 2300 passés
node tools/layers/run.js       # v2 : 0 violation, 0 import mort — legacy : 1 violation + 2 imports morts, trackés
node tools/parity/run.js       # 39 identical, 0 problems
node tools/check-css-literals.js
node tools/check-boot.js
node tools/check-exports.js
```

Vérifié aussi dans le navigateur, sans erreur console : dépôt d'une ligne de Hierarchy sur
une autre (imbrication) et entre deux lignes (réordonnancement), `Ctrl Z` / `Ctrl Y` sur un
dépôt, réordonnancement d'un Component par son en-tête, `Ctrl S` et point « non
enregistré » du titlebar. Puis, pour l'étape 4.2 : créer un Folder, une Scene et un
Component depuis `+`, renommer une ressource sur plusieurs caractères et valider par
Entrée, annuler et rétablir ce renommage, entrer dans un dossier et revenir par le fil
d'Ariane, déplacer une ressource dans un dossier par glisser-déposer, sélectionner une
ressource et lire ses propriétés dans l'Inspector, la renommer depuis l'Inspector,
désélectionner par un clic dans le vide, supprimer une ressource et annuler, et constater
que la scène ouverte — comme le dossier qui la contient — refuse d'être supprimée en
disant pourquoi.

### Trois défauts trouvés en implémentant, et corrigés

| Défaut | Effet | Correction |
|---|---|---|
| `Scene.reparent()` émettait ses événements **pendant** le remaniement | La Hierarchy reconstruisait sur un arbre à moitié déplacé ; annuler un dépôt faisait **disparaître** l'objet de l'arbre alors que le modèle était juste | Les notifications d'un remaniement sont retenues et émises une fois la forme entière (ADR-0019 §3 bis) |
| `Project.deserialize()` rejouait un `ADD_RESOURCE` par entrée | Rouvrir un projet sur un store partagé **écrasait chaque payload** par `null`, et numérotait des opérations que personne n'avait autorisées | Le manifeste est reconstruit par une primitive, jamais par le pipeline |
| `editor/mod.js` réexportait `./windows/dock.js`, supprimé deux commits plus tôt | Le point d'entrée de l'Editor était **inchargeable**, et aucun test ne pouvait le voir | Export corrigé, et `tools/layers/run.js` échoue désormais sur tout import statique qui ne résout pas |

Acquis des passes précédentes, toujours vérifiés : sélection au clic et depuis la
Hierarchy, recherche filtrante conservant les ancêtres, renommage lettre par lettre
Inspector ↔ Hierarchy, `lock` / `visible` / delete par ligne, déplacement et
redimensionnement aux poignées, pan, zoom, cadrage, création par glisser depuis la
toolbar, seams persistées, repli de la colonne droite sous 760 px.

`src/` contient `core/`, `project/`, `runtime/`, `editor/` et `preview/`. **`network/`
n'existe pas encore** : ce qu'un transport aurait à porter existe déjà — une Operation — et le
canal vivant entre un Editor et ses aperçus en est la première démonstration (ADR-0044,
ADR-0071).

### Ce que les étapes 3 et 3.1 ont ajouté au Core

Deux compléments, et deux seulement.

**Étape 3**, volontairement fermé : la `Scene` annonce les changements de
**structure** — `component:added` / `component:removed` / `child:added` / `child:removed`,
à côté des `added` / `removed` existants. Une propriété s'observe déjà sur l'objet qui la
porte ; une forme, non. Voir `../architecture/CORE.md` §Events.

**Ce n'est pas un bus de mutations généralisé** et la liste ne doit pas s'allonger sans
raison de même nature.

**Étape 3.1** : `serializeComponent()` écrit `active` quand le composant le porte.
`active` appartient au contrat de Component et à aucun schéma, si bien qu'un Component
désactivé depuis l'Editor produisait une Operation réplicable puis se perdait à la
sauvegarde suivante. Voir `../architecture/CORE.md` §Serialization.

### Passe de revue du 2026-09-12 — ce qu'elle a trouvé

Une relecture complète du code actif, doublée d'un parcours réel dans le navigateur. Ce
qu'elle a corrigé, par famille :

**Un store qui peut attendre n'était pas attendu** (ADR-0020 §4). `ResourceStore.read()` est
asynchrone depuis qu'il existe un store persistant (ADR-0065), et quatre appelants lisaient sa
réponse comme une valeur :

| Où | Ce qu'un créateur voyait |
|---|---|
| `preview/bundle.js` | **Preview et Export étaient cassés** : chaque charge utile partait comme une `Promise`, que `JSON.stringify` écrit `{}` |
| `windows/project.js`, `ui/resource-field.js` | aucune vignette d'image dans un projet enregistré |
| `windows/inspector.js` | la taille d'une ressource restait vide |
| `Project.remove()`, `Project.setPayload()` | annuler une suppression rendait une ressource **sans son contenu** |

`PersistentResourceStore.read()` passe désormais par la même file que `write()` : une lecture
juste après une sauvegarde répondait l'état d'avant.

**L'Editor écrivait sans arrêt.** L'autosave écoutait sa propre comptabilité — `dirty: false`
après une écriture, et les `SET_PROPERTY` `Origin.LOCAL` de `save()` — donc chaque écriture en
demandait une autre : **21 écritures IndexedDB en trois secondes sur un Editor que personne ne
touchait**, et une `revision` qui montait toute seule, invalidant tous les caches qui en
dépendent. Mesuré à zéro après correction (ADR-0069 §2).

**Trois types livrés n'avaient pas de nom.** `Body`, `Follow` et `TilemapCollider` étaient dans
`runtime/builtins.js` et pas dans la table de l'Editor : le menu Add Component offrait
`TilemapCollider` — le nom de classe — sous `Other`, deux étagères plus loin que le `Tilemap`
qu'il complète. Un test parcourt désormais `BUILT_IN` et échoue si un type n'a ni étagère ni
glyphe.

**Un reparentage écrasait la seconde moitié de la rotation.** `decompose()` rend le produit
`scaleX · cos(rotationY)` ; l'écrire dans `scaleX` sans toucher `rotationY` appliquait le
cosinus deux fois — un objet tourné de 60° perdait la moitié de sa largeur à chaque
réorganisation dans la Hierarchy, en silence (ADR-0051).

**Un graphe en construction s'arrêtait.** Le validateur classe « aucune propriété choisie »
en avertissement pour qu'un graphe en cours d'écriture tourne ; l'interprète jetait dessus, à
chaque pas, et une exception déroule tout le `walk` — donc tout ce qui était câblé après le
nœud non visé ne tournait plus. Voir ADR-0072, qui décide aussi du plafond d'attentes
suspendues et de l'isolation d'une exécution reprise qui échoue.

**Un aperçu ne suivait que deux modèles sur trois.** Voir ADR-0071.

Et quelques manques réels : `Ctrl D` (le Core savait dupliquer, rien dans l'Editor ne
l'atteignait), `Escape` qui abandonne un geste au lieu de le valider, un dépôt sur une
`list<resource>`, l'icône et l'étiquette des cinq composants qui n'en avaient pas.

### Laissé volontairement pour plus tard

| Sujet | Pourquoi |
|---|---|
| Adaptateur navigateur pour l'input | Appartient à la couche qui possède le DOM, pas au runtime (ADR-0014) |
| Ouvrir une **seconde** scène depuis le panneau Project | Demande de rebrancher toutes les fenêtres sur une autre `Scene`. `Workspace` ouvre et ferme réellement, et tient plusieurs éditeurs ; ouvrir une scène ferme donc l'autre (ADR-0027 §10) |
| Sélection multiple, copier/coller et commentaires dans le graphe | Chacun est un geste avec ses propres questions ; en livrer la moitié rend une toile imprévisible |
| Migration des instances quand une définition change | Décision d'Editor, pas de runtime (ADR-0016) |
| Timeline fonctionnelle | Demande un modèle d'édition d'animation, que le format de clip (ADR-0062 §4) ne donne pas à lui seul |
| Renderer présenté comme un type unique dans l'Inspector | Question UX ouverte : un `Type ▼` affirmerait un seul renderer par Object, ce que le modèle n'impose pas |
| Publier un jeu à une URL | `Export game…` écrit le bundle qu'un aperçu lit ; l'héberger demande des comptes et des permissions, qui sont des décisions de produit (ADR-0066 §2) |
| `network/` | Ce qu'un transport porterait — une Operation — existe ; le canal vivant entre un Editor et ses aperçus en est la première démonstration (ADR-0044, ADR-0071) |

### Ce qui a été livré depuis

Les lignes suivantes étaient dans la table ci-dessus et n'y sont plus, parce qu'elles existent :

| Sujet | Où |
|---|---|
| Adaptateur IndexedDB de `ResourceStore` | `project/persistence.js`, `project/indexeddb.js` (ADR-0065) |
| Play / Pause / Stop dans l'Editor | `editor/transport.js` (ADR-0029) |
| Prefab (Object → Project) | `core/prefab.js`, `project/prefabs.js` (ADR-0061) |
| Import de sons | `runtime/audio/`, règle de dépôt `audio → AudioSource` (ADR-0060) |
| `runtime/physics/`, `animation/`, `audio/` | Les trois domaines existent (ADR-0059, ADR-0062, ADR-0067) |
| Valeur en ligne sur une entrée de nœud non connectée | `node.inputs` (ADR-0031 §1) |
| Glisser une propriété vers la toile | Le menu propose `Get` et `Set`, explicitement (ADR-0037, ADR-0053) |

### Décisions d'interface encore ouvertes

Elles bloquent des éléments que la maquette dessine et que le code refuse d'inventer.

| Sujet | Pourquoi c'est ouvert |
|---|---|
| Barre de commandes `Ctrl K` | Il n'existe aucun registre de commandes à interroger. `openMenu()` place une liste, il ne la construit pas. Un système de commandes est un travail à part entière |
| Couleurs de famille | La direction A du prototype donne `--hue-*: var(--accent)` : les quatre teintes n'existent **que** dans la direction B. La décision retenue les limite à l'icône d'en-tête d'un panneau, mais leur valeur n'est pas arrêtée, donc aucun token de famille n'a été introduit |
| `px-tabs` | Plus aucun consommateur depuis la scission de `px-dock`. La primitive est conservée et enregistrée ; la supprimer est une décision, pas un nettoyage |

## Décisions validées

**La table ci-dessous s'arrête à ADR-0027, et c'est délibéré :** elle relève les décisions de
la Phase 0 et de la première tranche d'implémentation. La liste **complète et à jour** des ADR
est dans [`../README.md`](../README.md).

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
| Dossiers et ressources | Un dossier est une `Resource` ; la hiérarchie est un lien `parent` ; l'Inspector route vers un panneau `Resource` piloté par table | ADR-0025 |
| Drag & drop, `.px`, `active` | Une table de règles pour tous les dépôts ; un Component et son graphe sont **une** ressource ; `Object.visible` supprimé ; `MOVE_RESOURCE` porte le rang | ADR-0026 |
| Ordre structurel | L'ordre des Components et des racines est de la donnée : persisté, répliqué, annulable | ADR-0018 |
| Operations structurelles | Sept types pour la Scene, deux pour le Project ; `REPARENT` couvre quatre gestes ; un gestionnaire refuse, il ne jette pas | ADR-0019 |
| Ressources | Une seule unité `Resource` ; identité opaque, jamais un chemin ; `ResourceStore` asynchrone ; couche `project/` | ADR-0020 |
| Identité d'un Component | Le `type` d'un Component utilisateur est le `ResourceId` de sa définition | ADR-0021 |
| Reparentage | Le placement monde est conservé, recomposé une fois par l'Editor et envoyé en nombres | ADR-0022 |
| Types de propriété | `PropertyType` au Core, `FieldKind` dérivé côté Editor | ADR-0023 |
| Graphe `.px` | Modèle au Core, interprète au Runtime, rendu SVG à l'Editor ; nœuds, ports et connexions par identité ; une propriété utilisateur porte un `id` stable ; un flux qui boucle est une boucle, un cycle de données est une erreur | ADR-0027 |
| Undo / Redo | `invert()` au Core, `History` à l'Editor, une pile par ressource, `submit(invert(op))` jamais `apply()` | ADR-0024 |
| Projets Legacy | Aucune migration de données à concevoir | — |
| Renommages | `childs` → `children`, `uid` → `owner`, `static` supprimé | ADR-0001 |

## Questions ouvertes

Aucune question bloquante. Q7 (mode d'exécution de `.px`) a été tranchée le
2026-08-12 : **interprété**, pour le débogage et la sécurité.

**Q8 — l'Inspector doit-il présenter un `Renderer [ Type ▼ ]` unique ?** Ouverte depuis
2026-08-13. Aujourd'hui un Object peut porter `RectangleRenderer` **et** `Sprite` **et**
`ParticleSystem` : ils se dessinent tous. Un sélecteur de type unique affirmerait
« un renderer par Object » et ferait de tout changement de type un retrait + un ajout,
donc une perte de propriétés. Aucune ligne de Core n'est nécessaire pour l'implémenter :
c'est le **modèle mental** qui se déciderait, pas la technique. En attendant, le menu Add
regroupe et renomme (`Rendering ▸ Rectangle`), ce qui est compatible avec les deux issues.

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
