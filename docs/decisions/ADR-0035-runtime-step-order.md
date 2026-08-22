# ADR-0035 — L'ordre d'exécution de `Runtime.step()`

- **Statut :** **accepté** (2026-08-22)
- **Décide :** dans quel ordre le Runtime exécute les Objects d'une Scene, et dans quel ordre le renderer les dessine à `layer` égal
- **Dépend de :** ADR-0005 (modules de runtime), ADR-0011 (autorité et déterminisme), ADR-0015 (un graphe s'exécute où son Component s'exécute), ADR-0018 (ordre structurel), ADR-0034 (ordre canonique d'une Scene)
- **Amende :** le contrat écrit dans `runtime/runtime.js` — « in scene insertion order »

---

## Pourquoi c'est un ADR séparé

ADR-0034 avait besoin d'un ordre canonique et l'a défini. La tentation était d'y intégrer
aussi le changement d'ordre d'exécution du Runtime. Trois raisons l'ont écarté, et chacune
suffit :

1. **C'est modifier un contrat écrit.** `runtime/runtime.js` documentait, en toutes lettres,
   que les composants s'exécutent « with the same fixed delta, **in scene insertion order** ».
   Changer cela au détour d'une décision sur les références aurait été un changement de
   contrat par effet de bord.
2. **Ce n'est pas une conséquence d'ADR-0034.** Celui-ci porte sur l'**observation** — un nœud
   qui construit une liste ordonnée et en prend le premier. Celui-là porte sur l'**exécution**
   — qui tourne avant qui. Un `Find By Tag` canonique est déterministe quel que soit l'ordre
   de `step()`.
3. **La portée n'est pas la même.** L'ordre d'exécution concerne **tout composant du moteur**,
   y compris ceux écrits en JavaScript qui n'ont rien à voir avec le visual scripting.

---

## Contexte observé

`runtime/runtime.js` itérait `this.#scene.objects()`, c'est-à-dire l'ordre d'insertion dans
la `Map` de la Scene.

ADR-0034 §1 a mesuré que **cet ordre est fonction de l'historique de construction, pas de
l'état** :

- après un reparent, l'ordre d'insertion et l'ordre hiérarchique divergent (`A,B,C` contre
  `A,C,B`) ;
- la sérialisation **normalise** l'ordre d'insertion vers l'ordre hiérarchique, donc un
  rechargement change `objects()` sans que l'état ait bougé ;
- une suppression suivie de son Operation inverse laisse l'état identique et l'ordre
  d'insertion différent.

Conséquence : deux machines au même état répliqué mais d'historiques différents — l'une
démarrée depuis un instantané, l'autre ayant rejoué les opérations — exécutaient leurs
composants dans un ordre différent.

Ce fait était **inobservable depuis un `.px`** tant qu'un graphe ne pouvait ni lire ni écrire
hors de son propre Component. ADR-0034 §3.3 le rend atteignable sans écrire une ligne de
code, par `property.setOn`.

---

## Impact mesuré sur l'existant

| Élément | Constat |
|---|---|
| Composants livrés possédant un `update()` | **un seul** : `ParticleSystem`. `Transform`, `Sprite`, `RectangleRenderer`, `Tilemap` et `Camera` n'en ont pas |
| Ce `update()` lit-il d'autres objets ? | Non : il fait avancer ses propres particules |
| Tests assertant un ordre inter-objets | **un seul**, dans `runtime/runtime.test.js` : deux racines créées dans l'ordre, donc insertion et hiérarchie coïncident. Il est passé sans adaptation |

Le risque pratique était donc faible. Le changement de contrat, lui, est réel : c'est cela
que cet ADR existe pour rendre délibéré plutôt qu'incident.

---

## Décision

### 1. `Runtime.step()` parcourt l'ordre canonique

**VALIDÉ.** `Runtime.step()` itère `hierarchyOrder(scene)` — la fonction qu'ADR-0034 §3.1 a
sortie de `serialize.js` — et non plus `scene.objects()`. Il n'y a **pas** de seconde
implémentation de l'ordre hiérarchique : le writer, les recherches de la Scene et le Runtime
lisent la même.

**Un parent s'exécute avant ses enfants**, ce qui est aussi ce qu'une hiérarchie de
transforms veut dire.

L'ordre d'exécution devient une fonction de l'**état répliqué** : il ne dépend que de `roots`
et de `children`, deux listes ordonnées maintenues par le seul `REPARENT`, toutes deux
répliquées et toutes deux sérialisées. L'ordre d'insertion n'est aucune de ces choses.

Rien d'autre du pas de simulation ne bouge : le delta reste fixe, l'ordre des Components à
l'intérieur d'un Object reste celui d'ADR-0018, et l'isolation des erreurs d'ADR-0012 est
inchangée.

### 2. Le contrat écrit dit l'ordre réel, et pourquoi c'est celui-là

**VALIDÉ.** La phrase « in scene insertion order » est remplacée dans `runtime/runtime.js`
par l'ordre canonique et sa raison : l'ordre d'insertion est un fait sur la façon dont une
scène a été **construite**, pas sur ce qu'elle **est**.

### 3. À `layer` égal, le dessin suit le même ordre canonique

**VALIDÉ.** `runtime/rendering/scene-renderer.js` part désormais de `hierarchyOrder(scene)`
puis trie par `layer`. `Array.prototype.sort` étant stable :

1. **`layer` décide** — le comportement existant des layers est intact ;
2. **à `layer` égal, l'ordre canonique départage.**

Avant, le départage venait de `scene.objects()`, donc de l'ordre d'insertion : « ce qui
recouvre quoi » était un fait sur l'historique d'une scène, et la même scène sauvegardée puis
rechargée pouvait dessiner une paire dans l'autre sens. C'était le même défaut qu'au §1, sur
un autre consommateur.

**Le Runtime et le renderer partent donc du même ordre canonique.** Il y en a un, pas deux :
laisser le dessin sur l'ordre d'insertion aurait été garder deux ordres pour une seule idée.

### 4. `Scene.objects()` ne change pas

**VALIDÉ.** Il reste le stockage et l'ordre d'insertion, et son API publique est inchangée.
Le rendre canonique aurait été une refonte — le stockage, la sérialisation, le renderer,
l'Editor et l'ensemble de la suite de tests en dépendent — et ADR-0034 §1 avait déjà écarté
cette voie.

### 5. L'invariant d'atteignabilité était violable, et la cause est corrigée à sa source

**VALIDÉ.** Le risque que ce document signalait en S6 n'était pas théorique : il était
atteignable par l'API publique, et **il cassait déjà la sérialisation**.

`Scene.add()` ne plaçait un objet dans les roots que `if (!object.parent)`, sans vérifier que
ce parent appartienne à **cette** Scene. Un objet ajouté alors que son parent est ailleurs
n'était donc ni une racine, ni l'enfant de quoi que ce soit que la scène puisse atteindre.
Mesuré :

```
elsewhere.addChild(orphan);   // `elsewhere` n'a jamais rejoint la scène
scene.add(orphan);

scene.size          → 1
scene.objects()     → ['Orphan']
scene.roots()       → []
hierarchyOrder()    → []          ← invisible au parcours canonique
serializeScene()    → []          ← et déjà perdu à la sauvegarde
```

La scène le détenait, `objects()` le listait, et plus rien d'autre ne le voyait. Tant que le
Runtime itérait `objects()`, il tournait quand même ; en adoptant le parcours canonique, il
aurait **cessé d'être simulé**.

**La correction est dans `Scene.add()`, à la source :** une racine est un objet sans parent
**dans cette Scene**. C'est la moitié manquante d'une condition, pas un repli.

> **Ce n'est pas un repli dans `Runtime.step()`,** et c'est la partie qui mérite d'être
> défendue. Un repli — « puis les objets non atteignables, dans l'ordre où on les trouve » —
> aurait rendu la simulation correcte en masquant le défaut d'ajout qui l'a produit, et aurait
> réintroduit une part d'ordre d'insertion dans l'ordre canonique. ADR-0034 §3.1 l'écrivait
> déjà : aucun repli n'est ajouté pour un objet non atteignable.

Le cas ordinaire est intact : attacher un enfant à un parent qui **est** dans la scène, puis
l'ajouter, donne toujours un enfant et non une racine.

La correction bénéficie à `serializeScene()` autant qu'au Runtime, puisque les deux lisent le
même parcours : un tel objet est désormais écrit dans la scène enregistrée au lieu d'en
disparaître en silence.

---

## Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Un parent s'exécute avant ses enfants | l'enfant peut avoir rejoint la scène le premier |
| L'ordre d'`update` ne dépend pas de l'historique | aller-retour de sérialisation, puis suppression suivie de son inverse |
| Deux chemins de construction, un seul ordre | opérations rejouées contre instantané |
| `layer` prime, l'ordre canonique départage | deux objets de même `layer`, deux objets de `layer` différents |
| Tout objet de la scène est simulé, et écrit | un objet ajouté alors que son parent est ailleurs |
| `Scene.objects()` reste l'ordre d'insertion | assert direct, à côté de chaque assertion d'ordre d'exécution |

---

## Tests

Écrits dans `runtime/runtime.test.js` et `runtime/rendering/rendering.test.js`.

| # | Test | Protège |
|---|---|---|
| S1 | L'ordre d'`update` est identique avant et après un aller-retour de sérialisation | l'ordre est fonction de l'état |
| S2 | L'ordre d'`update` est identique avant et après une suppression suivie de son Operation inverse, par la vraie pipeline | idem, sur le chemin d'undo |
| S3 | Un parent s'exécute avant ses enfants, même si l'enfant a rejoint la scène le premier | la conséquence sémantique du §1 |
| S4 | Le test d'ordre existant de `runtime/runtime.test.js` continue de passer | non-régression du contrat visible |
| S5 | Deux `Runtime` construits par deux chemins différents — opérations rejouées contre instantané — produisent la même trace tout en stockant différemment | **le critère qui justifie l'ADR** |
| S6 | Tout objet d'une Scene est atteignable depuis ses roots, donc simulé et écrit | §5 |
| S7 | Deux objets de même `layer` sont dessinés dans l'ordre canonique | §3 |
| S8 | `layer` continue de primer sur la forme de l'arbre | §3, dans l'autre sens |

Sept de ces huit tests échouent contre l'implémentation précédente, ce qui est la seule
preuve qui vaille qu'ils gardent quelque chose. Le huitième — S8 — passait déjà : il garde
contre une régression future où le départage écraserait le tri par `layer`.

---

## Conséquences

### Positives

- L'ordre d'exécution du moteur cesse d'être une propriété de l'historique d'une scène.
- Le Runtime et le renderer lisent **un** ordre, défini **une** fois, partagé avec le writer.
- Un parent s'exécute avant ses enfants, ce qui est ce qu'une hiérarchie de transforms dit.
- Un objet que la scène détenait sans pouvoir l'atteindre cesse d'exister : il est simulé et
  il est sauvegardé.
- L'écriture croisée d'ADR-0034 §3.3 porte désormais sa garantie multijoueur.

### Négatives

- Le parcours alloue à chaque pas et à chaque frame, là où `objects()` rendait une copie du
  stockage. Le dépôt assume déjà ce coût plutôt qu'un cache, pour la raison que
  `scene-renderer.js` énonce : un cache invalidé à chaque écriture est une optimisation
  spéculative et un état de plus à tenir juste.
- Un contrat écrit change. Aucun composant livré n'en dépendait — un seul possède un
  `update()`, et il est autonome — mais du code écrit à la main contre l'ordre d'insertion
  s'exécuterait maintenant dans un autre ordre.
- `Scene.add()` gagne une condition. Elle ne change que le cas qui était déjà cassé.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Ne rien changer | Tenable tant qu'aucun nœud n'écrit chez un voisin ; intenable dès que `property.setOn` existe |
| Rendre `Scene.objects()` canonique | Écarté par ADR-0034 §1 : refonte du stockage et de tous ses lecteurs |
| Faire maintenir l'ordre canonique par la Scene, de façon incrémentale | Un cache, donc une seconde source de vérité à invalider sur chaque `REPARENT` |
| Trier par `id` | Déterministe, mais l'ordre d'exécution cesserait d'avoir un sens lisible pour un créateur |
| Laisser le dessin sur l'ordre d'insertion | Deux ordres pour une seule idée, et « ce qui recouvre quoi » resterait un fait sur l'historique |
| Un repli dans `Runtime.step()` pour les objets non atteignables | Masquerait le défaut d'ajout qui les produit, et remettrait de l'ordre d'insertion dans l'ordre canonique |
