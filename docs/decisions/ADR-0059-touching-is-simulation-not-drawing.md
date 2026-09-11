# ADR-0059 — Se toucher est un fait de simulation, pas une image

- **Statut :** **accepté** (2026-09-11)
- **Décide :** où vit la détection de collision ; ce qu'un Collider déclare ; ce que la
  première version mesure réellement ; quand un pas décide ses événements ; ce que veulent
  dire `Enter`, `Stay` et `Exit` ; si l'événement est Object↔Object ou Collider↔Collider
- **Dépend de :** ADR-0002 (Transform), ADR-0004 (cycle de vie d'un Component), ADR-0011 (le
  serveur est l'autorité), ADR-0012 (isolation des erreurs), ADR-0013 (la caméra est un
  Object), ADR-0014 §1 (`runtime/`, pas `core/`), ADR-0034 §3.1 et §3.4 (ordre canonique,
  deux familles d'échec), ADR-0046 §6 (une carte, plusieurs moments), ADR-0056 §5 (ce qu'un
  pas fait d'un Object créé ou détruit), ADR-0058 (une exécution peut survivre à un pas)
- **Ne décide pas :** la résolution physique ; les couches de collision ; le collider
  polygonal ; le broad phase — voir §7

---

## 1. Problème

Un créateur peut faire apparaître, déplacer, animer et détruire un Object. Il ne peut pas
savoir que **deux choses se touchent**, donc il ne peut écrire ni un tir qui touche, ni une
pièce ramassée, ni une porte franchie, ni un dégât. C'est la dernière chose qui manque entre
« des objets bougent » et « c'est un jeu ».

Ce qui est demandé ici est **la détection, pas un moteur**. Pas de Box2D, pas de solveur, pas
de corps rigide : savoir que deux objets se recouvrent, et déclencher un graphe.

---

## 2. `runtime/collision/`, pas `core/`, pas `rendering/`

L'argument est celui d'ADR-0014 §1, appliqué une troisième fois :

> « Le Core ne connaît aucun input. Un `Object` n'a pas d'entrées ; une simulation en a. »

Un `Object` ne se cogne pas non plus. Ce qui se cogne est une **simulation**. Et ce n'est
surtout pas du rendu : un overlap est une fonction des `Transform` que le pas vient de
produire, il doit être **identique sur un serveur et sur chaque client**, et un serveur n'a
pas d'écran. Le mettre à côté du `SceneRenderer` ferait dépendre la vérité du jeu de ce qui
est dessiné.

```text
runtime/clock/      quand
runtime/input/      ce qu'on a fait
runtime/random/     la chance
runtime/collision/  ce qui se touche
```

Quatre choses que l'environnement fournirait autrement, quatre dossiers, et le Runtime les
tient toutes.

---

## 3. Ce qu'un Collider déclare, et ce qu'il mesure vraiment

```text
Box Collider
Width        32
Height       32
Offset X      0
Offset Y      0
```

**Déclaré, jamais déduit du Sprite.** Une taille prise sur l'image serait une taille que
personne n'a tapée, changeant quand l'image change, invisible dans l'Inspector — et
« pourquoi ça n'a pas touché ? » n'aurait aucune réponse à l'écran. Un débutant doit pouvoir
**lire** ce qui collisionne.

**Une AABB des coins transformés, et elle le dit.** Les quatre coins passent par
`worldMatrix()` — donc position, échelle et toute la chaîne de parents sont exactes — et la
réponse est la plus petite boîte alignée sur les axes qui les contient. Sous **rotation**,
cette boîte est plus grande que la forme dessinée : un carré tourné de 45° est rapporté ~1,41
fois plus large. C'est une approximation réelle, **conservatrice** (elle ne rate jamais un
vrai contact, elle peut en annoncer un un peu tôt), et l'appeler OBB serait un mensonge dès la
première rotation.

**Se toucher bord à bord n'est pas se recouvrir.** Deux boîtes qui partagent exactement une
ligne ne partagent aucune aire ; compter cela comme un contact ferait qu'un mur posé au
contact d'un autre collisionne pour toujours.

**Pas de `trigger`, pas de `solid`.** Cette tranche ne résout rien : une collision est un
**overlap** et un **événement**. Un booléen sans différence observable serait un mot copié
d'un autre moteur pour promettre un comportement que ce moteur n'a pas.

---

## 4. Un pas décide ses événements avant qu'un seul graphe ne tourne

```text
1.  détecter les overlaps          ← contre les Transform du pas précédent
2.  en déduire Enter / Stay / Exit
3.  exécuter les comportements     ← ordre canonique, Object par Object
4.  clore l'input
```

C'est l'ordre qui rend le cas dangereux correct. Deux balles touchant un ennemi au même pas :
si la détection tournait **après** ou **pendant** les comportements, la seconde verrait un
monde que la première a déjà démonté, et savoir si elle se déclenche dépendrait de l'ordre du
parcours. Décider d'abord rend l'ensemble des événements **immuable pour la durée du pas** :
un `Destroy` dans un callback ne peut pas effacer rétroactivement un événement déjà décidé.

C'est aussi exactement le geste qu'ADR-0056 §5 fait déjà pour l'ordre d'exécution — l'ordre
est matérialisé avant la boucle — appliqué une couche plus haut.

### 4.1 Ce qu'un Object détruit produit : rien

Une paire dont l'un des deux n'est plus dans la Scene **ne produit aucune transition**, pas
même un `Exit`. Deux raisons, chacune suffisante : cela rendrait un handle vers quelque chose
que la Scene ne tient plus, et « ce que tu touchais a cessé de te toucher, parce qu'il a cessé
d'exister » n'est pas une phrase sur laquelle un créateur peut agir. La disparition se lit par
la référence qui meurt, ce qui est la famille qu'ADR-0034 §3.4 définit déjà.

Un Object **créé** pendant un pas n'entre dans aucune paire de ce pas : les overlaps étaient
décidés avant qu'il existe. Il collisionne au pas suivant — la même réponse que celle
qu'ADR-0056 §5 donne déjà pour l'exécution.

---

## 5. Une carte, trois moments, et ils sont disjoints

```text
On Collision
→ Enter     le pas où ils commencent à se toucher
→ Stay      chaque pas SUIVANT, tant qu'ils se touchent
→ Exit      le pas où ils cessent
Other       l'autre Object
```

Une seule carte, comme `On Key` et pour la même raison (ADR-0046 §6) : un créateur doit
distinguer « ça vient de toucher » de « ça touche encore » avant que son premier dégât
fonctionne, et trois cartes presque identiques est le problème qu'une carte n'a pas.

**`Enter` et `Stay` ne se chevauchent pas.** Le premier pas déclenche `Enter` et rien d'autre.
Les déclencher tous les deux ferait de « un dégât » et « un dégât par pas » un seul fil, dont
le créateur devrait soustraire l'autre.

**Object ↔ Object, et le modèle le tranche à notre place.** Un seul Component par type et par
Object (ARCHITECTURE.md) : un second `BoxCollider` est **refusé**. « Un joueur à deux hitboxes
touche un ennemi deux fois » n'est donc pas un cas constructible aujourd'hui. Le détecteur
rassemble néanmoins toutes les formes qu'un Object porte, ce dont un futur `Circle Collider` à
côté d'une boîte aura besoin, sans changer ce contrat.

### 5.1 Un événement peut se produire plusieurs fois dans un pas

Toucher deux ennemis à la fois, c'est **deux** événements avec deux `Other` différents — qu'un
seul déclenchement ne pourrait pas porter. Un nœud d'entrée peut donc répondre une **liste de
déclenchements**, chacun avec ses propres valeurs poussées, et l'interprète en exécute un flux
par entrée. Une liste de **chaînes** reste un déclenchement vers plusieurs ports, ce que
`On Key` répond quand une touche descend et est tenue dans le même pas ; les deux se
distinguent par ce que la liste **contient**, sans drapeau.

---

## 6. Demander plutôt qu'attendre

```text
Is Overlapping
A  object
B  object
→  boolean
```

Il lit **l'instantané du pas**, jamais sa propre géométrie. Mesurer ici serait un second avis
sur ce que « se toucher » veut dire, et répondrait à une autre question que l'événement qui
se déclenche à côté dans le même pas. Rien à interroger — pas de collider, Object détruit,
prise vide — vaut `false` : des états du jeu, pas des fautes (ADR-0034 §3.4).

---

## 7. O(n²), mesuré, et derrière une couture

Toutes les paires sont testées. Mesuré sur ce dépôt, coût d'un pas de détection :

| Colliders | ms par pas | part d'une image à 60 Hz |
|---|---|---|
| 10 | 0,07 | 0,4 % |
| 100 | 0,61 | 3,7 % |
| 500 | 3,9 | 23 % |
| 1000 | 11,3 | 68 % |

**Gardé tel quel.** Jusqu'à quelques centaines de colliders — l'échelle d'un jeu 2D de
débutant — ce n'est pas le problème du jeu. Un quadtree construit aujourd'hui serait une
structure à maintenir correcte pour une échelle que personne n'a encore atteinte.

La surface publique est `overlapping()` et `transitions()`. Un broad phase remplace le milieu
d'`update()` sans qu'aucun contrat ne bouge, le jour où une mesure le demande — et la ligne où
il commencera à le demander est écrite ci-dessus.

---

## 8. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Une boîte monde suit position, échelle et chaîne de parents | `runtime/collision/collisions.test.js` |
| Une rotation donne l'AABB des coins, et elle est plus large | idem |
| Bord à bord n'est pas se recouvrir | idem |
| `Enter` une fois, puis `Stay`, puis `Exit` une fois, jamais ensemble | idem |
| Les deux côtés sont prévenus, chacun de l'autre | idem |
| Object inactif, Collider éteint, aucun Collider : rien | idem |
| La même scène construite dans deux ordres rend les mêmes transitions **dans le même ordre** | idem |
| Sauvegarde/rechargement rend les mêmes paires | idem |
| Une paire dont un Object a disparu ne produit rien | idem |
| Toucher deux choses à la fois est deux événements, chacun son `Other` | `runtime/gameplay.test.js` |
| Deux Objects qui se détruisent au contact : un événement chacun, aucun plantage | idem |
| Un Object détruit ne lève ensuite ni `Stay` ni `Exit` | idem |
| Un Object spawné collisionne au pas SUIVANT | idem |
| `Is Overlapping` répond le même instantané que les événements | idem |
| Deux Runtime voient les mêmes transitions aux mêmes pas | idem |

---

## 9. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **La résolution physique** | Rien ici ne repousse quoi que ce soit. C'est une décision entière — restitution, masse, ordre de résolution, tunneling — et la prendre en passant serait exactement ce qu'ADR-0026 §11 range parmi « les décisions qu'une implémentation hâtive prend à la place de l'architecte » |
| **Les couches de collision** | « qui peut toucher qui » est une fonctionnalité produit ; aujourd'hui un graphe filtre avec `Get Property ▸ Tag`, ce qui est lisible et suffit |
| **Le collider polygonal** | Le modèle ne l'interdit pas ; il attend un besoin |
| **La rotation exacte (OBB)** | §3 le dit plutôt que de le cacher. Un SAT sur deux boîtes orientées est une quinzaine de lignes avec les matrices existantes, et sera un raffinement de `boxesOverlap()` — pas une frontière nouvelle |
| **Le gizmo de collider dans la Scene** | L'Inspector le rend éditable aujourd'hui ; le dessiner demande une couche de gizmos que l'Editor n'a pas |
| **Le broad phase** | §7, avec le chiffre à partir duquel il se justifiera |
