# ADR-0009 — `.px` est un graphe, `.js` est du JavaScript

- **Statut :** **accepté** (2026-08-12), y compris le mode d'exécution (Q7 : interprété)

## Contexte observé

### État réel du visual scripting

L'éditeur de nœuds **fonctionne** : création par drag & drop, connecteurs
entrée/sortie/erreur, chemins SVG en Bézier, pan et zoom (améliorés récemment).
La palette est définie en HTML :

- **événements** : `init`, `update`, `mouse`, `key`, `collision`, `timer`
- **structures** : `if`, `repeat`
- **fonctions** : `math`, `move`, `edit`, `create`, `delete`, `draw`, `print`

Mais **tout le reste manque** :

- **Le graphe est le DOM.** Un nœud est un `<div>` ; une connexion est un couple de
  connecteurs liés par des propriétés JS posées sur des éléments DOM
  (`connector.other`, `connector.path`).
- **Aucune sérialisation.** Fermer l'onglet perd le travail.
- **Aucune compilation.** `Graph.updateScript()` fait `console.log(this.nodes)` puis
  `this.code = ''` ; les lignes utiles sont commentées.
- **Aucun lien avec le runtime.** Aucun objet n'exécute jamais un graphe.
- **Aucune variable, aucune métadonnée.**

`editor/graph/compiler.js` n'est pas un compilateur de graphe : c'est le lexer/parser
d'un langage textuel à syntaxe Rust (`i32`, `fn`, `let`, `struct`, `match`, `mod`).
Sa méthode `compile()` appelle `lex`/`parse`/`transpile`/`evaluate` **sans préfixe
`Compiler.`**, et `evaluate` n'existe nulle part → `ReferenceError` systématique.
Code mort.

### `.px` est aujourd'hui du JavaScript déguisé

C'est le point le plus important, et il contredit l'intention affichée :

```js
// legacy/src/core/loader.js
static allowedScriptsTypes = ['text/javascript', 'application/javascript', 'application/px'];
```

Un fichier `.px` suit **exactement** le chemin d'un `.js` : lu en texte → Blob URL →
`import()` → `module.default` traité comme une classe de composant.

De plus, le serveur privé connaît un type différent : `application/pixelscript`.
**Deux types MIME divergents pour la même idée.**

## Décision

Deux formats, deux natures, **un seul modèle objet**.

| Extension | Nature | MIME | Exécution |
|---|---|---|---|
| `.px` | **graphe** — ressource structurée JSON | `application/px` (unifié) | interprété par le runtime |
| `.js` | module JavaScript ES | `text/javascript` | `import()` dynamique |

`.px` **cesse** d'être routé vers `import()`.

### Modèle de données `.px`

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "update", "x": 120, "y": 80, "params": {} },
    { "id": "n2", "type": "move",   "x": 340, "y": 80, "params": { "speed": 2 } }
  ],
  "connections": [
    { "from": ["n1", "out", 0], "to": ["n2", "in", 0] }
  ],
  "variables": [
    { "name": "speed", "type": "number", "value": 2 }
  ],
  "metadata": { "name": "player" }
}
```

L'éditeur de nœuds actuel est conservé et **pilote ce modèle** au lieu d'être le modèle.

### Une seule API pour les deux

`.px` et `.js` manipulent les mêmes concepts : `Object`, `Component`, `Property`,
`Scene`, `Resource`, `Event`, `Runtime`.

```
        API du moteur
       ┌──────┴──────┐
   graphe .px      script .js
```

Un nœud `move` et un `self.x += speed` en JavaScript passent par le même chemin
d'écriture, donc par le même Property System, donc par la même réplication réseau.
**Ce ne sont pas deux moteurs.** Un nœud ne peut rien faire qu'un script ne puisse
faire, et réciproquement.

Corollaire : un graphe doit pouvoir être **inspecté** comme un composant (ses
`variables` sont ses propriétés), et donc apparaître dans l'Inspector via ADR-0007.

## Mode d'exécution — VALIDÉ : interprété

**Q7 tranchée : `.px` est interprété, pour le débogage et la sécurité.**

| | Interprétation ✅ | Compilation en JS |
|---|---|---|
| Débogage | pas à pas, points d'arrêt visuels | difficile (source générée) |
| Sécurité | **pas d'`eval`** | dépend de la génération |
| Performance | plus lente | proche du natif |
| Complexité | moyenne | élevée (générateur + source maps) |

Un graphe de gameplay exécute quelques dizaines de nœuds par frame : la lisibilité du
pas-à-pas et l'absence d'`eval` valent davantage que la vitesse brute.

Conséquence pratique : `runtime/scripting/` contient un **interpréteur de graphe** —
il parcourt les nœuds et appelle l'API du moteur. Aucune génération de code, aucun
`eval`, aucune `Function()`.

Le format `.px` reste inchangé si une compilation s'avérait un jour nécessaire :
c'est une décision d'exécution, pas de format.

> **Note de sécurité.** `.js` continue de passer par `import()` dynamique, ce qui exécute
> du code arbitraire — c'est assumé pour les scripts que le créateur écrit lui-même.
> `.px`, lui, est interprété et n'exécute jamais de code arbitraire : c'est ce qui en
> fait le format sûr pour du contenu partagé.

## Conséquences

### Positives

- Un graphe devient une vraie ressource : sauvegardée, versionnée, répliquée, diffable.
- `.px` cesse d'être un `.js` déguisé, conformément à la vision.
- Le format JSON est lisible par un humain et par une IA.

### Négatives

- **C'est une construction, pas une migration.** À sortir du chemin critique
  (risque R11) pour ne pas retarder Core/Runtime/Editor.
- Il faut un exécuteur de graphe, qui n'existe pas du tout aujourd'hui.
- La collision de nom avec `editor/graph/component.js` (classe `Component` sans rapport
  avec les composants de jeu) doit être levée par renommage.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **`.px` = JavaScript** (statu quo) | Explicitement refusé par la vision ; prive le graphe de tout modèle. |
| **Reprendre `compiler.js`** | C'est un langage textuel type Rust, sans rapport avec le graphe, et non fonctionnel. |
| **Un seul format `.js`, graphe comme vue** | Un graphe n'est pas exprimable proprement comme JavaScript sans perte de disposition et de métadonnées. |
| **Format binaire** | Illisible, non diffable, sans bénéfice à cette échelle. |
