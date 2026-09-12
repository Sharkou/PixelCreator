# ADR-0070 — Un découpage est une ressource

- **Statut :** **accepté** (2026-09-12)
- **Décide :** où vit le découpage d'une planche de tuiles ; ce qu'une cellule de Tilemap contient ; qui calcule un rectangle de frame ; comment on édite le contenu d'une Resource ; ce qu'un Tilemap dessine quand la caméra ne voit qu'un coin
- **Dépend de :** ADR-0020 (Resource, store, manifeste), ADR-0023 (Property System), ADR-0059 §3 (l'AABB conservatrice), ADR-0062 (une seule table de ressources résolues, `ImageCache`, la grille d'une animation), ADR-0068 (un niveau se peint), ADR-0069 (une écriture n'est pas une intention, `SET_CELLS`)
- **Amende :** ADR-0068 §10 — le pipeline de tileset arrive, et la palette de couleurs s'en va ; ADR-0062 §4 — le `BLOCKED` sur l'édition du payload d'une animation est levé
- **Ne décide pas :** autotiling, Wang/rule tiles, terrains, tuiles animées, propriétés par tuile, collisions par tuile, calques d'objets, import TMX, cartes infinies ou en chunks — voir §11

---

## 1. Le modèle

```
Tileset  (Resource)          Tilemap  (Component)
  source      ResourceId       tileset   ResourceId  ──▶ le Tileset
  tileWidth   16               tileSize  32
  tileHeight  16               columns   60
  columns     4                rows      16
  count       16               tiles[]   [0, 0, 2, 2, 1, …]
```

Une cellule est **un petit entier** : `0` vide, `n` la n-ième tuile de la planche.

| Décision | Raison |
|---|---|
| **le découpage est une Resource** | Deux cartes d'un même donjon nomment **un** `Tileset` ; le recouper les recoupe toutes les deux. C'est l'argument d'ADR-0062 §4 pour un clip et d'ADR-0061 pour un prefab, appliqué à ce dont un niveau est fait |
| **pas de `{source, frame}` répété dans une palette** | Une palette de quatre-vingts entrées aurait été quatre-vingts copies du même `ResourceId` dans **chaque** carte, et une planche recoupée aurait dû être recoupée dans chacune |
| **une cellule ne stocke qu'un index** | Un niveau de quarante mille cellules est quarante mille petits entiers — ce qui rend `SET_CELLS` (ADR-0069 §4) possible et un fichier de projet lisible |
| **1-based, parce que 0 était déjà pris** | `Tilemap` dit depuis toujours que `0` est vide, et le Tilemap Collider ne lit que ça (ADR-0068 §3). Donc la tuile `1` est la première cellule de la planche, et tout le mapping est `tile - 1` |
| **`columns` et `count` sont DÉCLARÉS** | Les dériver de la planche décodée ferait dépendre un rectangle de tuile de la fin d'un décodage : la même cellule serait deux rectangles selon la frame. C'est la règle qu'ADR-0062 §4 a posée pour un clip, et elle vaut ici mot pour mot |

---

## 2. Un seul rectangle, deux lecteurs

`core/frames.js` — `frameRect({ index, frameWidth, frameHeight, columns, first })`.

C'était la boucle privée de `animation.js` jusqu'au jour où un second appelant en a eu besoin :
**c'est le moment où une primitive partagée gagne son fichier**, et pas avant. Une animation
parcourt des cellules le long d'une bande, un tileset indexe des cellules sur une page ; les
deux demandent « la n-ième cellule d'une grille régulière, en travers puis vers le bas », et
deux arithmétiques auraient dérivé d'un pixel sans que personne sache laquelle avait raison.

Une contre-épreuve compare les deux sur quinze cellules de la même grille : elles ne diffèrent
que du décalage de 1, celui que `0 = vide` impose.

---

## 3. Valeurs invalides

Tout est borné **à la construction**, une fois, jamais à chaque lecture :

| Entrée | Résultat |
|---|---|
| `tileWidth: -8`, `tileHeight: 0` | `0` — et `tilesetOf()` refuse la définition |
| `columns: 'four'` | `1` |
| `count: -3` | `0` — un tileset qui ne peut répondre aucun rectangle n'en est pas un |
| pas de `source` | refusé |
| `version` inconnue | refusé, comme un clip, un graphe ou un prefab d'une version inconnue |

Un rectangle de `NaN` atteint un canvas, ne dessine rien et ne rapporte rien : c'est le défaut
que ce bornage existe pour empêcher.

---

## 4. Le créer depuis une image

`+ ▸ Graphics ▸ Tileset…` — le même geste que `Animation…` (ADR-0062 §4) : choisir la planche,
qui est importée **et** découpée. Le défaut est **seize pixels par cellule**, les colonnes et le
compte suivant de la taille du fichier.

Ce n'est pas une détection : c'est ce que fait toute planche de tutoriel, **dit comme une
supposition** et corrigible en une ligne. Un créateur dont les tuiles font 32 a deux nombres à
changer dans l'Inspector — ce qui est mieux qu'une détection juste quatre fois sur cinq et
inexplicable la cinquième.

---

## 5. Éditer ce qu'une ressource contient

Deux ressources structurées voulaient être modifiées — une animation et un tileset — et aucune
n'a de fenêtre à elle. C'était le moment de la petite primitive générique, pas avant :

```
Project.setPayload(id, payload)  →  SET_PAYLOAD  →  store.write + revision
```

| Décision | Raison |
|---|---|
| **une Operation, pas `save()`** | `save()` écrit ce qu'un modèle vivant a déjà décidé et n'est **pas** annulable : une sauvegarde n'est pas une intention (ADR-0069 §2). Ceci est l'autre moitié — un créateur qui édite le contenu lui-même — donc ça passe par le pipeline : arbitré, répliqué, annulable |
| **remplacé en entier** | Ces payloads sont petits et plats. Le jour où l'un ne l'est plus, `SET_CELLS` est la forme à copier |
| **l'écriture passe par le constructeur du genre** | `createTileset({ ...payload, tileWidth: -8 })`, jamais `{...payload, x}` : une ressource éditée dans l'Inspector et une créée par le menu ne peuvent pas avoir deux formes |
| **la révision bouge avec** | Ce qui regarde la ressource se reconstruit exactement comme après une sauvegarde |
| **le dessin reçoit un contexte** | `component.draw(self, renderer, { resources })` — la même registry qu'un pas de simulation, résolue **avant** la frame (ADR-0062 §1). Jamais une lecture de store pendant qu'on dessine |

---

## 6. Le culling

Le renderer répond `visibleBounds()` : le rectangle de **l'espace en cours de dessin** que la
surface couvre. Un Tilemap en tire une plage de lignes et de colonnes.

`node tools/bench-tilemap.mjs` :

| carte | cellules | caméra | cellules inspectées | dessinées | ms/frame |
|---|---|---|---|---|---|
| 100 × 100 | 10 000 | 0,0 | 651 | 651 | 0,08 |
| 1000 × 1000 | 1 000 000 | 0,0 | 651 | 651 | **0,013** |
| 1000 × 1000 | 1 000 000 | 500,500 | 651 | 651 | 0,017 |
| 1000 × 1000 | 1 000 000 | 975,975 | 525 | 525 | 0,013 |

**Contre-épreuve** : un backend qui ne sait pas dire ce qu'il montre dessine la grille entière —
1 000 000 de cellules, 24,1 ms pour **une** frame. C'est ce que faisait le Tilemap avant cette
ligne, et ce n'est jamais faux, seulement lent.

Quatre coins, pas deux : sous une transformation tournée, le rectangle de l'écran est un
quadrilatère tourné dans l'espace dessiné, et sa boîte englobante est la seule réponse honnête
pour qui itère des lignes et des colonnes — conservatrice, jamais courte (la même approximation
qu'ADR-0059 §3 accepte pour un collider tourné).

---

## 7. Changer de Tileset

Une carte peinte avec quatre-vingts indices, pointée vers une planche qui en a vingt :

- `tiles` n'est **pas touché** — le niveau n'est pas corrompu, seulement dépeint ;
- les cellules au-delà de la planche **ne dessinent rien** : aucune substitution, aucune frame
  de remplacement. Mettre un mur là où le créateur a peint une porte, sans le dire, serait pire
  que de ne rien mettre ;
- elles restent **occupées**, donc elles bloquent toujours (ADR-0068 §3) ;
- le créateur peut les repeindre : ce sont des cellules comme les autres.

---

## 8. Choisir une tuile

Le sélecteur de la Scene montre **les vraies tuiles**, découpées dans la planche que la carte
dessine : on choisit un mur en regardant un mur. C'est un **sélecteur**, pas un éditeur —
changer ce qu'un tileset **contient** reste les lignes de l'Inspector.

Une page fixe de trois rangées, et deux flèches quand la planche en demande plus : cinq cents
miniatures recouvriraient la scène qu'on est en train de peindre. **Choisir une tuile ne produit
aucune Operation** : regarder un autre mur n'est pas une modification du niveau.

---

## 9. Ce qu'il advient de la palette de couleurs

**Supprimée.** Il ne reste pas un modèle de couleurs à côté d'un modèle de tuiles : le projet
est en développement, et une dette permanente coûte plus cher qu'une migration franche. Ce que
l'ancienne palette servait — « cette cellule est verte » — est dit mieux par une planche, et la
démo `tools/demo/tiles.js` est passée de trois couleurs à quatre tuiles dessinées.

Les tests de `<px-list>` qui s'en servaient comme sujet portent maintenant sur une liste
déclarée dans le test lui-même : le contrôle est **générique**, et l'épingler au composant
livré qui déclare un élément ce jour-là est ce qui a fait échouer ce fichier pour une raison
qui n'avait rien à voir avec les listes.

---

## 10. Persistance, Preview, export

Rien de spécial nulle part. Un `Tileset` est une Resource : il est dans le manifeste, son
payload est dans le store, il traverse l'autosave IndexedDB, le canal live et le bundle
`.pxgame.json` **comme les autres**. La planche voyage parce que c'est une ressource que le
projet déclare — exactement comme la planche d'un `Sprite` ou d'une animation.

---

## 11. Ce que cet ADR ne décide pas

| Refusé | Pourquoi |
|---|---|
| **Autotiling, Wang tiles, rule tiles, terrains** | Des règles sur ce qu'une tuile devient selon ses voisines : un produit, pas une case à cocher |
| **Tuiles animées** | Un clip par cellule demande un playhead par cellule ; le modèle de cette tranche est « une cellule est un entier » |
| **Propriétés ou collisions par tuile** | ADR-0068 §3 a tranché : vide ou pas vide. Une échelle, un piège ou une pente sont chacun une décision sur ce qu'**est** une tuile |
| **Calques d'objets, import TMX** | Des formats, donc des pipelines |
| **Cartes infinies / en chunks, génération procédurale** | Rien ne les demande : une carte d'un million de cellules coûte déjà 0,013 ms par frame (§6) |
| **Un `SET_PAYLOAD` par champ** | Ces payloads sont quatre nombres. Un patch par champ serait la machinerie de `SET_CELLS` pour une ligne d'Inspector |

---

## 12. Contre-épreuves

| Vérifié | Où |
|---|---|
| Un tileset est de la donnée plate qui survit à un aller-retour JSON | `core/tileset.test.js` |
| Ses valeurs par défaut, et le bornage de tout ce qui n'a pas de sens | idem |
| Pas de planche, version inconnue : refusés | idem |
| La tuile 0 est vide et n'est pas la première | idem |
| Première, dernière, deuxième rangée, colonne d'une seule tuile | idem |
| Un compte qui n'est pas un multiple des colonnes s'arrête où il le dit | idem |
| Une tuile au-delà de la planche n'a aucun rectangle | idem |
| **Un tileset et une animation découpent la même grille en les mêmes rectangles** | idem |
| La primitive elle-même : en travers puis vers le bas, `first`, et rien sans taille de cellule | idem |
| Une cellule vide ne dessine rien ; une tuile dessine son propre rectangle de la planche | `runtime/tilemap/tilemap.test.js` |
| Une tuile absente de la planche ne dessine rien, et le niveau n'est pas corrompu | idem |
| Pas de tileset, un inconnu, une registry muette : rien ne casse | idem |
| Une planche en cours de décodage est demandée par identité, une fois | idem |
| **Seules les cellules visibles sont dessinées**, et la plage suit la caméra | idem |
| **Contre-épreuve** : sans `visibleBounds`, la grille entière | idem |
| **Le collider n'apprend jamais qu'un tileset existe** | idem |
| Un tileset créé depuis une planche, grille lue dans le fichier ; en-tête muet ; refus d'inventer | `editor/project/commands.test.js` |
| L'Inspector nomme la planche et laisse taper le découpage | `editor/inspector/resource.test.js` |
| Une édition passe par le constructeur du genre, donc le n'importe quoi est borné | idem |
| **Une édition de payload est une intention annulable, et la révision bouge avec** | idem |
| Une miniature choisit ce qui est peint, **et choisir n'est pas une édition** | `editor/viewport/tools/tile-tool.test.js` |
| Une miniature est la tuile elle-même, découpée dans la planche de la carte | idem |
| Une planche trop grande pour une page est paginée | idem |
| Sans tileset : Empty seul, et peindre marche quand même | idem |
| Le niveau est une planche, un découpage et deux cartes qui le nomment | `tools/demo/tiles.test.js` |
| **Le bundle exporté porte la planche, sans chemin spécial** | idem |

---

## 13. Conséquences

### Positives

- Un niveau graphique se peint dans la Scene et se joue dans Preview, sans une ligne de code.
- Le découpage d'une planche existe **une fois**, et deux cartes le partagent.
- Une carte d'un million de cellules coûte ce qu'une fenêtre montre.
- Le contenu d'une Resource structurée est enfin éditable — et annulable.
- Une seule arithmétique de frame pour l'animation et les tuiles.

### Négatives

- La palette de couleurs n'existe plus : un projet qui en avait une perd ses couleurs (§9).
- Un Tilemap tourné ne bloque toujours pas (ADR-0068 §4) et son culling est conservateur (§6).
- `SET_PAYLOAD` remplace le payload entier : deux créateurs éditant le même tileset en même
  temps s'écrasent l'un l'autre, ce que la collaboration n'a de toute façon pas encore décidé.
