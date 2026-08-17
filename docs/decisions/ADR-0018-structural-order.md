# ADR-0018 — L'ordre structurel est signifiant, persistant, et sérialisé comme tel

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0004 (clé de `object.components`), ADR-0007 (schéma)
- **Complété par :** ADR-0019 (Operations structurelles)

## Contexte observé

**L'ordre des Components gouvernait déjà le comportement, et était détruit à la sauvegarde.**

| Consommateur | Ce qu'il lit | Effet |
|---|---|---|
| `runtime/runtime.js` | `Object.keys(object.components)` | ordre d'exécution d'`update()` |
| `runtime/rendering/scene-renderer.js` | `Object.keys(object.components)` | ordre de `draw()` **à l'intérieur d'un objet** |
| `editor/windows/inspector.js` | `Object.keys(object.components)` | ordre d'affichage |
| `core/serialize.js` | `Object.keys(...).sort()` | **l'ordre est perdu** |

Un `Object` portant `RectangleRenderer` **et** `Sprite` dessine les deux, et l'ordre des
Components décide lequel passe au-dessus. C'était donc déjà une technique de composition
— mais une technique qui ne survivait pas à un enregistrement.

`core/serialize.js` affirmait en commentaire que « le type d'un composant ne porte aucune
signification d'ordre ». C'était faux au moment où c'était écrit.

De même, `Scene.roots()` **filtrait** les objets sans parent. L'ordre du haut de la
Hierarchy était donc l'ordre de création, non modifiable, non sauvegardé, non annulable.

## Décision

**VALIDÉ : l'ordre des Components d'un `Object`, et l'ordre des racines d'une `Scene`,
font partie de l'état du projet.**

> L'ordre des Components d'un `Object` est l'ordre dans lequel le Runtime exécute leur
> `update`, l'ordre dans lequel le renderer exécute leur `draw`, et l'ordre dans lequel
> l'Inspector les affiche. C'est le même ordre. Il est persistant.

### 1. Le stockage interne est ordonné, le getter public ne change pas

`object.components` reste un objet gelé clefé par le type. Ce qui change est que **l'ordre
de ses clés est désormais celui de la collection**, et non un accident. Une `Map` conserve
l'ordre d'insertion, et l'ordre des clés d'un objet JavaScript est l'ordre d'insertion pour
toute clé qui n'est pas un entier — ce qu'un nom de type n'est jamais.

**Aucun lecteur existant n'est cassé.** `runtime.js`, `scene-renderer.js` et
`inspector.js` lisent la même forme et voient désormais le bon ordre.

S'y ajoutent : `object.componentTypes()`, `object.componentList()`,
`object.componentIndex(type)`, `object.moveComponent(type, index)`, et un `index`
optionnel sur `addComponent()`.

### 2. La Scene tient une liste ordonnée de racines

`Scene.roots()` renvoie une liste que la Scene possède, au lieu d'un filtre. Les racines
sont les enfants d'un parent implicite `null` — voir ADR-0019, qui en fait un seul et même
`REPARENT`.

### 3. La forme sérialisée porte l'ordre

`components` devient un **tableau**, et la scène porte `roots` :

```json
{
  "version": 2,
  "roots": ["a1b2", "c3d4"],
  "objects": [{
    "id": "a1b2",
    "components": [
      { "type": "Transform",         "values": { "x": 0, "y": 40 } },
      { "type": "res_c3",            "values": { "speed": 120 } },
      { "type": "RectangleRenderer", "values": { "width": 64 } }
    ]
  }]
}
```

Un tableau **est** ordonné. Un champ `order` dans un objet serait un ordre qu'il faut
maintenir cohérent, valider, et réparer quand il ne l'est pas.

Le tri disparaît de `serialize.js`. Le déterminisme que ce tri cherchait est obtenu
autrement, et mieux : deux sérialisations d'un même modèle sont identiques octet pour
octet parce que **le modèle est ordonné**, pas parce que l'écrivain impose un ordre par
dessus.

### 4. La liste plate `objects` suit la hiérarchie

`serializeScene` écrit les objets racines d'abord, puis en profondeur. L'ordre d'insertion
dans le stockage plat est un accident de l'histoire — supprimer un sous-arbre puis annuler
faisait sérialiser différemment un modèle identique. L'ordre du fichier est désormais
**dérivé de `roots` et de `children`**, qui, eux, sont de la donnée.

### 5. `FORMAT_VERSION` passe à 2

Aucune migration à écrire : il n'existe aucun projet v1 (`ARCHITECTURE.md` §10). Le format 1
n'est pas toléré — `components` sous forme d'objet est **refusé** plutôt que lu, parce
qu'accepter l'ancienne forme reviendrait à charger un projet dont l'ordre a été
silencieusement alphabétisé.

## Ce que cet ADR ne décide pas

- L'ordre de **dessin entre objets** reste gouverné par `layer` puis par l'ordre de la
  scène (`SceneRenderer.#drawOrder`, tri stable). Inchangé, et volontairement distinct de
  l'ordre d'`update`.
- L'ergonomie de réordonnancement dans l'Inspector (poignée de glissement, menu) reste à
  concevoir. Le modèle et l'Operation existent (ADR-0019).

## Conséquences

### Positives

- Empiler deux renderers sur un objet devient une technique **sauvegardée**, pas un
  accident toléré.
- `serialize.js` cesse d'affirmer le contraire de ce que le modèle fait.
- Réordonner devient une mutation comme une autre : répliquée, annulable, arbitrée.
- Deux sérialisations d'un même modèle sont identiques, quel que soit l'ordre de
  construction.

### Négatives

- La forme sérialisée de `components` change. Trois tests l'encodaient et ont été
  corrigés, dont un qui affirmait explicitement l'inverse de cette décision
  (`serialize.test.js`, « component keys are sorted »).
- Réordonner dans une `Map` est une réécriture, donc O(n). Sur une collection qui contient
  une poignée de composants, c'est le prix d'un seul stockage plutôt que d'une `Map` plus
  un tableau d'ordre qui pourraient diverger.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Un champ `order` dans l'objet sérialisé** | Un ordre à maintenir, valider et réparer, là où un tableau en est un. |
| **Transformer `object.components` en tableau indexé** | Casse `runtime.js`, `scene-renderer.js`, `inspector.js` et leurs tests, pour un accès par index dont seul `moveComponent` a besoin — et `moveComponent` opère sur le stockage interne. Triplerait le périmètre sans rien ajouter. |
| **Garder le tri alphabétique** | Détruit l'information que trois consommateurs lisent déjà. |
| **Tolérer le format 1 en lecture** | Chargerait un projet dont l'ordre a été perdu, sans le dire. Aucun projet v1 n'existe. |
