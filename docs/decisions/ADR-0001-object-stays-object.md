# ADR-0001 — `Object` reste `Object`

- **Statut :** accepté (contrainte de projet)

## Contexte

La terminologie des moteurs modernes emploie `Entity`. Legacy emploie `Object`, partout :
code, protocole réseau, documentation, UI (« Add Object »), vocabulaire des utilisateurs.

## Décision

Le terme reste **`Object`**. Aucun renommage en `Entity`, ni maintenant ni plus tard.

Le vocabulaire du produit est fixe :

```
Project → Scene → Object → Component → Property
```

## Justification

- Le terme est visible par l'utilisateur final. Le renommer change le produit, pas
  seulement le code.
- Il circule dans le protocole réseau et les projets sauvegardés.
- Il est plus accessible qu'`Entity` pour un public débutant, qui est la cible.
- Aucun bénéfice technique — uniquement un alignement sur une convention d'autres moteurs.

## Conséquence pratique

`Object` masque le `Object` global de JavaScript dans les modules qui l'importent.
Legacy vit déjà avec, y compris là où les deux se croisent :

```js
// legacy/src/core/renderer.js — ici Object est le global, pas le nôtre
for (let obj of Object.values(scene.objects).sort(...))
```

`renderer.js` n'importe pas notre `Object`, donc `Object.values` fonctionne. Mais
`legacy/src/core/scene.js` **importe** notre `Object` — un `Object.values()` y serait
un bug silencieux.

**Règle v2 :** un module qui importe `Object` n'utilise jamais les statiques du global
(`Object.values`, `Object.keys`, `Object.assign`). Utiliser des helpers dédiés. Un test
de lint vérifie la règle.
