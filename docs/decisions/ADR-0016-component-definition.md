# ADR-0016 — Une définition décrit un type de Component : propriétés + graphe

- **Statut :** **accepté** (2026-08-13)
- **Décide :** comment un Component créé par un utilisateur est décrit, partagé et réutilisé
- **Lié à :** ADR-0004 (Components), ADR-0007 (schéma), ADR-0009 (`.px`), ADR-0015 (comportement)

---

## Contexte

ADR-0015 a fixé qu'un graphe `.px` est le **comportement** d'un type de Component, et a
laissé un point ouvert : **d'où vient le type**. Pour un composant livré avec le moteur, la
réponse est évidente — une classe JavaScript. Pour un composant qu'un créateur fabrique
dans l'éditeur, il n'y en avait aucune.

Or c'est un besoin central du produit : un utilisateur doit pouvoir créer son propre
Component réutilisable, avec ses propriétés, son graphe, et une définition partagée par
toutes ses instances.

**OBSERVÉ dans Legacy :** un fichier devenait un composant par `URL.createObjectURL` +
`import()`, et le type était `module.default`. Il n'existait ni schéma, ni définition, ni
identité stable : le composant *était* le fichier, et rien ne décrivait ce qu'il contenait.

---

## Décision

### 1. Un Component est propriétés + comportement

```
Controller.px
     ↓
Component Controller
├── propriétés     le schéma — donc ce qui se sérialise (ADR-0007)
└── comportement   le graphe lié au type (ADR-0015)
```

Une **définition** est ce couple, écrit comme donnée :

```json
{
  "type": "Controller",
  "properties": { "speed": { "type": "number", "default": 120 } },
  "graph": { "version": 1, "nodes": [], "connections": [] }
}
```

C'est du JSON : sauvegardable, versionnable, diffable, réplicable — comme le graphe
lui-même (ADR-0009).

### 2. Une définition produit un Component **ordinaire**

`defineComponent(definition)` (`core/definition.js`) en fait une classe de composant :

```js
const Controller = components.register(defineComponent(definition));
behaviors.bind(Controller);        // le graphe vient de la définition
```

Elle entre dans le `ComponentRegistry`, s'attache par `addComponent()`, s'affiche dans
l'Inspector par son schéma, se sérialise par ses propriétés. **Rien en aval ne peut
distinguer un composant né d'une donnée d'un composant écrit à la main** : il n'existe pas
un second type de Component.

### 3. La définition appartient au type, jamais à l'instance

Le schéma et le graphe vivent sur la classe. Une instance ne porte que **ses valeurs**.

Une scène de mille `Controller` contient mille `speed` et **un seul** graphe ; un
instantané ou une charge répliquée ne transporte jamais de comportement. Chaque instance
possède en revanche son propre état d'exécution (ADR-0015).

### 4. Une instance neuve a exactement les propriétés déclarées

Chaque clé du schéma existe sur une instance neuve, avec son défaut. C'est ce qui fait
coïncider l'Inspector, la sérialisation et le graphe sur ce qu'*est* un `Controller`, et
cela supprime la dérive signalée en ADR-0007 (« le schéma déclare `speed`, le constructeur
l'a oublié »).

Un défaut conteneur (tableau, objet) est **copié** par instance : partager un tableau entre
toutes les instances d'un type est un bug d'alias, pas un défaut.

### 5. Pour le Core, un graphe est une donnée

`core/definition.js` transporte le graphe et ne le lit jamais. L'interpréter appartient au
runtime (ADR-0015). **Aucune dépendance Core → Runtime**, et le serveur charge les mêmes
définitions que le client.

### 6. Redéfinir un type est un acte délibéré

Deux classes distinctes réclamant le même nom restent une erreur — c'est le bug que le
registre existe pour attraper. Un créateur qui édite son composant, lui, le dit :

```js
components.register(defineComponent(edited), { replace: true });
```

Le nom est rebindé pour ce qui sera créé ensuite. **Les composants déjà attachés gardent la
classe dont ils sont issus** ; migrer les instances existantes est une décision d'éditeur,
pas de runtime (voir points ouverts).

### 7. Un graphe est immuable pour le runtime

Le graphe est lu une fois et identifié par son identité d'objet. Éditer un comportement
signifie **produire un nouveau graphe et le lier** (`behaviors.bind`), pas muter celui en
place — sans quoi une modification serait invisible ou prendrait effet à un moment
imprévisible.

---

## Ce que cet ADR ne décide pas

| Point ouvert | Où il sera tranché |
|---|---|
| Le format de fichier et le stockage d'une définition (une ressource) | avec `Resource` et le chargement de projet |
| Qui charge les définitions et appelle `register` / `bind` | idem |
| Ce que deviennent les instances existantes quand une définition change (migration, valeurs par défaut ajoutées) | avec l'Editor |
| Le modèle de graphe, ses `variables` et son interprète | ADR-0009, ADR-0015 |
| L'interface d'édition du graphe | Editor |

---

## Conséquences

### Positives

- Un créateur peut avoir son propre Component réutilisable sans écrire de JavaScript.
- Un seul modèle de Component pour le moteur, les `.js` et les définitions.
- Le graphe n'est stocké qu'une fois, jamais dans les instances ni dans les instantanés.
- Un schéma existe pour tous les composants créés dans l'éditeur, donc l'Inspector, la
  validation et la sérialisation sont exacts par construction.

### Négatives

- Une définition modifiée ne met pas à jour les instances déjà attachées : c'est une
  responsabilité qui revient à l'Editor, et elle reste à concevoir.
- Le schéma d'un composant défini est nécessairement exhaustif : une propriété non déclarée
  n'existe pas. C'est voulu — c'est ce qui rend la sérialisation prévisible.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **L'instance porte son schéma et son graphe** | Duplique la définition dans chaque objet, gonfle les instantanés et permet à deux instances du même type de diverger. |
| **Un `.px` génère le type de Component** | Le type deviendrait la conséquence d'un fichier de comportement ; contredit ADR-0015 et prive le composant de schéma. |
| **Générer une classe par `eval`/`new Function`** | Aucun besoin — une classe se construit sans évaluer de source — et contredit la règle de sécurité d'ADR-0009. |
| **Une classe de base `Component` à étendre** | Contredit ADR-0004 (duck-typing, aucune classe de base) sans rien apporter ici. |
| **Laisser l'Editor fabriquer ses classes lui-même** | Le serveur charge les mêmes définitions ; la fabrication appartient donc au Core, pas à l'IDE. |
