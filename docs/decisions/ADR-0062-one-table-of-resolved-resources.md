# ADR-0062 — Une seule table de ressources résolues, et le backend répond des pixels

- **Statut :** **accepté** (2026-09-12)
- **Décide :** qui transforme un `ResourceId` en image décodée ; ce que `drawImage()` reçoit ; où vit le cache ; ce qu'un Sprite mesure ; comment une animation est décrite ; où vit un clip ; pourquoi il n'y a pas de `flipX`
- **Dépend de :** ADR-0004 (capacités optionnelles), ADR-0005 (le rendu passe par une abstraction), ADR-0007 (schéma), ADR-0012 (isolation), ADR-0020 (Resource, store asynchrone), ADR-0021 (identité d'une définition), ADR-0026 §1 (une ressource porte son contenu), ADR-0050 (le flip est une rotation hors du plan), ADR-0060 §5 (le son est une sortie construite avec un résolveur), ADR-0061 §4 (les définitions sont résolues avant la simulation)
- **Amende :** ADR-0061 §4 — `PrefabRegistry` devient `ResourceRegistry`, une table pour tous les genres de définition
- **Ne décide pas :** l'atlas à rectangles libres, le pivot par frame, la durée par frame, l'import Aseprite, les os, le chargement de polices — voir §6

---

## 1. Problème

Trois manques, et le premier était un **trou** plutôt qu'une fonctionnalité absente :

```
Sprite.source = ResourceId        ← ce qu'un créateur choisit
Sprite.image  = null              ← ce que le rendu lit
                                  ← et rien, nulle part, ne reliait les deux
```

Un `grep` sur `new Image|createImageBitmap|\.image =` ne trouvait que l'initialisation à
`null`. **Un Sprite n'a jamais rien dessiné, dans aucun build.** Le Component n'était pas en
cause : il manquait la moitié qui résout.

Les deux autres suivaient : sans image, pas d'animation ; et une animation aurait amené un
`AnimationRegistry` à côté du `PrefabRegistry`, puis un troisième, puis un quatrième.

---

## 2. Le backend répond des pixels ; le modèle ne porte qu'une identité

> **`drawImage(source, …)` reçoit un `ResourceId`. Le backend le résout.**

C'est la troisième application d'un seul joint, pas un troisième joint :

| | résolu par | rempli par | lu | valeur tenue |
|---|---|---|---|---|
| son | `AudioOutput` construit avec un résolveur | l'application | `play(clip)` | `HTMLAudioElement` |
| prefab / animation | `ResourceRegistry` | `loadDefinitions()` | `ctx.resources.get(id)` | des données |
| **image** | **`ImageCache` construit avec un résolveur** | l'application | `drawImage(id, …)` | `ImageBitmap` |

**Pourquoi le backend et pas le Component.** Un `ImageBitmap` est une valeur de Canvas 2D ; un
backend WebGL tiendrait une texture GL. Poser l'une des deux dans `Sprite.image`, c'était
mettre une valeur **non sérialisable et spécifique à un backend** dans le modèle. En donnant
l'identité au backend, un Sprite reste exactement ce que le format écrit.

**Décoder est asynchrone, dessiner ne l'est pas.** `get(id)` répond ce qui est décodé **à cet
instant** — l'image, ou `null` — et lance le décodage à la première demande. Une frame qui
arrive avant l'image ne dessine rien et la suivante dessine. Rien n'attend, rien ne bloque, et
`draw()` ne touche aucun stockage.

**`preload()` existe pour qui PEUT attendre.** Ouvrir un bundle et appuyer sur Play sont deux
moments où l'attente est permise et où une première frame trouée ne l'est pas. Tout ce qui est
importé ensuite arrive par `get()`, une frame plus tard et sans attente.

**Le résolveur d'image peut être asynchrone, celui du son non**, et la différence est réelle :
un son démarre **depuis un pas** et doit répondre tout de suite, une image est décodée hors du
chemin de frame de toute façon. L'Editor passe donc `project.read` lui-même et ne recopie
aucun payload.

**Un hôte sans API image n'est pas une panne.** Pas de `createImageBitmap`, pas de `Image` :
chaque `get()` répond `null`, la simulation est identique et rien n'est dessiné — la phrase que
`SilentAudio` fait déjà pour le son.

### Ce que le cache garantit

| Cas | Réponse |
|---|---|
| cent Sprites sur une image | **un** décodage |
| ressource absente | mémorisée absente ; le projet n'est pas relu soixante fois par seconde |
| image illisible | échec mémorisé, tentée **une** fois, rien n'est levé (ADR-0012) |
| payload remplacé | `invalidate(id)` ; la `revision` est ce qui le déclenche (ADR-0020 §7) |
| invalidée pendant un décodage | l'image qui finit n'appartient à personne : elle est fermée |
| `clear()` | tout est relâché (`ImageBitmap.close()`) |

---

## 3. Une seule vérité sur la taille : `0` veut dire « celle de l'image »

`Sprite.width` / `height` valaient `0` par défaut et `0` voulait dire **invisible** — donc un
Sprite ajouté depuis le menu ne dessinait rien même une fois l'image résolue, et la règle de
drop inventait un `64 × 64` qui n'était vrai d'aucune image.

> **Zéro veut dire « la taille de l'image », pas « rien ».**

| Déclaré | Dessiné |
|---|---|
| les deux | exactement ça — une image étirée exprès |
| **un seul** | celui-là, l'autre **en proportion de ce qui est réellement dessiné** |
| aucun | la frame, ou l'image entière |
| pas encore décodée | rien cette frame, et la suivante dessine |

**La proportion vient de la FRAME, pas de la planche.** Une bande de 320 × 32 contenant dix
frames de 32 × 32 est dix carrés ; mettre à l'échelle l'une d'elles avec le ratio de la bande
rendrait un personnage dix fois trop large.

**`imageSize(source)` est une opération du contrat de rendu**, et c'est légitime là où
`measureText` ne l'était pas (ADR-0060 §3) : la taille d'une image est un **fait sur la
ressource**, identique dans tous les backends, alors que la métrique d'un texte dépend de qui
rastérise. `bounds()` lit la dernière taille réellement dessinée ; un Object jamais dessiné ne
rapporte rien, et le picking retombe sur le carré de poignée qu'il donne déjà à un Object sans
géométrie.

---

## 4. Une animation est une Resource, et son rectangle est une fonction pure

```js
Walk.animation
{ version: 1, source, frameWidth, frameHeight, count, columns, first, fps, loop }
```

**Une Resource, pas un champ par instance.** Dix ennemis qui jouent `Walk` nomment un clip ;
le retimer les retime tous, et une instance porte un `ResourceId` au lieu d'une copie. C'est
l'argument d'ADR-0026 §1 pour un `.px` et celui d'ADR-0061 pour un prefab.

**`columns` est DÉCLARÉ, jamais mesuré**, et c'est ce qui rend `frameAt()` pure. Le dériver de
la largeur de la planche décodée ferait dépendre un rectangle de frame de l'état d'un
décodage — la même frame serait deux rectangles avant et après l'arrivée de l'image — et
mettrait le renderer à l'intérieur d'une fonction du Core. La forme d'une planche est un fait
que son auteur connaît.

**La tête de lecture est en SECONDES, jamais un index de frame.** La même durée écoulée donne
la même frame à 30 et à 144 images par seconde, parce que la division est faite une fois plutôt
qu'accumulée soixante fois par seconde en index arrondi. C'est ce qui fait d'une animation une
partie de la simulation déterministe plutôt qu'une décoration posée dessus.

**Lire puis avancer, jamais l'inverse.** Avancer d'abord, c'est afficher la frame 1 dès le
premier pas : la frame d'ouverture de toute animation n'est jamais montrée. La frame affichée
est celle du temps où la simulation **est** ; l'horloge bouge ensuite.

### `SpriteAnimator`, et pas vingt champs de plus sur `Sprite`

Un Sprite répond « quelle image, quelle taille » ; un animateur répond « quelle frame, et
quand ». Deux questions, deux durées de vie, deux Components — et un Object qui veut les deux
le dit en portant les deux. L'animateur écrit `Sprite.source` **et** `Sprite.frame` : le clip
nomme sa propre planche, donc les deux ne peuvent pas être en désaccord.

### Un seul nœud, et il existe pour la seule chose que `Set Property` ne peut pas dire

`SpriteAnimator.clip` est une propriété `resource` ordinaire, donc choisir une animation est
déjà `Set Property` — et par le raisonnement d'ADR-0060 §6 cela aurait dû suffire. Cela ne
suffit pas, pour une raison qu'un créateur rencontre en une minute : **écrire deux fois la même
valeur est un no-op**, donc « rejoue l'attaque » ne ferait rien du tout. Redémarrer est un
**moment**, et un moment est un nœud.

`Animation Finished` est une **question**, posée depuis `On Update`, et pas un événement : un
nœud d'entrée est exécuté à chaque update (`interpreter.js`), donc un événement one-shot
demanderait une mémoire par nœud et par instance — le second genre d'état qu'ADR-0058 n'a
délibérément pas.

### Un clip naît d'une planche, parce qu'il ne peut naître de rien d'autre

Le `+` du panneau Project propose `Animation…`, **à côté d'`Image…` et par le même
mécanisme** : la rangée déclare qu'elle a besoin d'un fichier, le panneau le demande, et la
rangée fabrique **deux** ressources — la planche importée et le clip qui la nomme.

| Décision | Raison |
|---|---|
| la rangée **choisit une image** | un clip sans planche ne nomme aucune frame. Une entrée de menu qui crée une ressource inerte est exactement le « menu qui n'ouvre rien » que `project/commands.js` refuse depuis ADR-0025 |
| la grille est **lue dans l'en-tête du fichier** | `project/image.js` sait déjà répondre « combien de pixels » sans décoder ; une bande de carrés est la forme de toute planche exportée par Aseprite ou Piskel |
| un en-tête muet donne 32 x 32, une frame | visiblement faux dès la première lecture, plutôt qu'invisiblement faux pour toujours |
| **deux ressources, deux annulations** | ce sont deux intentions `add` ; en faire une seule serait décider ce qu'est un geste, et ce n'est pas la décision de cette rangée |

L'Inspector dit ensuite ce qu'un clip **est** — sa planche par son nom, sa grille, sa vitesse,
sa boucle — en lecture seule, comme tout ce qui n'est pas le nom (§ en tête de
`editor/inspector/resource.js`).

```
BLOCKED: régler la grille d'un clip dans l'Editor
Reason: il manque le contrat qui rend un PAYLOAD de ressource éditable depuis l'Inspector.
        Aujourd'hui, seul un `.px` l'est, et seulement parce que le Workspace lui attache un
        MODÈLE VIVANT (`editor/project/definitions.js`) dont chaque champ est réactif et dont
        chaque écriture passe par le pipeline de cette ressource — c'est ce qui donne l'undo
        par ressource d'ADR-0024. Une animation n'a pas de modèle de ce genre, et en inventer
        un pour quatre nombres reviendrait à écrire la moitié d'un éditeur d'animation sans
        décider de l'autre moitié (§6 : timeline, aperçu, découpage).
        Ce qui est livré entre-temps : la grille devinée à la création, et `saveAnimation()`
        dans la couche Project pour qui l'écrit par l'API.
```

---

## 5. Pas de `flipX`, et ce n'est pas un oubli

ADR-0050 a **retiré** `flipX`/`flipY` en montrant qu'une projection orthographique fait d'une
rotation autour de l'axe vertical **exactement** une mise à l'échelle horizontale par `cos θ`.
`Transform.rotationY = 180°` est donc un miroir exact, déjà sérialisé, déjà testé, déjà dans
l'Inspector — et il sait dire `45` là où un booléen ne sait dire que « de dos ».

Le contrat de rendu a donc `clip` (ce qu'une planche exige) et **rien** pour le miroir.

---

## 6. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Atlas à rectangles libres** | Une grille régulière est la forme de toutes les planches de tutoriel ; un atlas est un pipeline, et un pipeline est un produit |
| **Pivot / durée / trim par frame** | Chacun est une décision sur ce pipeline |
| **Import Aseprite, os, squelettes** | Idem, en plus gros |
| **Mipmaps, filtrage, atlas de textures** | Optimisations de rendu ; rien ne les demande encore |
| **Éditeur d'animation dans l'Editor** | Un clip se **crée** depuis le panneau Project (§4) et s'inspecte ; le **régler** demande une timeline et un modèle vivant de ressource — voir le `BLOCKED` de §4, et ADR-0026 qui range déjà la timeline parmi les fenêtres non conçues |
| **Chargement de polices** | ADR-0060 §8, inchangé |

---

## 7. Contre-épreuves

| Vérifié | Où |
|---|---|
| Une image est demandée synchroniquement et arrive un tour plus tard | `runtime/rendering/images.test.js` |
| Cent demandes, un décodage | idem |
| Ressource absente : lue **une** fois, jamais soixante fois par seconde | idem |
| Image illisible : échouée une fois, rien n'est levé | idem |
| Invalidation : relecture, et l'ancienne image est fermée | idem |
| **Contre-épreuve** : sans invalidation, les anciens pixels restent | idem |
| `preload()` compte ce qui est utilisable | idem |
| Résolveur asynchrone (le chemin de l'Editor) | idem |
| Hôte sans API image : rien, et rien ne casse | idem |
| Le backend reçoit l'identité et dessine ce qu'il a résolu | idem |
| `clip` dessine un rectangle de la planche | idem |
| Image pas encore arrivée : rien n'est dessiné | idem |
| Taille naturelle, une dimension donnée, aucune | idem |
| Un prefab spawné montre son image à la frame où il apparaît | idem |
| Grille de frames, `first`, bande simple, clip sans cellule | `runtime/rendering/components/sprite-animator.test.js` |
| Version inconnue refusée | idem |
| Boucle, non-boucle, `fps: 0` | idem |
| Même temps écoulé à deux tailles de pas | idem |
| Pause, vitesse, changement de clip, clip supprimé | idem |
| Animateur sans Sprite, Runtime sans resources | idem |
| La tête de lecture n'atteint jamais le format | idem |
| `Play Animation` redémarre ce que `Set Property` ne redémarrerait pas | idem |
| `Animation Finished` sur un Object sans animateur | idem |
| Un clip est créé depuis une planche, et la grille vient de l'en-tête | `editor/project/commands.test.js` |
| La planche est importée avec lui, octet pour octet | idem |
| Un en-tête illisible donne quand même un clip jouable | idem |
| La rangée refuse d'inventer une planche | idem |
| **Contre-épreuve** : deux ressources sont deux annulations, et c'est dit | idem |
| L'Inspector nomme la planche, la grille, la vitesse, la boucle | `editor/inspector/resource.test.js` |
| Une planche supprimée est dite « Missing », jamais un identifiant | idem |
| Un prefab dit combien d'Objects il ferait | idem |

---

## 8. Conséquences

### Positives

- **Un Sprite dessine.** Le trou le plus ancien du dépôt est fermé.
- Une seule table de définitions résolues, un seul chargeur, une frontière de moins à tenir.
- La taille d'un Sprite a une vérité unique et un défaut utile.
- Une animation partagée est une Resource partagée.
- Le Core ne connaît toujours ni DOM, ni stockage, ni décodeur.

### Négatives

- `RENDERER_OPERATIONS` gagne `imageSize`, et `drawImage` change de premier argument : tout
  backend et tout double de test doit suivre.
- `PrefabRegistry` est renommé `ResourceRegistry` et `Runtime({ prefabs })` devient
  `Runtime({ resources })` — une tranche de six semaines l'aurait payé plus cher.
- `bounds()` d'un Sprite jamais dessiné répond `null` ; le picking retombe sur le carré de
  poignée, ce qui est correct et visible.
- `columns` est un champ qu'un créateur doit remplir, là où mesurer aurait paru automatique.
