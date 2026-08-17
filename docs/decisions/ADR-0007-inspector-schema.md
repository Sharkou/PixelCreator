# ADR-0007 — Inspector piloté par schéma, réflexif en repli

- **Statut :** **accepté** (2026-08-12)

## Contexte observé

**L'Inspector de Legacy est déjà générique.** Contrairement à ce qu'on pourrait craindre,
`editor/windows/properties.js` ne contient **aucun** `if (component === 'Health')`.
Il réfléchit sur l'objet et déduit le widget du type de la valeur :

| Valeur | Widget produit |
|---|---|
| `number` | `<input type="text">` |
| `boolean` | `<input type="checkbox">` |
| `string` commençant par `#` | `<input type="color">` |
| `string` | `<input type="text">` |
| instance de `Color` | `<input type="color">` |
| autre objet | `<input type="text">` |

Le schéma est donc **implicite, inféré de la valeur à l'instant T**. C'est élégant et
cela couvre les cas courants sans configuration.

### Limites mesurées

1. **Liste noire codée en dur** : `id`, `uid`, `scale`, `static`, `type`, `active`,
   `visible`, `lock`, `image`, `parent`, `components`, `childs` — un `switch` que tout
   nouveau champ oblige à modifier.
2. **Décimales tronquées** : `parseInt(value, 10)` à l'affichage d'un `number`.
   Une vitesse de `0.4` s'affiche `0`.
3. **Détection de couleur par la valeur** : une couleur initialisée à `''` devient un
   champ texte ; un texte commençant par `#` devient un sélecteur de couleur.
4. **Aucune contrainte** : ni min, ni max, ni pas, ni unité, ni infobulle.
5. **Branches mortes** : `case 'TODO Range'`, `'TODO Array'`, `'TODO Enumeration'`,
   `'TODO Image'`, `'TODO Button'` sont comparées à `value.constructor.name` et ne
   peuvent jamais correspondre.
6. Les champs `#privés` sont invisibles (voir ADR-0003).
7. Le seul endroit réellement spécifique par composant est le `switch` d'icônes dans
   `appendName()`.

## Décision

Un composant **peut** déclarer un schéma statique. L'Inspector l'utilise s'il existe et
retombe sinon sur l'inférence actuelle.

```js
export class Health {
    static schema = {
        max:     { type: 'number', default: 100, min: 0 },
        current: { type: 'number', default: 100, min: 0, max: 'max' }
    };
    constructor(max = 100) { this.max = max; this.current = max; }
}
```

Types envisagés : `number`, `int`, `boolean`, `string`, `color`, `enum`, `range`,
`vector2`, `resource` (image, son, script, graphe), `object`, `array`, `action` (bouton).

Attributs : `default`, `min`, `max`, `step`, `label`, `tooltip`, `unit`, `hidden`,
`readonly`, `group`.

> **Tranché par ADR-0023 (2026-08-14).** Cette liste posait deux questions avec un seul mot.
> Elle est scindée : le Core possède **`PropertyType`** — huit membres, la forme de la
> valeur : `number`, `int`, `boolean`, `string`, `color`, `enum`, `resource`, `array` — et
> l'Editor en **dérive** `FieldKind`, la question du contrôle.
>
> `range` est **dérivé** d'un `number` borné aux deux bouts, donc aucun composant n'a besoin
> de le déclarer. `readonly` est un repli d'affichage, pas une forme de valeur. `object` est
> **retiré** (aucun consommateur, aucune validation, aucun sens pour la réplication),
> `vector2` est inutile — l'Inspector apparie déjà `x`/`y` — et `action` n'est pas une
> propriété : un bouton est une commande.

## La section `Object` de l'Inspector

**Consigné le 2026-08-14** — le comportement existait dans le code sans qu'aucun ADR ne le
documente.

L'Inspector rend, **au-dessus des Components**, une section `Object` intrinsèque, alimentée
par une liste écrite à la main (`editor/inspector/schema.js`, `objectFields()`) : `name`,
`tag`, `layer`, `active`.

> **`Object` n'est pas un Component**, et `name` / `tag` ne deviennent jamais des Components
> stockés dans `object.components` (ADR-0001, ADR-0002). Faire des Components une collection
> ordonnée (ADR-0018) **ne touche pas** cette section : elle n'est pas dans cette collection.

- `visible` et `lock` en sont absents à dessein : la ligne de Hierarchy les porte, où ils
  sont à un clic pour tous les objets à la fois plutôt qu'un par un ;
- `id` est absent parce qu'un créateur n'en a pas l'usage, et qu'un panneau qui s'ouvre sur
  une chaîne aléatoire ressemble à un débogueur ;
- l'édition passe par `Object.setProperty()`, qui produit une Operation dont la cible est
  `{ object: id, component: null }`. **Ce `component: null` est la façon dont le format
  exprime « propriété intrinsèque de l'Object »**, et c'est ce qui rend l'édition de `name`
  répliquable et annulable comme le reste.

### Le repli réflexif est conservé, pas déprécié

Un composant écrit par un utilisateur débutant, sans `schema`, doit continuer à
s'afficher correctement. **C'est une exigence, pas une tolérance.** Le schéma sert à
enrichir (contraintes, énumérations, ressources), jamais à autoriser.

### Ce qui est corrigé au passage

- `parseInt` → formatage préservant les décimales ;
- la liste noire devient `hidden: true` dans le schéma des propriétés concernées, ou une
  convention explicite pour les champs système ;
- les branches `TODO *` sont remplacées par de vrais types ;
- le `switch` d'icônes devient `static icon = 'far fa-heart'` sur le composant.

## Conséquences

### Positives

- Un composant décrit son interface là où il est défini — un seul endroit à lire.
- L'Inspector n'a plus aucune connaissance des composants concrets.
- Le schéma sert aussi à la validation, aux valeurs par défaut, à la sérialisation, et
  plus tard à une IA qui voudrait comprendre un composant.

### Négatives

- Deux chemins de code à maintenir (schéma et réflexion). Accepté : le repli est court
  et il existe déjà.
- Le schéma peut diverger de l'implémentation (`static schema` déclare `speed`, le
  constructeur l'a renommé). Mitigation : un test de développement compare les clés du
  schéma aux propriétés d'une instance neuve.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Rester en réflexion pure** | Ne permet ni contraintes, ni énumérations, ni champs ressource. Les `TODO` de Legacy montrent que le besoin était déjà identifié. |
| **Schéma obligatoire** | Casse tous les composants existants et alourdit l'écriture d'un composant simple — contraire à l'objectif débutant. |
| **Décorateurs** | Pas de support natif stable, imposerait un build. |
| **Inférence par types TypeScript** | Le projet est en JavaScript pur ; les types disparaissent à l'exécution, l'Inspector est un outil d'exécution. |
