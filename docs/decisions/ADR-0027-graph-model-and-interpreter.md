# ADR-0027 — Le modèle de graphe `.px`, ses propriétés utilisateur, et son interprète

- **Statut :** **accepté** (2026-08-18)
- **Décide :** ce qu'est un graphe `.px`, comment il est édité, validé et exécuté
- **Dépend de :** ADR-0003 (Property System), ADR-0007 (Inspector à schéma), ADR-0008
  (Operations), ADR-0009 (`.px` est un graphe, interprété), ADR-0012 (erreurs runtime),
  ADR-0015 (un Component peut avoir un graphe), ADR-0016 (définition = propriétés + graphe),
  ADR-0020 (Resources), ADR-0023 (`PropertyType`), ADR-0024 (Undo/Redo), ADR-0026 (`.px` est
  **une** ressource)
- **Ferme :** les points ouverts « le modèle de graphe et son interprète » (ADR-0009,
  ADR-0015, ADR-0016), et « les `variables` d'un graphe » (ADR-0009, ADR-0015)
- **Amende :** ADR-0009 (la forme des connexions dans le payload)

---

## Contexte observé

ADR-0009 a tranché que `.px` est un graphe interprété. ADR-0015 a fixé **où** un graphe
entre dans la simulation. ADR-0016, amendé par ADR-0026, a fixé qu'une définition **porte**
son graphe. Trois ADR, et il manquait toujours la seule chose qui les rend utilisables : le
graphe lui-même. `createComponent()` écrivait `{ version: 1, nodes: [], connections: [] }`
et rien au monde ne savait le lire.

**OBSERVÉ dans `legacy/editor/graph/`** — une implémentation expérimentale, inspectée avant
d'écrire une ligne :

| Ce que Legacy faisait | Verdict |
|---|---|
| Chemins de Bézier horizontaux, décalage `max(50, distance × 0.4)` | **repris tel quel** — c'est ce qui fait lire un fil comme un câble |
| Pan/zoom par transformation de vue, coordonnées des nœuds intactes | **repris** — c'est la seule façon de ne pas perdre la disposition |
| Un nœud est un `<div>`, une connexion un couple d'éléments liés par `connector.other` | **rejeté** — le graphe *était* le DOM, donc fermer l'onglet perdait le travail |
| Position d'un port lue par `getBoundingClientRect()` à chaque `mousemove` | **rejeté** — un port n'existait que tant qu'il était à l'écran |
| Ports adressés par leur **index** (`outputs[i + 1]`), recréés à chaque frappe | **rejeté** — un type de nœud gagnant un port recâblait silencieusement tous les graphes |
| Nœud éditable en `contenteditable`, ports dérivés du texte tapé | **rejeté** — le type d'un nœud n'est pas une chaîne que l'utilisateur tape |
| `Graph.main` statique, `Graph.updateScript()` qui fait `console.log` | **rejeté** — aucun modèle, aucune sérialisation, aucune exécution |
| `editor/graph/compiler.js` — lexer d'un langage textuel type Rust, `evaluate` inexistant | **abandonné** (déjà acté par ADR-0009) |

Le legacy est donc une **source d'idées de rendu**, et un catalogue de ce qu'il ne faut pas
refaire côté modèle.

---

## Décision

### 1. Le graphe est un modèle du Core, pas une vue

```
graph model        core/graph/          aucun DOM, aucun navigateur
     ↓
graph view         editor/graph/view.js  arithmétique pure, testée sous Node
     ↓
graph renderer     editor/windows/graph.js  SVG, événements pointeur
```

`core/graph/` ne connaît ni pixel, ni fenêtre, ni stockage. C'est ce qui permet à un serveur
headless de charger, valider et exécuter un `.px` — l'exigence d'ADR-0011 — et c'est
exactement ce que Legacy rendait impossible.

### 2. Le payload

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "event.update", "x": 40, "y": 96, "params": {} },
    { "id": "n2", "type": "property.set", "x": 320, "y": 96, "params": { "property": "p7" } }
  ],
  "connections": [
    { "id": "c1", "from": { "node": "n1", "port": "out" }, "to": { "node": "n2", "port": "in" } }
  ]
}
```

**Ceci amende la forme d'ADR-0009**, qui écrivait `"from": ["n1", "out", 0]`. Un port y
était désigné par un **index** — le défaut mesuré dans Legacy — et le triplet ne disait pas
lequel des deux bouts était la sortie. Ici :

- un nœud, un port et une connexion ont chacun une **identité stable** ;
- `from` est **toujours** la sortie, `to` **toujours** l'entrée, quel que soit le sens dans
  lequel le créateur a tiré le fil. Aucun code en aval n'a à se demander l'ordre ;
- `version` est porté depuis le premier jour : un payload qui ne peut pas dire dans quelle
  forme il est est une migration que personne ne peut écrire.

Les `variables` d'ADR-0009 **n'existent pas**, et c'est la fermeture du point ouvert : une
variable d'un graphe *est* une propriété du Component (§4). Deux systèmes d'état pour une
idée, c'est exactement ce que le reste de ces ADR refuse.

### 3. Ce qu'est un nœud : **une seule table**, dans le Core

Un type de nœud déclare sa forme **et** ce qu'il fait :

```js
{ type: 'flow.branch', label: 'Branch', category: 'Flow',
  inputs:  [flow('in'), data('condition', 'boolean', 'Condition', false)],
  outputs: [flow('true'), flow('false')],
  execute: io => (io.input('condition') ? 'true' : 'false') }
```

**Pourquoi la forme et le comportement ne sont pas séparés.** Le découpage « intuitif »
aurait mis les ports au Core (l'éditeur les dessine, le validateur les vérifie) et
l'évaluation au Runtime (ADR-0015 y place l'interprète). Ce serait **deux tables à tenir en
phase** — le mode de défaillance contre lequel chaque ADR de ce dépôt est écrit, et celui
qu'ADR-0023 vient de corriger pour les types de propriétés.

L'évaluation d'un nœud est **pure au sens du Core** : elle lit ses entrées et écrit à
travers le Component, et rien d'autre. Aucun nœud livré ne touche au DOM, à une horloge, à
une source aléatoire ou au stockage — c'est vérifié par un test qui inspecte la source des
nœuds livrés. Ce qui reste au Runtime est ce qui n'appartient à aucun nœud : l'ordre
d'exécution, l'état par instance, le budget et le rapport d'erreur (§6).

### 4. Les propriétés utilisateur ont une **identité**, et le nom n'en est pas une

Le schéma d'un Component est une table **indexée par nom** — c'est ce que lit
`defineComponent()` et ce qu'affiche l'Inspector (ADR-0007, ADR-0016). Mais un nœud qui
référencerait un nom casserait au premier renommage. Chaque descripteur porte donc un `id`,
frappé une fois :

```json
"properties": { "speed": { "id": "p7", "type": "number", "default": 120 } }
```

- ce que le créateur lit et modifie librement : la **clé** ;
- ce qu'un nœud stocke : `id`.

Renommer `speed` en `walkSpeed` laisse le graphe câblé. C'est ADR-0021 appliqué une
échelle plus bas : *l'identité n'est pas un nom*.

**Le Core ignore `id`** : `defineComponent()` ne valide que `type`, et un champ de plus dans
un descripteur ne le dérange pas. Aucun second système de propriétés n'est créé — les huit
`PropertyType` d'ADR-0023 sont la seule liste, et le contrôle qui édite une valeur par
défaut est dérivé par la correspondance qui existe déjà.

### 5. Un `.px` est **un** modèle vivant, **une** pipeline, **une** pile d'undo

`ComponentDefinition` (`core/graph/definition.js`) est au payload `.px` ce que `Scene` est
au payload d'une scène : le modèle vivant, avec sa propre `Operations`. Déclarer une
propriété et câbler deux nœuds traversent **la même** pipeline, donc atterrissent sur **la
même** pile — ce qu'exige ADR-0024 §4, et ce que la ressource unique d'ADR-0026 rend
naturel.

`Document` n'est pas réintroduit (ADR-0020) : ce modèle ne porte ni sélection, ni état de
vue, ni notion d'« ouvert ».

**Les Operations ajoutées sont exactement celles que le format ne savait pas déjà dire :**

| Operation | Pourquoi elle existe |
|---|---|
| `ADD_NODE` / `REMOVE_NODE` | un nœud apparaît et disparaît ; `REMOVE_NODE` porte **ses connexions** et son rang, sans quoi annuler une suppression rendrait un nœud sans fils |
| `CONNECT` / `DISCONNECT` | idem pour un fil |
| `ADD_PROPERTY` / `REMOVE_PROPERTY` | une ligne du **schéma**, pas une valeur d'instance |

**Ce qui n'a délibérément pas d'Operation** : déplacer un nœud, changer un de ses `params`,
renommer une propriété, changer son type, changer son défaut. Chacun est un champ d'un
enregistrement réactif, donc chacun est un `SET_PROPERTY` — qui se réplique et s'inverse
depuis le jour où le format existe. Une opération dédiée serait une seconde façon de dire ce
que le format dit déjà.

Un déplacement de nœud est donc `SET_PROPERTY x` + `SET_PROPERTY y` sous **un** `batch` :
un drag à travers la toile est **un** `Ctrl Z`, sans debounce et sans second historique.

### 6. L'interprète

`runtime/scripting/interpreter.js` branche le modèle sur la couture d'ADR-0015, sans la
modifier :

```
interpretGraph(graph) ──► create(component) ──► behavior.update(self, ctx)
     une fois par graphe      une fois par instance        à chaque pas
```

- **flux poussé, données tirées.** On suit un flux depuis un nœud d'événement ; une valeur
  est tirée en remontant ses dépendances ;
- **profondeur d'abord, dans l'ordre déclaré.** `Sequence` veut dire « tout ce que fait la
  première branche, puis tout ce que fait la seconde » — pas les deux entrelacés. Le
  déterminisme n'est pas ajouté après coup, c'est cet ordre-là ;
- **le cache de valeurs est remis à zéro à chaque pas de flux.** Mémoriser sur tout
  l'événement laisserait un `Get Property` servir l'ancienne valeur après un `Set Property` ;
- **un budget** de 4096 nœuds par événement. Un flux qui boucle est la façon dont un
  créateur écrit une boucle : l'interdire serait interdire la fonctionnalité. Ce qui est
  interdit, c'est une frame qui ne finit pas ;
- **les erreurs sont des `GraphError` structurées**, levées. Le runtime les isole et les
  rapporte sans toucher au modèle : c'est le chemin d'ADR-0012, sans second mécanisme.

**Un graphe écrit par une écriture simple**, jamais par `setProperty()` : un comportement
qui tourne dans `update()` est une **sortie de simulation**, pas une intention (ADR-0003,
`CONVENTIONS.md`). L'écriture reste observable, parce que le composant est le Proxy réactif
que l'Object détient (ADR-0015 §5).

### 7. La validation est un module, pas une fenêtre

`validateGraph(payload, { registry, properties })` est pur : il prend le payload — la seule
forme qu'un serveur et un éditeur ont en commun — et rend des constats structurés.

| Constat | Sévérité |
|---|---|
| version inconnue, type de nœud inconnu, identifiant dupliqué | erreur |
| port inconnu, fil à l'envers, flux câblé sur une donnée, types incompatibles | erreur |
| entrée de donnée alimentée deux fois, sortie de flux qui continue deux fois | erreur |
| **cycle de données** | erreur — une valeur définie par elle-même n'a aucun ordre d'évaluation |
| **cycle de flux** | *aucun* — c'est une boucle, bornée par le budget |
| propriété référencée qui n'existe plus | erreur |
| nœud sans propriété sélectionnée | avertissement — il s'exécute, il n'a rien à écrire |

### 8. Une propriété supprimée ne laisse **jamais** de référence pendante

Trois vues d'un seul constat, jamais trois règles :

1. `validateGraph()` rend `MISSING_PROPERTY` ;
2. la fenêtre Graph cerne le nœud en rouge et affiche la phrase ;
3. l'interprète lève un `GraphError` que le runtime rapporte.

**Le graphe n'est pas réécrit** quand une propriété est supprimée. Réécrire ferait qu'un
geste modifie deux choses que le créateur voit, et un `Ctrl Z` devrait deviner laquelle
remettre. Annuler la suppression rend le graphe valide — c'est testé.

### 9. Le rendu est en SVG, en **une** couche

Legacy dessinait les nœuds en `<div>` et les fils en SVG : deux arbres DOM à tenir d'accord,
et une position de port qui n'existait que tant que l'élément était affiché. Un seul SVG
donne un seul espace de coordonnées : la position d'un port est de l'arithmétique
(`editor/graph/view.js`), la même arithmétique qui le pointe, et le zoom est un attribut.

**Un port de flux est un triangle, un port de donnée est un disque.** C'est la seule règle
que la toile fait respecter, donc la montrer n'est pas de la décoration.

### 10. Ouvrir et fermer une ressource

`Workspace` tient une carte d'éditeurs ouverts, chacun avec son modèle, sa pipeline et sa
pile. Ceci rend `Workspace.open()` réel et rend possible ce qu'ADR-0025 refusait faute de
fermeture : **supprimer une scène après l'avoir fermée**.

**« Attaché » n'est pas « ouvert ».** Sélectionner un `.px` dans Project donne à l'Inspector
un modèle vivant pour éditer ses propriétés — la ressource est *attachée*. Seul un
double-clic l'*ouvre*, et seule une ressource ouverte refuse d'être supprimée. Sans cette
distinction, cliquer une fois sur un Component le rendrait indestructible.

**Une seule scène à la fois**, toujours : chaque fenêtre est liée à un `Scene`, donc en
ouvrir une seconde ferme la première. Plusieurs `.px` peuvent être ouverts ensemble.

### 11. Le glisser-déposer d'une propriété vers le graphe est **refusé, avec sa raison**

ADR-0026 §6 a fait du drag & drop une table de règles. Une propriété déposée sur la toile
pourrait vouloir dire `Get Property` **ou** `Set Property`, et choisir à la place du créateur
est exactement le comportement magique qu'ADR-0026 demande d'éviter. Un modificateur pour
distinguer les deux serait une convention invisible.

Ce qui existe à la place est explicite et découvrable : le menu de création de nœuds a une
catégorie `Properties`, et le nœud choisi propose les propriétés du Component par leur nom.
La règle pourra être ajoutée le jour où un geste non ambigu sera conçu — c'est une ligne dans
`dnd/rules.js`.

> **Amendé par ADR-0037 (2026-08-22) — le geste a été conçu, et le refus est levé.** Le geste
> non ambigu que cette section appelait est un **menu ouvert à l'endroit où le pointeur a
> lâché** : le créateur choisit `Get` ou `Set` explicitement, localement, et rien n'est
> deviné. Le raisonnement de §11 n'est pas renversé, il est **satisfait**. Un dépôt sur un
> nœud **existant** n'ouvre aucun menu : poser ce nœud était déjà le choix, et le dépôt ne
> fait que remplir ses params.

---

## Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi il reste ouvert |
|---|---|
| **Une valeur en ligne sur une entrée non connectée** | aujourd'hui une entrée libre rend le défaut déclaré par le port. Un champ à même le nœud est un vrai confort et une vraie question de rendu ; il ne change pas le format |
| **Les nœuds de dessin** | `draw` appartient au type de Component (ADR-0015 §9). Un nœud qui produit des pixels demande une couture que rien ne réclame encore |
| **Sélection multiple, copier/coller, commentaires, minimap** | chacun est un geste avec ses propres questions ; en livrer la moitié est ce qui rend une toile imprévisible |
| **La portée d'undo d'une action qui touche deux ressources** (ADR-0024) | la fenêtre Graph existe maintenant, mais fermer un éditeur libère déjà sa pile — le cas restant (annuler dans Project la création d'un `.px` dont la pile a été libérée) ne peut plus produire d'entrée orpheline. Le traitement général reste à écrire |
| **Le nœud `Log` en production** | il prend son puits de l'hôte et est inerte sans lui. Une fenêtre Console est une autre étape |

---

## Conséquences

### Positives

- Un `.px` est enfin **exécutable** : le premier vrai runtime de visual scripting du produit.
- Un créateur déclare ses propriétés, les édite, les renomme — et le graphe suit, parce que
  ce qu'un nœud stocke est une identité.
- Undo/redo du graphe n'a coûté **aucun** code de mutation : le format le portait déjà.
- Client et serveur interprètent le même graphe par le même code, sans variante.
- Le modèle est testable sous Node, y compris la géométrie de la toile — ce qui était
  strictement impossible dans Legacy.

### Négatives

- Le catalogue de nœuds vit au Core, ce qui met une **fonction** dans une couche qui ne
  contenait jusqu'ici que de la donnée et du modèle. C'est assumé et borné : un nœud est pur,
  et un test refuse qu'un nœud livré nomme `document`, `Date.now` ou `Math.random`.
- Un `Set Property` non connecté écrit le défaut de la propriété à chaque pas plutôt que de
  ne rien faire. C'est cohérent (une entrée libre vaut son défaut) et surprenant ; une valeur
  en ligne le rendra explicite.
- Le budget est un nombre arbitraire. Il est franc plutôt que juste.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Forme et comportement d'un nœud dans deux couches** | Deux tables à tenir en phase, pour une seule idée. |
| **Le catalogue et l'interprète entièrement au Runtime** | L'Editor dessine les ports et le validateur les vérifie ; les deux auraient dû dépendre du Runtime pour savoir ce qu'est un nœud. |
| **Garder `variables` d'ADR-0009** | Un second système d'état à côté des propriétés du Component, pour la même idée. |
| **Un port désigné par son index** (`["n1","out",0]`, ADR-0009) | C'est le défaut mesuré dans Legacy : un type de nœud gagnant un port recâble tous les graphes. |
| **Une `Operation` pour déplacer un nœud** | Une position est un champ réactif ; `SET_PROPERTY` le fait, se réplique et s'inverse déjà. |
| **Une `Operation` `UPDATE_PROPERTY`** (renommer / retyper / redéfinir) | Même argument : trois champs d'un enregistrement réactif. |
| **Interdire tous les cycles** | Un flux qui boucle **est** une boucle. Interdire, c'est interdire la fonctionnalité. |
| **Réécrire le graphe quand une propriété est supprimée** | Un geste modifierait deux choses visibles, et l'undo devrait deviner laquelle rendre. |
| **Nœuds en HTML + fils en SVG** (Legacy) | Deux arbres DOM à tenir d'accord, et une position de port qui n'existe qu'à l'écran. |
| **Compiler le graphe en JavaScript** | Tranché par ADR-0009 Q7 : `.px` est interprété, sans `eval`. |
| **Un dépôt de propriété qui crée un `Get Property`** | `Get` ou `Set` — deviner à la place du créateur est le comportement magique qu'ADR-0026 refuse. |
