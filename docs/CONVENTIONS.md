# Conventions

## Langue

- **Code, identifiants, commentaires, JSDoc : anglais.**
- **Documentation `docs/` : français.** Les identifiants techniques y restent en anglais
  (`Object`, `Component`, `setProperty`).

**OBSERVÉ :** Legacy mélange les deux dans les commentaires (« Si l'objet est
sélectionné », « annule l'interdiction de drop »). En v2, le code est en anglais sans
exception.

## Style

- JavaScript, modules ES. Pas de TypeScript, pas de transpilation.
- `camelCase` pour variables et fonctions, `PascalCase` pour les classes,
  noms de fichiers en minuscules.
- Un fichier = une classe = une responsabilité.
- Hiérarchies de dossiers peu profondes.
- Guillemets simples, indentation 4 espaces, point-virgule — comme Legacy.

## JSDoc

Documenter les constructeurs et les méthodes publiques. Pas de JSDoc au niveau de la
classe. Rester factuel.

```js
/**
 * Move the object and resolve collisions
 * @param {number} x - Horizontal offset
 * @param {number} y - Vertical offset
 */
```

## Règles spécifiques à Pixel Creator

### `Object` masque le global

Un module qui importe `Object` n'utilise **jamais** les statiques du global :
`Object.keys`, `Object.values`, `Object.assign`, `Object.entries`.

**OBSERVÉ :** `legacy/src/core/renderer.js` fait `Object.values(scene.objects)` sans
importer notre `Object` — cela fonctionne par chance. Le même code dans `scene.js`,
qui l'importe, serait un bug silencieux.

Utiliser des helpers explicites (`keysOf`, `valuesOf`) dans les modules concernés.

### Écriture de propriété : choisir le bon canal

```js
object.x = 100;      // simulation, caméra locale — local, pas de réseau
object.$x = 100;     // intention utilisateur — local + réplication
```

Règle : **un composant n'écrit jamais avec `$`.** La simulation n'a pas à répliquer,
c'est le serveur qui fait autorité sur son propre `update()`.
Seuls l'Editor et les actions utilisateur explicites utilisent `$`.

### Lire une transform en boucle chaude

La façade `object.x` traverse deux indirections (ADR-0002). Dans le rendu et la
physique :

```js
// non
self.x + self.width / 2

// oui
const t = self.transform;
t.x + t.width / 2;
```

### Champs privés `#`

À réserver à l'état **réellement interne**, jamais à une donnée que l'utilisateur doit
voir ou qui doit être répliquée.

**OBSERVÉ :** `Texture` déclare `#scaleX`, `#scaleY`, `#scaleFromBox` ; ces propriétés
sont devenues invisibles au Property System, à l'Inspector et à la sérialisation, sans
que le commit qui les a introduites ne le signale. Voir `migration/LEGACY_ANALYSIS.md`
§2.3.

### Rendu

- Canvas : visuel de jeu uniquement.
- DOM : interface uniquement.
- Ne jamais mélanger les deux responsabilités dans un même module.

### Dépendances de couches

```
editor/  ──►  runtime/  ──►  core/
network/ ──►  core/
core/    ──►  (rien)
```

Le Core n'importe jamais le DOM (`window`, `document`), ni `runtime/`, `editor/`,
`network/`. Un test automatisé le vérifie.

## Composants

```js
export class MyComponent {
    static schema = { speed: { type: 'number', default: 2, min: 0 } };  // optionnel
    static icon = 'fas fa-gamepad';                                     // optionnel
    static category = 'physics';                                        // optionnel

    constructor(speed = 2) { this.speed = speed; }

    update(self, ctx) { }
    draw(self, renderer) { }
}
```

- `self` est **passé en argument, jamais stocké** — sinon cycle, et la sérialisation
  ainsi que la réplication cassent.
- Les composants sont sérialisables en JSON : pas de fonctions, pas de références DOM,
  pas de références vers d'autres objets (utiliser des ids).
- Un composant ne lit jamais un singleton d'entrée ou de rendu : il reçoit `ctx` et
  `renderer`.

## Documentation

Toujours étiqueter la nature d'une affirmation :

- **OBSERVÉ DANS LEGACY** — vérifié dans le code
- **DÉCISION HISTORIQUE** — choix délibéré du passé
- **PROPOSITION V2** — non implémenté
- **QUESTION À VALIDER** — décision en attente

Ne jamais présenter une proposition comme un comportement existant.

**OBSERVÉ :** les documents `docs/architecture.md` et `docs/documentation.md`
antérieurs décrivent des intentions contredites par le code (« The editor never mutates
engine state directly » — l'Editor écrit `scene.current.$x = …` en direct). C'est
précisément l'erreur que cette convention doit empêcher.

## Git

- Messages en anglais, préfixés : `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- Ne jamais committer dans `legacy/` : c'est une archive en lecture seule.
- Ne jamais committer le serveur privé dans le dépôt public.
