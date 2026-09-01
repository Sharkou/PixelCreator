# ADR-0053 — Un chemin, un décodeur

- **Statut :** **accepté** (2026-08-31)
- **Décide :** ce qu'un lâcher de propriété écrit dans un nœud
- **Dépend de :** ADR-0040 §2 (une propriété du `.px` courant est stockée sans type), ADR-0043 (le namespace Object), ADR-0047 §1 (une seule question, une valeur composite dans le picker)
- **Ne décide pas :** le geste Component → canvas nu ; la suppression d'une ressource `.px` ; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`, `On Collision`

---

## 1. Le défaut

Lâcher `Active` — une propriété du namespace `Object` — sur un `Get Property` laissait le nœud
lisant **`/active`** : la moitié gauche du chemin disparue. Le nœud résolvait alors contre les
champs du `.px` courant, où aucune propriété de ce nom n'existe.

La cause est une collision entre deux écritures qui étaient correctes séparément :

```
  setNodeParams(node, { component: 'Object', property: 'active' })
        ↓ une écriture par entrée, dans un lot
  #writeParam(node, 'component', 'Object')      → écrit
  #writeParam(node, 'property',  'active')      → paramWrites() lit un CHEMIN
        ↓ splitPropertyPath('active') → pas de '/'
  { component: null, property: 'active' }       → le Component est écrasé
```

`property-to-node` écrivait les deux moitiés séparément, ce qui marchait — jusqu'au jour où
un seul picker s'est mis à poser toute la question (ADR-0047 §1) et où `paramWrites()` a
commencé à lire toute écriture sur `property` **comme un chemin**.

## 2. La décision

> **Un lâcher de propriété écrit un seul param : le chemin.**

C'est ce que le contrôle écrit. Il y a donc **un encodage et un décodeur**, et non deux
producteurs dont l'un ignore la grammaire de l'autre.

La moitié Component vide n'est plus un cas à traiter : `'/p_speed'` dit « une propriété de ce
Component » par construction, et remplace celle que le nœud nommait avant au lieu de la
laisser traîner.

## 3. Pourquoi le namespace Object l'a révélé

Une propriété d'un vrai Component perdait aussi sa moitié gauche, mais le nœud continuait
souvent de fonctionner : `null` signifie « ce Component » et un `.px` déclare parfois une
propriété du même identifiant. `Object` n'a pas cette chance — aucun `.px` ne déclare `active`
— donc le nœud cassait visiblement. Le défaut était général ; c'est le namespace qui l'a
rendu lisible.

## 4. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Un lâcher sur un nœud écrit un seul param, le chemin | `dnd.test.js` |
| Une propriété du `.px` courant s'écrit avec une moitié gauche vide | idem |
| Une propriété du namespace `Object` garde son namespace | idem |
| Les quatre propriétés système produisent des nœuds justes | **exécuté dans Chrome** |
