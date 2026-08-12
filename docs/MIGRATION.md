# Migration v2

> **Statut : PLAN ACTIF.** Décisions validées le 2026-08-12 ; aucune étape encore engagée. Ce document sert de plan et de
> registre de risques.

---

## 1. Ordre de travail

```
Comprendre → Cartographier → Documenter → Comparer → Proposer → FAIRE VALIDER
    → Implémenter → Tester → Comparer avec Legacy → Documenter
```

**Les décisions ont été validées le 2026-08-12.** Phase 0 est close :
`migration/LEGACY_ANALYSIS.md` décrit le fonctionnement réel, `ARCHITECTURE.md` fixe la
cible et §10 enregistre les décisions.

Une seule question reste ouverte (Q7, mode d'exécution de `.px`) et elle **n'est pas
bloquante** : elle n'intervient qu'à l'étape 9.

Nous sommes donc à **« Implémenter »**, dont la première étape est l'outillage (§5).

---

## 2. Analyse comparative par système

Format : **Legacy → Limites → À conserver → À simplifier → Proposition v2 → Risque**

### 2.1 Object

| | |
|---|---|
| **Legacy** | Conteneur + transform + méthodes d'IDE (`detectMouse`, `select`, `createImage`) + `copy()` réflexif |
| **Limites** | Code Editor et DOM dans le Core ; `copy()` ne copie pas les objets (`TODO`) ; résolution des composants par nom via `mod.js` ; `uid` désigne le joueur, pas l'objet |
| **À conserver** | Le nom `Object` ; l'identité par id court ; `components{}` et la hiérarchie ; `active`/`visible`/`lock` |
| **À simplifier** | Sortir picking/sélection/vignette vers `editor/` |
| **Proposition** | Conteneur pur + `Transform` en composant + façade `object.x` (ADR-0001, ADR-0002) |
| **Risque** | Une façade qui diverge de `Transform` recréerait deux sources de vérité — exactement ce qu'il faut éviter. Test obligatoire. |

### 2.2 Property System

| | |
|---|---|
| **Legacy** | `System.sync()` : accesseurs par propriété, stockage `_prop`/`__prop`, canal réseau `$prop` et `syncProperty()` |
| **Limites** | Propriétés dynamiques muettes ; champs `#` invisibles ; `_`/`$` énumérables (sérialisation ×3) ; écriture 4× plus lente qu'un Proxy ; pas de `previous` ; throttle réseau neutralisé (`delay = 0`) |
| **À conserver** | **L'ergonomie `object.x = 100`** et la distinction simulation / intention |
| **À simplifier** | Un `Proxy` par objet remplace N `defineProperty` |
| **Proposition** | ADR-0003 — `Change { object, component, prop, value, previous, origin }` ; `$prop` **supprimé**, `setProperty()` devient le chemin contrôlé |
| **Risque** | **Le plus élevé du projet.** Tout en dépend : Inspector, Hierarchy, réseau, ressources. Une régression est invisible (une valeur cesse simplement d'être propagée). Exige des tests avant toute autre migration. |

### 2.3 Scene

| | |
|---|---|
| **Legacy** | `objects{}` plat, `current`/`currentComponent`, `Scene.main`, `instantiate()` via `copy()` |
| **Limites** | État d'IDE (`current`) dans le Core ; `updateName(el)` lit le DOM ; pas de notion de `Project` |
| **À conserver** | La platitude de `objects{}` ; `refresh()` ; les événements `add`/`remove`/`instantiate` |
| **À simplifier** | Déplacer `current` vers une sélection d'Editor ; introduire `Project` |
| **Proposition** | `core/scene.js` sans DOM ; `editor/selection.js` |
| **Risque** | `scene.current` est lu par Inspector, Hierarchy, Handler, Manager, Network. Déplacement transverse. |

### 2.4 Components

| | |
|---|---|
| **Legacy** | Classes libres, duck-typing `update(self)`/`draw(self)`, clé = nom de classe |
| **Limites** | Aucun contrat explicite ; un seul composant par type ; minification interdite ; `Collider` référence `Scene.main` non importé ; `Texture.update()` fait une recherche par frame |
| **À conserver** | **`self` en argument** ; `update`/`draw` séparés ; l'absence de classe de base obligatoire |
| **À simplifier** | Contrat documenté, `schema` optionnel, correction des couplages |
| **Proposition** | ADR-0004 (lifecycle), ADR-0007 (schéma) |
| **Risque** | Rendre `schema` obligatoire casserait les composants utilisateurs. Il reste optionnel. |

### 2.5 Runtime / Renderer

| | |
|---|---|
| **Legacy** | `Renderer.render()` fait tri + update + picking IDE + projection + draw + preview + sélection |
| **Limites** | `import { Dnd } from '/editor/...'` dans le Core ; update/draw entrelacés (non déterministe) ; `sort()` par frame ; `Camera` à double rôle (composant *et* Object) |
| **À conserver** | Canvas 2D ; la projection caméra ; les surcouches d'affichage éditeur — mais dans `editor/viewport/`, pas comme un hook de Component |
| **À simplifier** | Séparer les phases ; sortir le picking ; cacher le tri |
| **Proposition** | `runtime/loop.js` + `runtime/rendering/` ; surcouches IDE dans `editor/viewport/` |
| **Risque** | Séparer update et draw **change l'ordre d'observation** : un jeu Legacy pourrait dépendre involontairement de l'entrelacement. |

### 2.6 Network

| | |
|---|---|
| **Legacy** | WebSocket, ~20 messages, heartbeat complet toutes les 4 s, aucune autorité |
| **Limites** | Heartbeat écrase les saisies ; payload ×3 ; enfants dupliqués ; pas d'interpolation (`TODO`) ; `Network.sync()` uniquement si `inspector` ; entrées par `uid` couplées à `Input` |
| **À conserver** | La forme `{id, prop, value}` ; le non-écho à l'émetteur ; le routage des entrées par utilisateur ; **le Core partagé** |
| **À simplifier** | Formaliser en Operations ; snapshots delta ; batching |
| **Proposition** | ADR-0008 |
| **Risque** | Le serveur est privé et en Deno avec une API WebSocket obsolète (`std@0.117`). Toute évolution du protocole exige de migrer les deux côtés **en même temps**. |

### 2.7 Editor

| | |
|---|---|
| **Legacy** | HTML monolithique (700 lignes), modules attachés à des `id` fixes, liaison par classe CSS globale |
| **Limites** | Ajouter une fenêtre = 4 fichiers ; `window.js` vide ; `Handler` de 27 ko ; `getElementsByClassName` sur `document` |
| **À conserver** | **La synchronisation lettre par lettre** ; la garde `activeElement` ; l'`Object` comme source de vérité unique ; l'Inspector réflexif |
| **À simplifier** | Web Components ; binding scopé ; viewport en outils |
| **Proposition** | ADR-0006, ADR-0007 |
| **Risque** | Le Shadow DOM **casse `getElementsByClassName` global**. Le binding doit être migré *avant* l'encapsulation, sinon la synchronisation temps réel disparaît silencieusement. |

### 2.8 Visual scripting

| | |
|---|---|
| **Legacy** | Éditeur de nœuds fonctionnel, **sans modèle, sans sérialisation, sans exécution** |
| **Limites** | Le graphe est le DOM ; `updateScript()` est un `console.log` ; `compiler.js` est du code mort ; `.px` traité comme du JS |
| **À conserver** | L'UI (pan, zoom, Bézier, connecteurs), récemment améliorée ; la palette de nœuds |
| **À simplifier** | — (il n'y a presque rien à simplifier : tout est à construire) |
| **Proposition** | Modèle `.px` sérialisable + runtime d'exécution (ADR-0009) |
| **Risque** | C'est une **construction**, pas une migration. À isoler pour ne pas retarder le reste. |

### 2.9 Resources

| | |
|---|---|
| **Legacy** | `Loader` statique, `File` natif augmenté et rendu réactif |
| **Limites** | `Resource` inutilisée ; `id = path + name` (renommer casse les références) ; images en base64 dans l'état ; Blob URL jamais révoquées ; IndexedDB non câblé |
| **À conserver** | La réactivité des ressources ; le hot reload par `import()` |
| **À simplifier** | Id stable, `Resource` réelle, cache IndexedDB |
| **Proposition** | `core/resources/` |
| **Risque** | Changer la forme des id invalide les projets existants. |

---

## 3. Registre des risques

| # | Risque | Gravité | Détection | Mitigation |
|---|---|---|---|---|
| R1 | **Rupture du Property System** : une propriété cesse d'être propagée | Critique | Aucune erreur, symptôme visuel tardif | Tests d'abord ; harnais comparant les événements émis Legacy vs v2 |
| R2 | **Désynchronisation Editor/Runtime** : Shadow DOM casse le binding par classe | Critique | Le champ ne se met plus à jour pendant la frappe | Migrer le binding avant l'encapsulation ; test d'édition lettre par lettre |
| R3 | **Divergence client/serveur** : le serveur ne peut plus importer le Core | Élevé | Le serveur ne démarre plus | Test d'import Core en Node/Deno, sans DOM, dans la CI |
| R4 | **Régression Network** : protocole modifié d'un seul côté | Élevé | Objets figés, désync | Versionner le protocole ; le serveur privé migre en même temps |
| R5 | **Deux sources de vérité `Object.x` / `Transform.x`** | Élevé | Valeurs qui divergent après un aller-retour réseau | Test d'identité : `object.x === transform.x` après chaque chemin d'écriture |
| R6 | **Incompatibilité des composants** | ~~Élevé~~ **Faible** | — | **Déclassé** : il n'existe aucun projet v1 à préserver. `schema` reste optionnel et `self` en argument conservé pour l'ergonomie, plus pour la compatibilité |
| R14 | **`setProperty()` porte le même nom qu'en Legacy avec un autre sens** | Élevé | Un développeur lit `legacy/`, en déduit le mauvais comportement, et écrit du code qui ne produit pas d'Operation | Signalé dans ADR-0003, `CONVENTIONS.md` et le JSDoc ; mapping explicite dans le harnais de parité |
| R15 | **Écriture `=` là où `setProperty()` était requis** | Élevé | La modification ne se réplique ni ne s'annule — **silencieusement** | Garde en mode développement : avertir sur une écriture directe dans un contexte `editor` (ADR-0003) |
| R7 | **Perte de comportements historiques non documentés** | Élevé | Détecté par l'utilisateur, tard | `LEGACY_ANALYSIS.md` §15 (liste explicite) ; `legacy/` reste exécutable pour comparaison |
| R8 | **Perte de performance** (façade Transform, Proxy) | Moyen | Chute de FPS | Benchmark déjà établi (§2.4 de l'analyse) ; le rebâtir en CI |
| R9 | **Architecture trop abstraite** | Moyen | Le code devient plus dur à lire qu'avant | Règle : toute abstraction doit supprimer plus de lignes qu'elle n'en ajoute |
| R10 | **Dette UI déplacée, pas résolue** | Moyen | 700 lignes de HTML deviennent 30 composants tout aussi couplés | Chaque Web Component doit être ouvrable isolément dans une page de test |
| R11 | **Le visual scripting bloque la migration** | Moyen | Le chantier s'éternise | Le sortir du chemin critique |
| R12 | **Dépendances excessives** | Faible | `package.json` qui grossit | Zéro dépendance runtime ; outillage de dev uniquement |
| R13 | **Régression déjà présente prise pour une régression v2** | Faible | Confusion en test | Bugs Legacy connus consignés (§4) |

---

## 4. Bugs Legacy connus — présents *avant* toute migration

À consigner pour ne pas les attribuer à la v2 :

1. **Le solo hors ligne ne fonctionne pas** — `Keyboard.keys()` lève une `TypeError` à
   chaque frame, absorbée par le `try/catch`. (vérifié)
2. **`Collider.update()`** référence `Scene.main` sans import → `ReferenceError` masquée.
3. **`plugins/test.js`** appelle `Manager.addComponent()` en statique alors que c'est une
   méthode d'instance → plugin d'exemple cassé.
4. **`Compiler.compile()`** appelle `lex`/`parse`/`transpile`/`evaluate` sans préfixe et
   `evaluate` n'existe pas → toujours `ReferenceError`.
5. **`Interpreter.update()`** référence `Properties` sans l'importer.
6. **`Network.addChild/removeChild`** logguent `data.component.name` alors que le message
   ne transporte pas de `component` → `TypeError` à la réception.
7. **`Loader.load()`** déstructure `blob.type` sans vérifier que le `fetch` a réussi.
8. **`tools/dev-server.sh`** sert `engine/` alors que l'application a besoin de `legacy/`.
9. **Les décimales sont tronquées** dans l'Inspector (`parseInt` sur des `number`).
10. **`Light.update()`** écrase `self.width`/`self.height` chaque frame, annulant toute
    saisie utilisateur.
11. **`Tilemap.draw(ctx, camera)`** a une signature incompatible avec `Object.draw()` :
    attaché à un objet, il lève une `TypeError` masquée. `Lighting` et `LightSource`
    violent également le contrat de composant tout en étant exportés par `mod.js`.
12. **`Object.copy()` détruit `components`, `childs` et `image`** quand la source est un
    `Object` vivant : il lit les accesseurs `$prop` en écriture seule et les réassigne.
    Conséquence : **`Scene.instantiate()` lève dès que la source porte un composant** —
    ce qui casse la création de prefab et le chemin `Network.add`. Le heartbeat survit
    parce qu'il copie depuis du JSON plat, sans accesseurs `$`.
    *(découvert par le harnais de parité, non par lecture)*
13. **`gamepad.js`** teste `typeof window !== 'undefined'` là où les autres modules
    testent `window.document` — il s'exécute donc dans un environnement sans DOM.

Les points 12 et 13 ont été découverts en **exécutant** Legacy via `tools/parity/`.
C'est précisément ce que l'étape 1 devait produire.

---

## 5. Séquence proposée

Ordre dicté par les dépendances et par le risque, pas par la facilité.

| Étape | Contenu | Critère de sortie |
|---|---|---|
| **0** | *(fait)* Analyse, proposition, décisions | §10 tranché — **fait le 2026-08-12** |
| **1** | **Outillage + harnais de parité** : capture du comportement Legacy | ✅ **fait** — `tools/parity/`, 39 scénarios, `node tools/parity/run.js` |
| **1 bis** | Serveur de dev corrigé, test de règle de dépendance des couches | à faire |
| **2** | `core/` : events, logger, Property System (Proxy + Operations), Object, Component, Scene, serialize | Parité prouvée par le harnais de l'étape 1 |
| **3** | `Transform` + façade | `object.x === transform.x` sur tous les chemins |
| **4** | `runtime/` : boucle, rendering, input découplé de network | Une scène s'exécute ; **le solo hors ligne marche** |
| **5** | `network/` + `authority` : Operations, delta, batching — **client et serveur ensemble** | Deux clients synchronisés, pas d'écho, toute Operation traverse `authority.check()` |
| **6** | `editor/` : primitives `px-*`, binding scopé, Inspector à schéma | **Édition lettre par lettre préservée** |
| **7** | Viewport en outils | Parité fonctionnelle avec `Handler` |
| **8** | Ressources : `Resource`, ids stables, IndexedDB | Projet rechargeable |
| **9** | Visual scripting : modèle `.px`, exécution (Q7) | Un graphe pilote un objet |

Étapes 2 et 3 sont indissociables. L'étape 5 exige une fenêtre de migration coordonnée
avec le serveur privé. L'étape 9 est hors chemin critique.

**Ce qui a disparu de la séquence :** aucune étape de migration de données. Il n'existe
pas de projets v1 (Q6), donc pas de convertisseur, pas de format de transition, pas de
double lecture dans `deserialize()`.

---

## 6. Critère de réussite

À tout moment, il doit être possible de répondre par un pointeur vers ce dossier :

1. Comment Pixel Creator fonctionne réellement → `migration/LEGACY_ANALYSIS.md`
2. Quels comportements sont importants → `LEGACY_ANALYSIS.md` §15
3. Ce qui doit être conservé / refondu / supprimé / reporté → §2 de ce document
4. Comment client et serveur partagent le Core → `architecture/NETWORK.md`
5. Comment fonctionne la synchronisation → `LEGACY_ANALYSIS.md` §7.1
6. Comment rendre l'Editor modulaire sans framework → `decisions/ADR-0006`
7. Comment préserver l'ergonomie de l'API → `decisions/ADR-0003`
8. Comment intégrer `.px` et `.js` → `decisions/ADR-0009`
9. Comment Network évolue vers Operations → `decisions/ADR-0008`
10. Quels sont les risques → §3 de ce document
