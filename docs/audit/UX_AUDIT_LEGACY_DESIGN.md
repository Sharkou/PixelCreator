# Audit UX/UI — `legacy/` + `design/` → recommandations pour la v2

- **Date :** 2026-08-18
- **Nature :** document d'analyse **non normatif**. Il ne modifie aucun ADR, aucune
  architecture, aucun code. Il prépare des décisions.
- **Sources lues :** `legacy/` (éditeur complet), `design/` (prototype UX-2.5),
  `src/` (état réel du code v2), `docs/architecture/`, ADR-0001 → ADR-0027, tests.
- **Destinataire :** l'agent d'implémentation. La section **K** est la seule à lire si
  le temps manque.

> **Avertissement de méthode.** Ce rapport a été écrit en lisant le code v2, pas
> `MIGRATION_STATUS.md`. Quand ce rapport dit « absent », il veut dire : aucun appelant
> dans `src/`. Chaque constat porte son fichier.

---

## A. Résumé exécutif — les 10 améliorations les plus importantes

Classées par rapport bénéfice/risque, pas par difficulté.

| # | Amélioration | Pourquoi elle est en tête | Priorité |
|---|---|---|---|
| 1 | **La grille du Graph ne bouge pas.** Le `<rect>` de fond est un frère de `#content`, pas un enfant : il ne reçoit ni le `translate` ni le `scale` de la vue (`src/editor/windows/graph.js`, `#build`). Les nœuds glissent sur une grille fixe. | C'est le seul défaut de la toile qui casse la perception du pan. Legacy le gérait explicitement (`updateGridBounds()`). Correction : `patternTransform`, une ligne. | **P0** |
| 2 | **Un drag inter-fenêtres est aveugle.** `px-drag-start` mémorise le payload, et **rien ne se passe** jusqu'à `px-drag-end` (`src/editor/editor.js:548-569`) : pas de fantôme, pas de cible surlignée, pas de curseur, pas de refus visible. | Le geste central du produit — glisser un asset dans la scène — n'a aucun retour pendant son vol. Legacy, lui, en avait (fantôme `setDragImage`, `.drop_hover`). | **P0** |
| 3 | **`describe()` et `refuses()` ne sont jamais affichés.** `dnd/rules.js` produit la phrase ; aucune fenêtre ne la lit. | ADR-0026 §6 dit « rien ne s'est passé est la pire réponse » — et c'est exactement ce que voit le créateur aujourd'hui. Le refus prefab est littéralement inatteignable. | **P0** |
| 4 | **`PropertyType.RESOURCE` s'affiche en lecture seule.** `inspector/schema.js:81` → `FieldKind.READONLY`. La seule façon d'assigner `Sprite.source` est un drag ; aucun bouton, aucune vignette, aucun effacement. | Une propriété assignable uniquement par un geste sans affordance est une propriété invisible. Le code le documente lui-même comme un manque. | **P0** |
| 5 | **La recherche de nœuds est un `includes()` sur le label** (`ui/menu.js`, `#renderList`), et le menu s'ouvre avec **tous** les nœuds dépliés. | La demande explicite : catégories d'abord, frappe immédiate, résultats pertinents. Rien de tout ça n'existe. Les catégories, elles, existent déjà côté Core et sont exactement les bonnes. | **P0** |
| 6 | **Pas de transport Play / Pause / Stop.** Assumé et documenté (`editor.js`, commentaire « THERE IS NO TRANSPORT HERE »). Mais le `Runtime` existe déjà dans le Viewport, avec `running = false`. | Le mécanisme manquant est un instantané de scène — et `serializeScene()` / `deserializeScene()` existent. Le coût réel est bien plus faible que ce que le commentaire suppose. | **P1** |
| 7 | **Deux tokens CSS n'existent pas** : `--px-surface-sunken` (`inspector.js:328`, `project.js:131`) et `--px-radius-md` (`project.js:110`). Les déclarations sont invalides et tombent. | Le damier de transparence du Project n'a donc pas sa couleur de fond, et les tuiles n'ont pas de rayon. Deux lignes dans `ui/styles.js`. | **P1** |
| 8 | **Le reparentage par déplacement horizontal n'existe pas.** Legacy l'avait (`sorter.js`, `drag`, seuil de 20 px sur `clientX`) — c'est le geste WordPress. | C'est la seule idée UX du DnD legacy strictement supérieure à la v2, et elle se branche sur `dropTarget()` sans changer son contrat. | **P1** |
| 9 | **On ne peut pas réordonner les propriétés d'un `.px`.** `addProperty` accepte un `index`, mais aucune opération ne déplace une propriété existante (`core/graph/definition.js`). | Demandé explicitement. C'est un ajout Core (`MOVE_PROPERTY`, ou un `index` sur un `SET_PROPERTY`) et donc un amendement d'ADR-0027 §5. | **P1** |
| 10 | **`DragKind.OBJECT` et `DragKind.COMPONENT` sont morts.** `objectPayload` / `componentPayload` ne sont construits nulle part dans `src/`. | La table de règles décrit quatre sources ; deux n'ont pas d'émetteur. Soit on les branche, soit on le dit dans le code. | **P2** |

---

## B. Drag & Drop

### B.1 Ce que fait le legacy, mécanisme par mécanisme

#### Réordonnancement dans une liste — `legacy/editor/misc/sorter.js`

C'est le morceau le plus intéressant du legacy, et c'est bien le comportement « WordPress ».

| Étape | Ce qui se passe |
|---|---|
| `dragstart` | mémorise l'élément, **et `clientX` de départ** (`x_t0`), et si l'élément était déjà enfant |
| `dragenter` sur un autre `<li>` | **`insertBefore` immédiat** : le DOM se réorganise sous le pointeur, les voisins se décalent en temps réel |
| `dragover` | ajoute `.hidden` à la ligne survolée |
| `drag` (continu) | compare `clientX` au départ : **`> x_t0 + 20` → `wrap()`** (l'élément devient enfant du précédent), **`< x_t0` → `unwrap()`** |
| `dragend` | nettoie toutes les classes `.hidden` |

Le rendu de `.hidden` (`legacy/css/world.css`) : `color: transparent`, `border: 2px dashed var(--main)`, fond assombri, icônes masquées. Autrement dit **la ligne devient un trou pointillé** — c'est l'indicateur de position, et il est à la bonne place par construction puisque le DOM a déjà bougé.

L'indentation était rendue par `data-position` + une table de `padding-left` codée en dur de 1 à 5 (`world.css`). Au-delà de 5 niveaux, plus rien.

**Ce qui est bon dans ce mécanisme :**
- l'axe **horizontal** porte le niveau de profondeur. C'est le seul geste qui permet de dire « je veux insérer ici, mais à ce niveau-là » sans viser un tiers de ligne ;
- le trou pointillé est lisible même sur une liste dense.

**Ce qui est mauvais :**
- le DOM **est** le modèle : `wrap()` appelle `parentObj.addChild()` en plein `drag`, donc **le modèle est muté à chaque frame de survol**, pas au dépôt. Une annulation de drag laisse le modèle dans l'état du dernier survol ;
- la liste qui se réorganise sous le pointeur rend le geste imprécis dès que les hauteurs varient ;
- `drop` est commenté ; `dragEnd` ne fait que du nettoyage visuel ;
- le calcul `isBefore()` a un `return` mal indenté qui ne rend `false` que dans une branche.

#### Drop externe (Explorer / fichiers)

- **Project** (`legacy/editor/windows/project.js`) : `dragover` → `.drop_hover` sur le conteneur ; `drop` → `Loader.uploadFiles(e.dataTransfer.files)` ; **et** si `Sorter.draggedElement` est posé, fabrique un prefab depuis l'objet glissé.
- **Scene** (`legacy/editor/system/handler.js`) : `drop` sur le canvas construit un `Object` à la position souris. Le `switch` distingue les outils (`circle`, `rectangle`, `light`, `camera`, `particle`) du cas `default` = une ressource. **Le drop d'une image depuis Windows Explorer était un `TODO` jamais fait.**
- **Inspector** (`legacy/editor/windows/properties.js`) : `drop` → instancie `Loader.files[id].component` et l'ajoute à l'objet courant. Un fichier `.js` déposé sur l'Inspector = ajouter un Component. Pas de validation, pas de refus.
- Aucune fenêtre ne lit `dataTransfer.types` : le survol s'allume pour **n'importe quel** drag, y compris une sélection de texte.

#### Drop interne

| Source → cible | Legacy | v2 |
|---|---|---|
| Project → Scene | oui (`handler.js`, image/prefab) | oui (`rules.js`, `resource-to-scene`) |
| Project → Hierarchy | non | oui (`resource-to-hierarchy`) |
| Project → Inspector | oui, mais « déposer un `.js` = ajouter un Component » | oui, mais **seulement** vers une propriété `resource` |
| Hierarchy → Project | oui — création de prefab | **refusé avec raison** (ADR-0026 §7), et le refus est inatteignable faute d'émetteur |
| Ressource → propriété | non | oui (`resource-to-property`) |
| Propriété → ailleurs | le **label** d'une propriété était `draggable` et portait `input.className` dans le `dataTransfer` (`properties.js:491`) — aucune cible ne le lisait | non, et ADR-0027 §11 le refuse explicitement |
| Toolbar → Scene | oui, avec `setDragImage(obj.image)` — **le fantôme était le rendu réel de l'objet** | oui, `<px-toolbar>`, fantôme sur `document.body`, Pointer Events |

### B.2 Feedback visuel — les règles implicites du legacy

En rassemblant `dnd.css`, `world.css`, `resources.css`, `overlay.css`, il n'y a que **quatre** règles, et elles sont cohérentes :

1. **Zone qui accepte** → pseudo-élément `::before` en `position:absolute; inset:0; border: 2px dashed var(--main); pointer-events:none; transition: 200–300ms`. Toujours sur le **conteneur**, jamais sur l'élément.
2. **Ligne survolée pendant un tri** → `.hidden` : texte transparent, même bordure pointillée, fond assombri.
3. **Curseur** → `grab` au survol d'un déplaçable, `grabbing` pendant. Géré par `Dnd.setCursor()` qui écrit sur `document.body.style`.
4. **Fantôme** → `setDragImage` avec l'image réelle de l'objet quand elle existe.

Il n'y a **aucune** animation, aucun changement d'opacité, aucun indicateur d'insertion linéaire.

### B.3 Ce que fait déjà la v2 — et c'est mieux

- `dnd/payload.js` + `dnd/rules.js` + `dnd/files.js` : le vocabulaire, la sémantique, le transport, séparés et testés sous Node. Aucun `handleDropX()` par fenêtre. **C'est très supérieur au legacy et il n'y a rien à en retirer.**
- `windows/drop.js` : la géométrie tiers-haut / tiers-milieu / tiers-bas → `BEFORE` / `INTO` / `AFTER`, plus `insertionIndex()` qui corrige le décalage d'un déplacement vers le bas. Pur, testé.
- Les marques : `.row.dragging { opacity: 0.4 }` (la ligne reste en place — décision explicite et **correcte**), `.row.into { inset 0 0 0 1px accent }`, `.row.before/after::after { 2px accent }`, `.tree.append`.
- Project : mêmes trois états, mais **rail vertical** entre deux tuiles (une grille a des colonnes) — bonne dérivation.
- `2px dashed var(--px-accent)` pour un import externe, aux **quatre** endroits (`hierarchy.js:208`, `project.js:205`, `editor.js:129`, `inspector.js:316`). La règle du legacy a survécu et c'est bien.
- `carriesFiles()` lit `dataTransfer.types` : le survol ne s'allume plus pour un drag de texte. Corrige un défaut réel du legacy.

### B.4 Le système de feedback DnD v2 — proposition cohérente

Le problème n'est pas le manque de CSS, c'est qu'**il n'existe pas de notion de « session de drag »**. Un drag natif (`DataTransfer`) et un drag pointeur (`px-drag-start`) n'ont aucun état commun, et le second n'a aucun retour.

**Proposition : un `DragSession`, au shell, sans modèle.**

```
editor/dnd/session.js        (nouveau — vue seulement, aucun modèle)
    begin(payload, { ghost })   ouvre la session, monte le fantôme sur document.body
    move(clientX, clientY)      demande à chaque zone si elle accepte, marque UNE zone
    end()                       exécute, ou annule, et nettoie
```

Ce que la session porte, et rien de plus :

| Élément | Règle |
|---|---|
| **Fantôme** | monté sur `document.body`, `pointer-events:none`, `z-index: var(--px-z-drag)` (le token existe déjà, il n'a **aucun** usage aujourd'hui). Contenu : la vignette de la ressource si elle en a une, sinon son glyphe + son nom. Opacité 0.85, décalage +12/+12 du pointeur. |
| **Zone acceptante** | `2px dashed var(--px-accent)` en `outline`, `outline-offset: -4px`. **Une seule à la fois.** C'est la règle qui existe déjà — il faut juste l'appliquer au drag pointeur, pas seulement au drag natif. |
| **Zone refusante** | `2px dashed var(--px-danger)` — **et rien d'autre** : pas de secouement, pas de croix. Aujourd'hui une zone qui refuse est identique à une zone qui ignore. |
| **Point d'insertion** | inchangé : ligne 2px accent en liste, rail 2px vertical en grille, contour 1px pour `INTO`. Ne pas toucher. |
| **Phrase** | `canDrop().reason` affichée dans une bande discrète — même primitive que `.status` de `windows/graph.js` (surface `--px-surface-overlay`, bordure, `--px-text-2xs`), ancrée en bas de la fenêtre survolée. Elle apparaît après ~250 ms de survol, pour ne pas clignoter en traversant. |
| **Curseur** | via `dropEffect` pour le natif ; pour le pointeur, `cursor: grabbing` sur `document.body` **posé une fois au début et retiré une fois à la fin** — jamais dans un `mousemove`, ce qui est l'erreur du legacy. |

**Trois règles à tenir :**
- rien ne se déplace pendant un drag sauf le fantôme (contre le legacy) ;
- un seul marquage à la fois, et il est toujours celui de la règle qui va s'exécuter — c'est déjà l'argument d'ADR-0026 §8 ;
- une zone qui refuse le dit ; une zone qui ignore ne dit rien. Les deux ne sont pas le même état.

**Le reparentage horizontal (idée legacy à reprendre).** Sur `BEFORE`/`AFTER` uniquement — le tiers du milieu reste `INTO` : si `dx` depuis le point de départ dépasse un multiple de `--indent`, remonter ou descendre le **niveau** d'insertion parmi les ancêtres légaux de la ligne visée. `dropTarget()` rend déjà `{ parent, index }` : c'est le même contrat, avec un `parent` choisi plus haut dans la chaîne. Aucun changement Core.

**Pièges :**
- ne **jamais** muter le modèle pendant le survol (le péché du legacy) ; un drag annulé doit être un non-événement ;
- le fantôme sur `document.body` échappe aux Shadow Roots — c'est pour ça que `<px-toolbar>` fait déjà exactement ça, réutiliser sa mécanique ;
- `pointercancel` doit annuler la session, sinon un drag interrompu par le système laisse le fantôme à l'écran.

---

## C. Graph

### C.1 Navigation

| Geste | Legacy | v2 | Recommandation |
|---|---|---|---|
| Pan | bouton droit maintenu, **depuis le fond seulement** ; `contextmenu` bloqué | bouton **milieu ou droit**, depuis n'importe où | Ajouter **espace + glisser gauche** (standard de fait) et libérer le clic droit — voir ci-dessous |
| Zoom | molette, facteur 1.1, ancré au curseur, clamp `[0.25, 2]` | identique, clamp `[0.25, 2.5]`, `zoomAt()` pur | Rien à changer. Ajouter `Ctrl 0` = 100 %, `Ctrl 1` = cadrer tout (le bouton existe déjà) |
| Clic gauche | sélection / drag de nœud / tirage de fil | idem, avec seuil de 3 px | Rien |
| Clic droit | **rien** (réservé au pan) | pan | **Menu contextuel de création** — c'est l'usage attendu dans tout éditeur de nœuds |
| Molette maintenue | non | pan | Garder |
| Clavier | aucun | `Suppr` / `Retour arrière` sur le nœud sélectionné | Ajouter `F` (cadrer la sélection), `Échap` (désélectionner), `Ctrl A` quand la multi-sélection existera |

**Le conflit clic droit.** Aujourd'hui : clic droit = pan. C'est inhabituel, et ça brûle le bouton qui, partout ailleurs (Blueprints, Blender, n8n, Node-RED), ouvre le menu de création. Le double-clic ouvre déjà ce menu, mais c'est une découverte, pas une convention.

**Recommandation :** clic droit sur le **fond** = menu de création à la position du pointeur ; clic droit sur un **nœud** ou un **fil** = menu contextuel de cet élément (Supprimer, Dupliquer plus tard) ; pan = bouton du milieu **ou** espace + glisser. Le double-clic reste comme raccourci. C'est un déplacement, pas un ajout : `#openNodeMenu` accepte déjà un `event` et positionne le menu au pointeur.

### C.2 Grille — **le défaut à corriger en premier**

**Legacy** : deux `<pattern>` imbriqués (mineur 10 px dans majeur 50 px), et un `#grid-rect` dont `x/y/width/height` sont **recalculés à chaque pan et chaque zoom** (`updateGridBounds()`) pour couvrir le viewport plus une marge d'un viewport. C'est laborieux mais **ça marche** : la grille suit la vue et se met à l'échelle.

**v2** : un seul `<pattern>` de `GRID * 4` (32 unités), et un `<rect width="100%" height="100%">` placé **en frère** de `#content`. `#content` porte `translate(...) scale(...)` ; le fond, non.

**Conséquence mesurable : la grille est immobile et à l'échelle 1.** Les nœuds glissent dessus. Le pan n'a plus de repère, le zoom ment sur l'échelle.

**Correction recommandée** (aucune restructuration) :

```
// à chaque #draw(), sur le <pattern> :
patternTransform = `translate(${view.x} ${view.y}) scale(${view.zoom})`
```

Le `<rect>` reste en coordonnées écran, le motif suit la vue. C'est l'inverse de la méthode legacy et c'est une ligne au lieu de vingt.

**Pendant qu'on y est**, deux améliorations gratuites, toutes deux déjà validées ailleurs dans le produit :
- **deux niveaux** (mineur `GRID`, majeur `GRID * 4`), comme le legacy et comme `.vp-grid` du prototype (16 / 64) : c'est ce qui rend le zoom lisible ;
- **atténuer le mineur sous ~0.5 de zoom** — sinon la grille devient un aplat.

L'origine : `GRID = 8`, `snap()` arrondit les positions de nœud. Le motif doit être ancré sur **la même origine que `snap()`**, sinon un nœud accroché à la grille ne tombe pas sur une ligne. Avec `patternTransform` c'est automatique.

### C.3 Nœuds

| Aspect | Legacy | v2 | Verdict |
|---|---|---|---|
| Structure | `<div>` `contenteditable`, ports dérivés du **texte tapé** | `<g>` SVG, ports déclarés par le type | v2, sans appel |
| Taille | `min-width: 81px; height: 31px` fixe | `NODE_WIDTH = 168`, hauteur calculée depuis les ports | v2 |
| Titre | le texte tapé lui-même | `definition.label`, 11 px, gras | v2 |
| **Icône** | icône par catégorie dans la *toolbox*, jamais sur le nœud | **aucune** | **Manque.** Le menu montre une icône, le nœud n'en a pas : c'est une rupture. Ajouter un glyphe 12 px à gauche du titre |
| Ports | `4×8 px`, arrondis d'un côté, index numérique | triangle = flux, disque = donnée, cible invisible de 11 px | v2, et c'est une vraie idée |
| Valeurs | tapées dans le nœud | aucune — une entrée libre rend le défaut du port | Point ouvert d'ADR-0027. Voir §C.6 |
| Sélection | aucune | contour accent 2 px | v2 |
| Survol | `cursor: grab` | rien sur le nœud, `stroke` accent sur le port | **Manque léger** : un nœud survolé devrait s'éclaircir d'un cran |
| Erreur | connecteur `.error` en 3ᵉ port (rouge) | contour `--px-danger` + phrase du validateur en bas | v2 |
| Actif/inactif | non | non | Rien à faire — un nœud désactivé n'est pas décidé |

**Couleur par catégorie.** Le legacy teintait le fond de la *toolbox* : `event` rouge, `function` bleu, `structure` vert. Le prototype `design/` rejette explicitement les rails multicolores (README, décision D7). **Recommandation : une barre d'en-tête colorée par catégorie sur le nœud, et rien d'autre** — c'est le seul endroit où la famille aide vraiment (repérer les Events dans un graphe dense), et ça ne réintroduit pas de rail. Les quatre teintes de la direction B (`#45c8ff`, `#a98bff`, `#ffb648`, `#4ade80`) sont disponibles mais **non arrêtées en Modern Pixel** (README `design/`) : c'est une décision à prendre, pas à supposer.

### C.4 Connexions

- **Courbe** : legacy `max(50, distance × 0.4)`, v2 `max(40, distance × 0.4)`. ADR-0027 dit « repris tel quel » — l'écart 50/40 est bénin, mais **c'est un écart non documenté** entre l'ADR et le code. À aligner ou à noter.
- **Pendant la création** : v2 dessine un fil `pending` pointillé accent, orienté dans le sens final. Meilleur que le legacy.
- **Suppression** : v2 = **un clic sur le fil supprime**. C'est rapide et c'est annulable, mais c'est destructeur au premier clic. Legacy exigeait un mousedown sur le connecteur. **Recommandation : garder, mais ajouter le survol rouge (déjà là) et un `title`** (déjà là : « Click to disconnect »). Acceptable.
- **Sélection d'un fil** : n'existe pas. Pas nécessaire tant qu'il n'y a rien à faire d'un fil sélectionné.
- **Couleur** : v2 distingue flux (`--px-text-muted`) et donnée (`--px-text-dim`). **Recommandation : colorer un fil de donnée selon son `PropertyType`** — le typage existe déjà (`typesCompatible`), c'est de l'information gratuite. Une palette de 8 (autant que `PropertyType`) est trop ; une palette de 4 familles (nombre, texte, booléen, autre) suffit.

### C.5 Menu de création

Voir la section **C.7 / recherche** ci-dessous : c'est le même sujet.

### C.6 Points ouverts d'ADR-0027 qui pèsent sur l'UX

- **Valeur en ligne sur une entrée non connectée.** ADR-0027 le laisse ouvert, et la conséquence est déclarée « surprenante » dans l'ADR lui-même (`Set Property` non connecté écrit le défaut à chaque pas). C'est la première chose qu'un créateur va vouloir. **Recommandation :** un champ à même le nœud pour les entrées `number` / `int` / `boolean` / `string` — trois types, un contrôle chacun, tous déjà existants (`px-field`). Le format ne change pas : la valeur va dans `node.params`, comme le reste.
- **Multi-sélection, copier/coller** : d'accord pour reporter.

### C.7 Moteur de recherche des nodes

**État réel :**
- les catégories existent déjà, dans le Core, et sont **exactement** celles demandées : `['Events', 'Properties', 'Flow', 'Values', 'Math', 'Compare', 'Logic', 'Debug']` (`core/graph/nodes.js`, `NODE_CATEGORIES`). Rien à inventer ;
- `groupNodes()` produit les groupes non vides dans l'ordre ;
- `ui/menu.js` reçoit une **liste plate** de `{ heading }` et `{ id, label, icon }`, **toutes catégories dépliées** ;
- le filtre est `item.label.toLowerCase().includes(query)`. Pas de fuzzy, pas d'alias, pas de mots-clés, pas de score, pas de filtre par type de port ;
- la navigation clavier ↑ ↓ ↵ Échap existe et est correcte ;
- le legacy n'avait **aucune** recherche : une toolbox de 14 icônes fixes. Il n'y a rien à en tirer.

**Recommandation d'architecture (aucun code ici, une forme) :**

Un module pur, testable sous Node, à côté de `groupNodes()` :

```
searchNodes(registry, query, context) -> [{ definition, score, matched }]
```

**Ce que la table de nœuds gagne** — deux champs, dans la même table, ce qui est exactement l'argument d'ADR-0027 §3 (une table, pas deux) :

| Champ | Rôle | Exemple |
|---|---|---|
| `aliases: string[]` | les autres noms du même nœud | `'Add'` → `['+', 'plus', 'sum', 'addition']` |
| `keywords: string[]` | ce à quoi il sert, pas ce qu'il est | `'property.set'` → `['health', 'variable', 'assign', 'write']` |

`keywords` ne doit **pas** contenir les noms de propriétés du créateur — ils sont dynamiques. Voir « recherche contextuelle » plus bas.

**Le classement (ordre strict, premier critère qui départage) :**

1. égalité exacte du `label` ou d'un `alias` ;
2. préfixe du `label` (`add` → `Add`) ;
3. préfixe d'un mot du `label` (`prop` → `Set Property`) ;
4. préfixe d'un `alias` ;
5. sous-séquence du `label` (`stprp` → `Set Property`) — c'est le « fuzzy », et il suffit ;
6. correspondance dans `keywords` ou dans la `category` ;
7. à score égal : ordre des catégories, puis ordre d'enregistrement.

**Ne pas** utiliser une distance de Levenshtein : elle classe mal les identifiants courts et elle est lente à taper vite.

**Recherche contextuelle — le vrai gain.** Quand le menu est ouvert **en tirant un fil depuis un port** (geste qui n'existe pas encore : lâcher un fil dans le vide devrait ouvrir le menu), passer le port d'origine dans `context`. Alors :
- les nœuds ayant un port compatible (`typesCompatible`) remontent ;
- ceux qui n'en ont aucun descendent, ou disparaissent derrière un « Tout afficher ».

C'est ce qui transforme « chercher un nœud » en « continuer un câblage ». C'est le comportement qui manque le plus, et il ne demande aucun changement de format.

**La recherche par nom de propriété** (`health`) : quand le menu est ouvert dans le contexte d'un `.px`, injecter des entrées **synthétiques** `Get health` / `Set health` — un `property.get` avec `params.property` pré-rempli. Ça répond directement à l'exemple demandé, et c'est une ligne de génération d'items, pas un type de nœud de plus.

**État initial du menu.** Demandé : montrer les catégories, pas une liste énorme. Trois options, par ordre de préférence :

1. **Catégories repliées** (recommandé) : `Events`, `Properties`, `Flow`… avec un compteur. `→` ou clic déplie, `←` replie, ↑↓ traversent tout ce qui est visible. Dès qu'un caractère est tapé, tout se déplie et le classement s'applique. Coût : un état `expanded: Set` dans `ui/menu.js`, plus deux touches. **C'est la seule option qui répond littéralement à la demande.**
2. Garder tout déplié mais **limiter à 3 entrées par catégorie** avec un « +7 autres ». Moins bon : arbitraire.
3. Ne rien changer et compter sur la recherche. Rejeté : la découverte compte autant que la vitesse.

**Contrainte architecturale.** `ui/menu.js` est **partagé** par Add Object, Add Component, le `+` du Project et les nœuds (ADR-0026 §10 en fait un principe). Le repliement et le score doivent donc être **optionnels** (`{ collapsed: true, rank }`) et non imposés : un menu de 3 entrées ne doit pas gagner un pli. Ne pas dupliquer le composant.

---

## D. Project

### D.1 Ce que `design/` veut

Lu dans `design/prototype.js` (`ASSETS`, `project()`) et `prototype.css` (`.assets`, `.asset`, `.thumb`, `.empty`) :

- **grille auto-remplie**, tuiles de 62 px minimum, gap 5 px, padding 8 px ;
- **vignette carrée en damier** (8 px, deux tons) — présente même quand il n'y a pas d'image : le damier dit « c'est ici que va une image » ;
- **aperçu réel** pour une image, **glyphe** sinon ;
- nom centré, une ligne, ellipse ; il passe en `--px-text-strong` au survol et en sélection ;
- survol = fond `--s2` + bordure `--line-soft` ; sélection = fond accent-soft + bordure accent-line ;
- `cursor: grab` sur la tuile ;
- **onglets `Project` / `Prefabs`** dans l'en-tête du panneau, pas un fil d'Ariane ;
- champ de recherche **toujours visible** en haut, plus une loupe dans les outils qui lui donne le focus ;
- **état vide centré** quand la recherche ne rend rien, avec le terme cherché dans la phrase.

Le fil d'Ariane, dans le prototype, est dans le **titlebar** (`Medieval Arena / Arena 01`), pas dans le Project.

### D.2 Ce que fait la v2

Conforme, et souvent au-delà : grille 64 px, damier, `image-rendering: pixelated` (le prototype ne le fait pas, et c'est **mieux** pour du pixel art), fil d'Ariane par dossier, sélection, `F2`, second clic + pause de 400 ms pour renommer, double-clic pour ouvrir, pastille « non enregistré », réordonnancement par glisser, import de fichiers, menu `+` catégorisé, état vide.

### D.3 Écarts

| Écart | Constat | Recommandation |
|---|---|---|
| **`--px-surface-sunken` n'existe pas** (`project.js:131`) | la couleur de fond du damier tombe ; le damier est donc dessiné sur le fond de la tuile | Définir le token dans `ui/styles.js` — c'est manifestement une surface plus sombre que `--px-surface-input` ou son alias |
| **`--px-radius-md` n'existe pas** (`project.js:110`) | les tuiles n'ont pas de rayon | Utiliser `--px-radius`, ou définir `md` |
| Onglet **Prefabs** | dessiné par `design/`, absent de la v2 | **Correct de l'omettre.** ADR-0026 §7 reporte le prefab, et un onglet vide est le genre de mensonge que cet Editor refuse. À ne pas ajouter avant la décision prefab |
| **Vue liste** | n'existe **nulle part** : ni legacy, ni design, ni v2 | Ne pas l'inventer. Une grille est le bon défaut pour des assets. Si un projet dépasse ~200 ressources, ce sera un vrai besoin — pas avant |
| **Tri** | aucun | P2. Nom / type / date de modification, dans le menu `…` |
| Vignette d'une **`.scene`** | glyphe seulement | P2 — une scène pourrait rendre une miniature ; ça demande un rendu hors écran, donc plus tard |
| **Multi-sélection** | aucune | P2, cohérent avec le reste (le graphe non plus) |
| **Menu contextuel** (clic droit) | aucun, ni dans le Project ni ailleurs en v2 | **P1.** Le legacy en avait un (bancal). Le `+` et le `…` couvrent la création, mais « clic droit sur une tuile → Renommer / Supprimer / Ouvrir » est attendu. Réutiliser `openMenu` avec un ancre-point (le helper `pointAnchor` existe déjà dans `windows/graph.js`) |

---

## E. Inspector

### E.1 Structure — conforme au design, et bien au-delà

`design/prototype.css` `.sect-head` : poignée · caret · glyphe · libellé · outils. La v2 fait exactement ça, avec en plus :
- le libellé de section **est** typographiquement l'en-tête de groupe du dropdown — décision explicite, et c'est la bonne (elle donne au panneau une seule échelle de titres) ;
- la poignée est **toujours présente**, invisible quand la section n'est pas déplaçable (le prototype le fait aussi, `.grip.fixed`) : sans ça, les carets ne s'alignent pas d'une section à l'autre ;
- le geste de réordonnancement est pris sur la poignée seule (ADR-0026 §8), l'en-tête restant un bouton de repli.

Les champs : `px-field` + `px-number` implémentent **tout** ce que le prototype demande — préfixe `X`/`Y` comme poignée de scrub (4 px = 1 pas), steppers empilés de 11 px révélés au survol, **répétition automatique après 320 ms**, `↑`/`↓` = ±1, `Shift` ×10, police mono à chasse tabulaire. Le prototype disait « le comportement que `px-number` n'a pas » ; il l'a maintenant.

### E.2 Écarts et généralisations

| Sujet | Constat | Recommandation |
|---|---|---|
| **`PropertyType.RESOURCE` = `READONLY`** (`inspector/schema.js:81`) | une propriété `resource` s'affiche mais ne s'édite pas ; seul un drag l'assigne, et rien ne le dit | **P0. Un `<px-resource-field>`**, réutilisable partout : vignette 20 px + nom + `…` (ouvre un sélecteur filtré par `kind`/`mime` du schéma) + `×` (efface). Il est **la** cible de drop `PROPERTY`, avec le contour pointillé. `acceptsResource()` donne déjà le filtre — le sélecteur et le drop partagent donc la même règle |
| **`PropertyType.ARRAY` = `READONLY`** | affiche un compte | P2. Un contrôle de liste est un vrai chantier |
| **Aperçu** | l'Inspector d'une ressource montre un aperçu (`.preview`), l'Inspector d'un Object non | Généraliser : toute propriété `resource` assignée montre sa vignette. Même primitive que ci-dessus |
| **Cible de drop** | `outline: 2px dashed` sur `px-field.drop`, `.preview.drop`, `.none.drop`, `.add.drop` — quatre sélecteurs | Une seule classe `.drop-target` dans la feuille partagée, comme `.line` et `.twisty` l'ont été. C'est exactement le raisonnement déjà tenu dans `ui/styles.js` |
| **`--px-surface-sunken`** (`inspector.js:328`) | même bug que dans Project | même correction |
| **Réinitialiser une propriété** | absent | P2. `descriptor.default` est connu ; un `↺` au survol de la ligne suffit |
| **Tooltip** | les descripteurs portent `tooltip` (ADR-0027 les remplit soigneusement) | Vérifier qu'ils sont rendus. S'ils ne le sont pas, c'est de l'information écrite et jetée |

### E.3 Ce qui devrait être généralisé à tout l'Inspector

Trois primitives, et elles couvrent tout ce que le panneau fera dans les deux prochaines passes :

1. **`.drop-target`** — une classe, une règle, tous les champs.
2. **`<px-resource-field>`** — vignette + nom + choisir + effacer + drop. Sert : `Sprite.source`, un futur `AudioSource.clip`, un futur `Tilemap.atlas`, et le défaut d'une propriété `resource` déclarée dans un `.px`. Quatre usages avant même d'exister.
3. **`section()`** — poignée/caret/glyphe/libellé/outils est déjà écrit trois fois dans `windows/inspector.js` (Object, Component, Properties d'un `.px`). L'extraire quand le quatrième arrive, pas avant.

---

## F. Runtime — Play / Pause / Stop

### F.1 Ce qu'était le comportement historique

- **Legacy `play.js`** : `window.open('/build/', …)` — Play ouvre **une autre fenêtre**, dimensionnée à la caméra, centrée sur l'écran, et lui passe `{ host, port, online, objects }` par `app.data`. Le jeu ne tourne **jamais** dans l'éditeur.
- **Legacy `pause.js`** : `Renderer.main.pause = !pause`, événement `pause`, classe `.active` sur le bouton, `title` qui bascule Pause/Resume. **La pause est celle du renderer, pas de la simulation.**
- **Stop** : **n'existe pas** dans le legacy. Fermer la fenêtre est l'arrêt.
- **`design/`** : trois boutons dans un groupe `.transport` au centre du titlebar — Play en `--ok` (vert), Pause et Stop **désactivés** tant que rien ne tourne (`disabled`, opacité 0.32). La direction C en fait un gros disque vert de 34 px, et le README `design/` dit que cet emprunt est **retenu** (« le gros bouton Play vert »).

### F.2 Ce que dit le code v2

- `editor.js` (~ligne 420) : « THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE… Play needs a scene snapshot restored on stop, which does not exist yet ». Décision assumée, et la règle « pas de bouton qui ment » est bonne.
- **Mais le mécanisme est plus près qu'annoncé :**
  - `viewport.js` construit déjà un `Runtime` avec `running = false` (« Edit mode: the scene is drawn every frame but never stepped ») ;
  - `Runtime.running` est un setter public ; `advance()` ne fait rien quand il est faux ;
  - `Input` existe (`runtime/input/input.js`) et est **passé**, jamais global ;
  - `serializeScene()` / `deserializeScene()` existent (`core/serialize.js`) ;
  - `interpretGraph()` et `behaviors` sont branchés (ADR-0027 §6, testé dans `editor/project/graph-runtime.test.js`).

### F.3 Recommandation

**Ne pas concevoir un runtime.** Assembler ce qui est là :

| Bouton | Ce qu'il fait | Ce qu'il faut d'abord |
|---|---|---|
| **Play** | `snapshot = serializeScene(scene)` ; brancher l'`Input` du viewport ; `runtime.running = true` | rien de neuf |
| **Pause** | `runtime.running = false`, le rendu continue (c'est déjà le contrat documenté de `running`) | rien |
| **Stop** | `runtime.running = false` ; restaurer la scène depuis `snapshot` ; vider l'historique **de la session de jeu** | la restauration |

**Les questions à trancher avant d'écrire une ligne**, et elles sont pour l'agent principal :

1. **Où le snapshot vit-il ?** Pas dans le `Workspace` (ce n'est pas du projet), pas dans la `Scene` (elle est la vérité). Probablement dans le contrôleur du transport, en mémoire, jeté au Stop.
2. **Que devient l'undo pendant le Play ?** La simulation écrit à travers le Proxy réactif, donc **elle produit des Changes**. Si ces Changes entrent dans l'`Operations`, le Play remplit la pile d'undo de bruit. ADR-0003 dit qu'un Component n'appelle jamais `setProperty()` — donc une écriture de simulation n'est pas une intention. **Il faut vérifier que la pipeline le respecte réellement**, et c'est le seul vrai risque de cette fonctionnalité.
3. **La sélection et l'Inspector pendant le Play ?** Proposition : rester vivants et en lecture seule, avec le panneau grisé. Éditer une valeur pendant que la simulation l'écrit est un conflit sans gagnant.
4. **Où tourne le jeu ?** Le legacy ouvrait une fenêtre ; `design/` met le transport dans le titlebar, donc **dans le viewport**. Suivre `design/` : ouvrir une fenêtre casse le multijoueur local et rend la boucle édition→test coûteuse.
5. **Le focus clavier.** Pendant le Play, les touches vont au jeu, pas aux raccourcis de l'éditeur — sauf `Échap` (= Stop) et `F5`/`Ctrl P` (= Play/Pause). À dire explicitement, sinon `Suppr` supprimera un objet pendant une partie.

**Retour visuel demandé** : un liseré accent autour du viewport pendant le Play, et l'onglet de scène marqué. C'est la convention Unity/Godot et elle évite l'erreur classique « j'ai édité pendant le Play et tout a disparu au Stop ».

---

## G. Docking / Tabs / Timeline

### G.1 Les trois organisations

- **Legacy** : deux zones fixes. Le Graph est un `tab-content` **dans la zone centrale**, à la place du canvas (`#overlay` vs `#wrapper`, `tabs.js`) ; le Project et la Timeline partagent la zone du bas (`#resources`). Le Graph a en plus une `#toolbox` de 200 px à sa droite.
- **`design/`** : L4 retenu. Timeline **conditionnelle**, en bande couvrant colonne gauche + centre, s'arrêtant avant l'Inspector qui garde une colonne ininterrompue. Le prototype **ne dessine pas de fenêtre Graph du tout**.
- **v2** : L4 implémenté. Le Graph **remplace** le viewport dans la scène (`.stage`), sélectionné par une bande d'onglets qui n'apparaît qu'à partir de deux éditeurs ouverts (`editor.js`, `stageTabs`). La Timeline est un `<px-timeline>` sous la scène, masqué par défaut, avec un état vide honnête.

### G.2 « Faut-il mettre le Graph dans la zone basse, avec la Timeline, ouverte par défaut ? »

**Recommandation : non.** Argumentée :

**Contre.**
1. **Un graphe a besoin de surface.** Un nœud fait 168 × ~90 px ; une bande de 192 px de haut affiche **deux** nœuds l'un sous l'autre. La bande est dimensionnée pour des pistes de 24 px, pas pour une toile 2D.
2. **La Timeline anime la scène ; le Graph édite une *autre* ressource.** La bande basse est, dans L4, ce qui est **subordonné à la scène affichée** — c'est même l'argument de D8 (l'Inspector garde sa colonne parce qu'il commente ce qui est au centre). Un `.px` n'est pas subordonné à la scène : c'est un document ouvert, avec sa propre pile d'undo (ADR-0027 §10). Il appartient à la zone des documents, c'est-à-dire la scène.
3. **Le mécanisme existe déjà et est correct.** `Workspace` + `stageTabs` = un modèle de documents ouverts. Le déplacer vers le bas demanderait soit deux systèmes d'onglets, soit de mettre la Timeline dans les onglets — et une Timeline n'est pas un document.
4. **« Ouverte par défaut »** contredit frontalement D8 : « quand rien n'est animé, la bande n'est pas là du tout ». Ouvrir par défaut une bande vide est du chrome sans contenu.

**Pour (et ce que ça révèle de vrai).**
Le besoin derrière la question est réel : **on ne peut pas voir la scène et le graphe en même temps.** Câbler un `.px` en regardant le personnage bouger est un usage évident. Mais la réponse à ce besoin n'est pas « mettre le graphe en bas », c'est **une vue partagée**.

**Recommandation concrète, par ordre de coût :**

1. **P1 — Rendre l'onglet Graph découvrable.** Aujourd'hui la bande d'onglets n'apparaît qu'à deux éditeurs ouverts, donc ouvrir son premier `.px` fait **disparaître la scène sans onglet visible pour revenir**. C'est le vrai problème d'ergonomie de la zone centrale, et il est indépendant de la question posée. → la scène ouverte doit **toujours** compter comme un onglet, ou la bande doit s'afficher dès qu'un `.px` est ouvert.
2. **P1 — Un partage horizontal de la scène** : `Viewport | Graph`, seam déplaçable, activé par un bouton « côte à côte » sur l'onglet. `<px-splitter>` existe, `.stage` est déjà un flex.
3. **P2 — Détachement de fenêtre.** Déjà listé comme non fait dans `EDITOR.md`. Ne pas l'aborder maintenant.

**Ce qu'il faut faire de la Timeline :** rien, jusqu'à ce que le système d'animation existe. L'état vide actuel est correct et honnête.

---

## H. Design system

### H.1 Constat central

**Un design system cohérent existe déjà**, dans `src/editor/ui/styles.js`, et il est meilleur que ce que ce rapport pourrait proposer : tokens par **rôle** et non par position dans une rampe, contrastes mesurés et annotés, densité qui bascule sous `pointer: coarse`, deux feuilles (document + shadow) pour une raison énoncée, primitives partagées (`.ghost`, `.line`, `.twisty`, `.searchbar`, `.empty-state`, scrollbars).

**Il ne faut donc pas proposer un design system. Il faut fermer ses trous.**

### H.2 Le système, résumé (pour référence)

| Famille | Tokens | Note |
|---|---|---|
| Surfaces | `background` `surface` `surface-raised` `surface-overlay` `surface-input`, + `surface-hover` `surface-active` | rampe de 5 + 2 états. Pas d'ombre : la profondeur est une marche de surface, sauf le menu et le tiroir |
| Bordures | `border` (quasi noir, structure) · `border-subtle` (interne) | **deux, et il n'y en a pas de troisième** |
| Texte | `text-strong` `text` `text-muted` `text-dim` | contrastes annotés, le plus faible à 4,6:1 |
| Accent | `accent` `accent-hover` `accent-active` `accent-muted` `accent-border` | **un seul accent**, corail `#ff7a45` |
| Statut | `success` (Play) `danger` (destructif) `warning` (runtime) | sens, jamais décoration |
| Type | `font-sans` + `font-mono` (valeurs seulement, `tabular-nums`) ; `text-2xs` 10 → `text-md` 13 | **jamais de police bitmap** : raison donnée (DPI fractionnaires) |
| Espace | `space-0` 2 → `space-8` 32, multiples de 4 | `space-0` est le demi-pas documenté |
| Densité | `row` 26 · `control` 22 · `hit` 28 · `grip` 8 | le visuel et la cible sont **séparés** — c'est ce qui rend compact et tactile à la fois |
| Rayon | `radius-sm` 3 · `radius` 4 · `radius-lg` 6 | « 4 px se lit comme du soin, 8 px comme une web app » |
| Mouvement | `duration-fast` 90 · `duration` 140 · `ease` | **sur la couleur seulement** ; rien ne se déplace |
| Couches | `z-content` `z-splitter` `z-drawer` `z-overlay` `z-drag` | nommées |

### H.3 Trous à combler

| # | Trou | Correction |
|---|---|---|
| 1 | `--px-surface-sunken` utilisé, non défini (2 sites) | Le définir. C'est le fond du damier : une valeur sous `--px-background`, autour de `#111216` |
| 2 | `--px-radius-md` utilisé, non défini (1 site) | Remplacer par `--px-radius`, ou définir |
| 3 | `--px-z-drag` défini, **jamais utilisé** | Il servira au fantôme de la session de drag (§B.4). Ne pas le retirer |
| 4 | Pas de token pour **l'état drag-over** | `--px-drop-line` et `--px-drop-outline` ne sont pas nécessaires : `--px-accent` suffit. Ce qui manque est **la classe partagée** `.drop-target`, pas un token |
| 5 | Pas de token de **famille** (Hierarchy/Inspector/Project/Timeline) | `design/README.md` le dit lui-même : les teintes n'existent qu'en direction B, rejetée. **Décision à prendre, pas à supposer.** Recommandation : ne pas introduire de famille pour les fenêtres, mais oui pour les **catégories de nœuds** (§C.3), où l'information est réellement utile |
| 6 | Pas de token pour les **types de données** (ports, fils) | À introduire **si et seulement si** on colore les fils par type (§C.4). 4 valeurs max |
| 7 | `focus` | `outline: 2px solid var(--px-accent); outline-offset: -1px` sur `:focus-visible`, partout, déjà fait. Rien à faire |
| 8 | `disabled` | `opacity: 0.35` sur `.ghost[disabled]`. Cohérent avec le prototype (0.32). Rien à faire |
| 9 | Icônes | 30 glyphes, deux tailles (16, 20), épaisseur **constante à l'écran** (calculée depuis la taille). Excellent. Manquants : voir §H.4 |

### H.4 Icônes — inventaire et décisions

**Ce que la v2 a (30)** : object, rectangle, circle, camera, sprite, particles, tilemap, component, graph, scene, image, hierarchy, inspector, folder, timeline, chevron, plus, more, share, sound, minus, grip, trash, close, search, focus, grid, eye, eye-off, lock, unlock.

**Ce que `design/icons.js` ajoute (17, dessinés aux mêmes règles, donc copiables tels quels)** : play, pause, stop, step, light, audio, script, graph *(autre dessin)*, physics, layers, drag *(= grip)*, check, ruler, magnet, frame, more, share.

**À reprendre, par besoin réel :**

| Glyphe | Pour quoi | Priorité |
|---|---|---|
| `play` `pause` `stop` | le transport (§F) | P1 |
| `check` | validation, états | P2 |
| `magnet` `ruler` `frame` | outils du viewport (snap, règles, cadrer) | P2 |
| `light` `physics` `script` | types de Components à venir | à l'arrivée du Component |
| `step` `layers` | pas d'usage identifié | **ne pas ajouter** |

**Icônes communes vs spécifiques :**
- **communes** (une seule définition, jamais dupliquée) : chevron, plus, minus, close, search, trash, more, grip, eye/eye-off, lock/unlock, check, focus, grid ;
- **spécifiques** : les types d'Object (object, rectangle, circle, sprite, camera, particles, tilemap), les types de ressource (folder, scene, component, image, sound), les fenêtres (hierarchy, inspector, timeline) ;
- **règle déjà en place et à défendre** : `hierarchy` (la fenêtre) et `scene` (la ressource) sont **deux glyphes différents** — c'est un constat d'ADR-0025 et il est juste.

**Le cas `walk.px` — un désaccord explicite entre `design/` et ADR-0026.**

`design/prototype.js` (`ASSETS`) donne à `walk.px` le glyphe **`graph`** (des nœuds et des fils). En v2, `iconForResource()` mappe `ResourceKind.COMPONENT` → `'component'` (l'hexagone), et `ResourceKind.GRAPH` → `'graph'` — mais **plus rien ne crée de ressource `GRAPH`** (ADR-0026 §1).

Donc aujourd'hui un `.px` dans le Project montre **l'hexagone**, pas le graphe. Le prototype montre l'inverse.

**Recommandation : garder l'hexagone, et considérer que `design/` a tort ici** — il précède l'unification d'ADR-0026. L'argument : ADR-0026 dit qu'un créateur qui fabrique un Component obtient **une** chose appelée Component. L'icône doit dire « Component », pas « graphe » — le graphe est *ce qu'il y a dedans*, et il se découvre en l'ouvrant.

**Deux conséquences à traiter :**
- l'entrée `graph` de `RESOURCE_ICONS` est morte tant que rien ne crée ce `kind` — la laisser est sans danger, mais elle mérite un commentaire, sinon quelqu'un « corrigera » le mapping du `.px` vers elle ;
- le glyphe `graph` **doit** rester : il sert à l'onglet de scène du `.px` ouvert, à l'état vide de la toile, et à l'entrée « Behavior Graph » du menu Add Component. C'est l'icône du **canevas**, pas de la ressource. Cette distinction est exactement la même que hierarchy/scene, et elle est saine.

**À ne pas copier du legacy :** tout. Font Awesome (5 graisses, 20 fichiers webfont) et Material Icons par ligature (`<i class="material-icons">description</i>`). ADR-0006 et `ui/icons.js` ont déjà tranché : une police d'icônes traverse mal une Shadow Root et coûte des requêtes. `legacy/webfonts/` ne doit jamais être touché.

---

## I. `LEGACY ONLY` — ce qui ne doit pas être recopié

Format demandé : comportement → pourquoi il est intéressant → pourquoi l'implémentation est à jeter → architecture v2.

### I.1 `Sorter` — le tri par mutation du DOM

- **Intéressant :** l'axe horizontal qui donne le niveau de profondeur ; le trou pointillé.
- **À jeter :** `dragEnter` fait `insertBefore` (le DOM devient le modèle), `drag` appelle `Scene.main.objects[...].addChild()` **pendant le survol** (le modèle est muté avant le dépôt), `data-position` porte la profondeur dans le DOM avec un `padding-left` codé en dur de 1 à 5 niveaux, `drop` est commenté.
- **v2 :** `windows/drop.js` (géométrie pure) + `REPARENT { parent, index }` (ADR-0019) au **dépôt seulement**. Ajouter l'axe horizontal comme **lecture**, jamais comme mutation.

### I.2 `Node` — le nœud `contenteditable` et les ports par index

- **Intéressant :** taper `move $x $y` et voir les ports apparaître est une idée séduisante.
- **À jeter :** le type d'un nœud n'est pas une chaîne tapée ; `this.inputs[i]` / `this.outputs[i + 1]` adressent les ports par **index** — un type qui gagne un port recâble tous les graphes existants ; les ports sont recréés à chaque frappe ; la position du caret est reconstruite à la main ; `connector.other` est une référence DOM ↔ DOM qui n'existe qu'à l'écran.
- **v2 :** ADR-0027 §2 et §3 — identité stable pour nœud, port et connexion ; ports déclarés par le type ; un seul SVG.

### I.3 `Graph.main` statique et `updateScript()` qui `console.log`

- **Intéressant :** rien.
- **À jeter :** aucun modèle, aucune sérialisation, aucune exécution. Fermer l'onglet perdait le travail.
- **v2 :** `ComponentDefinition` + `Operations` + `validateGraph()` + `interpretGraph()`.

### I.4 `editor/graph/compiler.js` — le lexer d'un langage textuel

- **À jeter :** déjà abandonné par ADR-0009. `.px` est **interprété**, pas compilé, et sans `eval`.

### I.5 `Properties` — l'Inspector par réflexion sur `typeof` et liaison par classe CSS

- **Intéressant :** l'idée d'un Inspector piloté par les données, pas par des `if` par type.
- **À jeter :** le type d'un contrôle est deviné par `typeof value` (et une couleur est détectée par `value[0] === '#'`) ; la liaison champ ↔ modèle passe par `document.getElementsByClassName(obj.id + '-' + prop)` ; une liste noire codée en dur (`case 'id': break; case 'uid': break; …`) décide ce qui s'affiche ; les propriétés sont préfixées `_` et `$` pour signaler la réactivité.
- **v2 :** `componentSchema()` (ADR-0007), `PropertyType` (ADR-0023), `px-field` lié à sa propre propriété, aucune classe CSS porteuse d'identité.

### I.6 `Dnd` — l'état de drag statique et global

- **Intéressant :** le curseur qui suit l'état (grab / grabbing / resize directionnel).
- **À jeter :** `Dnd.hovering`, `Dnd.drag`, `Dnd.resize` sont des statiques lues **par le renderer lui-même** — c'est la violation d'architecture que `tools/layers/run.js` rapporte encore. `setCursor()` écrit sur `document.body.style` à chaque frame. `applyDropEvents()` **clone le nœud DOM** et supprime l'original : le modèle n'est jamais consulté.
- **v2 :** `dnd/payload.js` (une valeur), `dnd/rules.js` (la sémantique), curseur par CSS et par `dropEffect`.

### I.7 Le renommage par `contenteditable` partout

- **Intéressant :** l'édition en place, sans boîte de dialogue.
- **À jeter :** `div[contenteditable]` sur chaque ligne, `input` → `scene.updateName(this)`, `keypress` → `System.validate`, `focusout` → `window.getSelection().removeAllRanges()`. Aucune annulation, aucun `batch`, le DOM porte le texte.
- **v2 :** ADR-0026 §3 — second clic + pause, ou `F2`, `Entrée` valide, `Échap` annule, un `batch` frappé au focus donc **une** entrée d'undo.

### I.8 `filter.js` — le filtre par `style.display = 'none'`

- **À jeter :** cache une ligne à la fois, donc en arbre il cache un enfant qui correspond avec son parent qui ne correspond pas.
- **v2 :** `windows/search.js`, `visibleObjects()` — **une correspondance emmène ses ancêtres**, pur, testé.

### I.9 `select.js` — le `<select>` réimplémenté en `<div>`

- **À jeter :** copié-collé de W3Schools, variables globales `var x, i, j`, `arrNo.indexOf(i)` utilisé comme booléen (bug : l'index 0 est faux).
- **v2 :** `<select>` natif, `appearance: none` + flèche en dégradé (`ui/styles.js`).

### I.10 La création de prefab au drop Hierarchy → Project

- **Intéressant :** le geste est le bon.
- **À jeter :** `prefab.copy(instance)` + copie de composants par `new window[Name]()` — instanciation par nom global.
- **v2 :** **refusé avec sa raison** (ADR-0026 §7), en attendant la décision prefab. Correct.

### I.11 `play.js` — Play ouvre une autre fenêtre

- **Intéressant :** un jeu dimensionné à la caméra.
- **À jeter :** `window.open` + `app.data = { objects: scene.objects }` — passage d'objets vivants entre contextes, aucune sérialisation, bloqué par les bloqueurs de popups.
- **v2 :** voir §F — le `Runtime` du viewport, avec instantané.

---

## J. Priorités

### P0 — ergonomie générale, à faire avant tout le reste

1. **Grille du Graph solidaire de la vue** (`patternTransform`), plus deux niveaux mineur/majeur.
2. **Session de drag au shell** : fantôme, zone marquée, curseur, annulation propre (§B.4).
3. **Afficher `describe()` / `refuses()`** — la phrase du refus et celle de l'action.
4. **`<px-resource-field>`** : `PropertyType.RESOURCE` devient éditable (sélecteur + vignette + effacer + drop).
5. **Recherche de nœuds** : catégories repliées à l'ouverture, score, `aliases` + `keywords` dans la table de nœuds.
6. **La bande d'onglets doit apparaître dès qu'un `.px` est ouvert** — sinon ouvrir un `.px` fait disparaître la scène sans retour visible.

### P1 — améliorations significatives

7. Transport **Play / Pause / Stop** sur le `Runtime` existant, avec instantané (§F).
8. Les **deux tokens manquants** (`--px-surface-sunken`, `--px-radius-md`).
9. **Clic droit sur le fond de la toile = menu de création** ; pan sur milieu + espace-glisser.
10. **Reparentage par déplacement horizontal** dans la Hierarchy (l'idée du legacy).
11. **Menu contextuel** dans Project et Hierarchy (`openMenu` + `pointAnchor`).
12. **Icône sur le nœud** + **barre d'en-tête colorée par catégorie**.
13. **Vue partagée `Viewport | Graph`** (`<px-splitter>` dans `.stage`).
14. **Réordonner les propriétés d'un `.px`** — demande une opération Core, donc un amendement d'ADR-0027 §5.
15. **Valeur en ligne** sur une entrée de nœud non connectée (`number`/`int`/`boolean`/`string`).

### P2 — polish

16. Classe partagée `.drop-target`, en remplacement des quatre sélecteurs de l'Inspector.
17. Survol d'un nœud (un cran d'éclaircissement).
18. Couleur de fil par famille de type (4 familles maximum).
19. Recherche de nœuds **contextuelle** : lâcher un fil dans le vide ouvre le menu filtré par compatibilité de port.
20. Tri du Project (nom / type / date), dans le menu `…`.
21. Réinitialiser une propriété à son défaut.
22. Icônes `check`, `magnet`, `ruler`, `frame`.
23. Vignette de scène, contrôle de liste pour `PropertyType.ARRAY`, multi-sélection.

**Explicitement non planifié :** prefab (décision ouverte), détachement de fenêtre, vue liste du Project, onglet Prefabs, minimap, `Ctrl K`.

---

## K. Instructions à transmettre à l'agent d'implémentation

Concrètes, ordonnées, chacune vérifiable.

### K.1 — Grille du Graph (1 fichier, ~10 lignes)

Dans `src/editor/windows/graph.js` :
- garder la `<rect>` de fond hors du `<g>` transformé, mais poser sur le `<pattern>` (à chaque `#draw()`) :
  `patternTransform = translate(view.x, view.y) scale(view.zoom)` ;
- ajouter un second `<pattern>` mineur de `GRID` imbriqué dans le majeur de `GRID * 4`, comme le faisait `legacy/index.html` (`#smallGrid` dans `#grid`) ;
- atténuer le mineur sous `zoom < 0.5`.
- **Vérification :** panner de 500 px doit déplacer la grille de 500 px ; zoomer à 200 % doit doubler l'espacement des lignes.

### K.2 — Session de drag (1 module neuf, 4 fenêtres à brancher)

Créer `src/editor/dnd/session.js` — **vue seulement, aucun modèle, aucune règle**. Il ne fait qu'orchestrer ce qui existe :
- `begin(payload, ghost)` : monte le fantôme sur `document.body`, `z-index: var(--px-z-drag)` (le token attend), `cursor: grabbing` sur `document.body` ;
- `move(x, y)` : demande à chaque fenêtre `dropZoneAt(payload, x, y)` (l'Inspector expose déjà cette forme), appelle `canDrop()`, marque **une seule** zone (`.drop-target` acceptée, ou refusée en `--px-danger`), affiche la phrase après 250 ms ;
- `end()` / `cancel()` : `performDrop()` ou rien, puis nettoyage intégral. **`pointercancel` doit passer par `cancel()`.**

Brancher : `windows/project.js` émet déjà `px-drag-start` / `px-drag-end` — remplacer le `carried` de `editor.js:548-569` par la session. Ajouter l'émission dans `windows/hierarchy.js` (avec `objectPayload`) pour que le refus prefab devienne atteignable.

**Interdits :** ne pas muter le modèle pendant le survol ; ne rien déplacer sauf le fantôme ; ne pas écrire le curseur dans un handler de `move`.

### K.3 — Champ ressource

Créer `src/editor/ui/resource-field.js` : vignette 20 px (damier + image ou glyphe) · nom · `…` · `×`. Le `…` ouvre `openMenu` avec les ressources filtrées par `acceptsResource()` — **la même fonction que la règle de drop**, pas une seconde. Puis `inspector/schema.js` : `[PropertyType.RESOURCE]: FieldKind.RESOURCE`. Ne pas laisser `READONLY` avec un contournement.

### K.4 — Recherche de nœuds

- Ajouter `aliases?: string[]` et `keywords?: string[]` au `@typedef NodeDefinition` de `core/graph/nodes.js`, et les remplir dans `core/graph/standard.js`. C'est **la même table** — l'argument d'ADR-0027 §3 s'applique tel quel, aucun ADR à amender.
- Créer `searchNodes(registry, query, context)`, **pur**, testé sous Node, avec le classement en 6 niveaux de §C.7. Pas de Levenshtein.
- `ui/menu.js` : ajouter des options `{ collapsed, rank }`. **Ne pas dupliquer le composant** — il est partagé par quatre appelants (ADR-0026 §10). Un menu sans `collapsed` doit se comporter exactement comme aujourd'hui.
- Ajouter `←` / `→` pour replier/déplier une catégorie ; une frappe déplie tout.

### K.5 — Transport

Avant d'écrire quoi que ce soit, **répondre à la question 2 de §F.3** : une écriture de simulation entre-t-elle dans la pile d'undo ? Si oui, aucun bouton Play ne doit être posé avant que ce soit corrigé. Ensuite : instantané par `serializeScene()`, `runtime.running`, restauration au Stop, liseré accent autour du viewport pendant l'exécution, `Échap` = Stop, les autres raccourcis d'éditeur suspendus.

### K.6 — Onglets

Dans `stageTabs` (`editor.js`), la condition `element.hidden = open.length < 2` fait disparaître la scène sans onglet de retour quand un `.px` s'ouvre. Compter la scène comme un onglet, ou afficher la bande dès qu'un `.px` est ouvert. **C'est un P0 déguisé en détail.**

### K.7 — Tokens

`ui/styles.js` : définir `--px-surface-sunken` (autour de `#111216`, sous `--px-background`) ; remplacer `--px-radius-md` par `--px-radius` aux appels, ou le définir. Trois sites : `inspector.js:328`, `project.js:110`, `project.js:131`.

### K.8 — Ce qu'il ne faut PAS faire

- **Ne pas** réintroduire les rails ou les tampons multicolores de la direction B : `design/README.md` les a rejetés, seule la couleur d'icône d'en-tête était retenue, et même celle-là n'a pas de valeur arrêtée en Modern Pixel.
- **Ne pas** ajouter d'onglet Prefabs, de vue liste, de minimap, de `Ctrl K` — chacun est soit reporté par un ADR, soit dessiné par un prototype qui se déclare lui-même non normatif sur la densité et les fonctionnalités.
- **Ne pas** faire réagir la liste sous le pointeur pendant un drag. Le commentaire de `hierarchy.js` (« a list that reflows under the pointer is a list you cannot aim at ») est juste ; le legacy prouve le contraire par l'exemple.
- **Ne pas** suivre `design/` sur l'icône de `walk.px` : le prototype précède l'unification `.px` d'ADR-0026 (§H.4).
- **Ne pas** mettre le Graph dans la bande basse (§G.2). Le besoin réel est la **vue partagée**.
- **Ne pas** toucher à `legacy/`. Il est une source de lecture, pas de code.

### K.9 — Trois questions qui ne sont pas les miennes à trancher

1. **Couleur de famille pour les catégories de nœuds** — oui/non, et quelles teintes. `design/README.md` laisse la question ouverte pour Modern Pixel.
2. **Clic droit = pan ou = menu de création** dans la toile. J'argumente pour le menu ; c'est un changement de convention et ça se décide, pas se déduit.
3. **`MOVE_PROPERTY`** pour réordonner les propriétés d'un `.px` : c'est une opération Core, donc un amendement d'ADR-0027 §5 — et cet ADR argumente explicitement contre les opérations dédiées quand `SET_PROPERTY` suffit. Ici il ne suffit pas (un rang n'est pas un champ), ce qui est exactement l'argument qui a justifié `MOVE_RESOURCE` dans ADR-0026 §5. Le parallèle est fort, la décision reste à prendre.

---

## Annexe — inventaire des fichiers lus

**`design/`** : `README.md`, `index.html`, `prototype.css` (1483 l.), `prototype.js` (1124 l.), `icons.js` (151 l.) — intégralement.

**`legacy/`** : `editor/system/dnd.js`, `editor/system/handler.js`, `editor/misc/sorter.js`, `editor/misc/{grid,filter,tabs,select,shortcut,play,pause,context-menu}.js`, `editor/windows/{hierarchy,project,properties,toolbar}.js`, `editor/graph/{graph,node,component}.js`, `index.html`, `css/{variables,world,resources,overlay,code,dnd,context-menu}.css`.

**`src/`** : `editor/ui/{styles,icons,menu}.js`, `editor/dnd/{payload,rules,files}.js`, `editor/windows/{drop,graph,hierarchy,project,inspector,timeline,toolbar,search}.js`, `editor/inspector/{schema,definition,node}.js`, `editor/graph/view.js`, `editor/{editor,commands}.js`, `editor/project/commands.js`, `editor/viewport/viewport.js`, `core/graph/{nodes,standard,definition}.js`, `core/serialize.js`, `project/resource.js`, `runtime/runtime.js`, `runtime/rendering/components/sprite.js`.

**`docs/`** : `ARCHITECTURE.md`, `architecture/EDITOR.md`, ADR-0026, ADR-0027 (intégralement), index des ADR-0001 → 0025.
