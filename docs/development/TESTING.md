# Tests

## OBSERVÉ

**Il n'existe aucun test.** Aucun framework, aucun fichier de test, aucune CI.
`legacy/plugins/test.js` est un exemple de composant, pas un test.

Conséquence directe : plusieurs bugs vivent dans le code sans être détectés — le mode
solo hors ligne cassé, `Collider` qui référence un `Scene` non importé, un plugin
d'exemple qui appelle une méthode d'instance en statique, un compilateur qui lève
systématiquement une `ReferenceError`. Voir `../MIGRATION.md` §4.

C'est aussi ce qui rend la migration risquée : **rien ne dira qu'une propriété a cessé
d'être propagée.**

## PROPOSITION V2

### Contraintes

- Zéro dépendance runtime. L'outillage de test est une dépendance de développement,
  acceptable, mais elle doit rester minimale.
- Le Core doit être testable **sans DOM** — c'est aussi la garantie qu'il tourne côté
  serveur.
- Les tests doivent pouvoir s'exécuter aussi dans un navigateur, pour l'Editor.

### Priorités — dans cet ordre

**1. Property System** (risque R1, le plus élevé)

- `object.x = v` émet un `Change` `{ prop, value, previous, origin }`
- `object.$x = v` émet un `Change` répliqué
- une propriété **ajoutée après construction** est réactive
  *(échoue sur Legacy — c'est la régression corrigée)*
- une écriture d'origine `network` ne repart pas sur le réseau
- la propagation hiérarchique déplace bien les enfants
- **harnais de parité** : exécuter la même séquence d'écritures sur Legacy et v2, et
  comparer la séquence d'événements émis, ordre inclus

**2. Règle de dépendance des couches**

Test statique : aucun fichier de `core/` n'importe `runtime/`, `editor/`, `network/`,
ni ne référence `window` / `document`.
*(Échoue aujourd'hui : `renderer.js` importe `editor/system/dnd.js`.)*

**3. Import du Core hors navigateur**

Charger `core/mod.js` dans Node ou Deno, sans DOM. C'est le test qui protège l'acquis
le plus précieux du projet : le Core partagé client/serveur (risque R3).

**4. Identité Transform / façade** (risque R5)

`object.x === object.getComponent('Transform').x` après écriture par la façade, par le
composant, par le réseau, par l'Inspector.

**5. Sérialisation**

- aller-retour `serialize` → `deserialize` sans perte
- pas de doublons `_`/`$`
- enfants référencés, **jamais imbriqués deux fois**
- taille de charge utile contrôlée (garde-fou contre une régression du facteur 3)

**6. Composants**

- `update` / `draw` appelés uniquement si `active`
- `draw` jamais appelé côté serveur
- une erreur dans un composant n'arrête pas la boucle (comportement Legacy conservé)
- un composant sans `schema` s'affiche correctement dans l'Inspector (repli réflexif)

**7. Editor — le test le plus important pour l'utilisateur**

**Édition lettre par lettre** : écrire `P`, `Pl`, `Pla`, `Play` dans un champ met à
jour toutes les autres vues **sauf** celle qui a le focus. C'est le test qui protège le
risque R2.

**8. Network**

- un `Change` produit l'`Operation` attendue
- pas d'écho vers l'émetteur
- `previous` permet de reconstruire l'état antérieur (base de l'undo)

### Tests de non-régression contre Legacy

`legacy/` reste exécutable. Pour les comportements difficiles à spécifier, la référence
est le comportement observé de Legacy — d'où le harnais de parité du point 1.

### Performance

Le benchmark du Property System est déjà établi (`../migration/LEGACY_ANALYSIS.md` §2.4).
Il doit être rejoué en CI avec un seuil : lecture ≤ baseline Legacy, écriture
strictement meilleure.

Ajouter un benchmark de rendu sur une scène ≥ 500 objets, avant/après l'introduction de
la façade `Transform` (risque R8).

### Ce qu'on ne teste pas

- Le rendu pixel par pixel — trop fragile pour la valeur apportée.
- L'apparence de l'UI.
- Le serveur privé depuis le dépôt public.
