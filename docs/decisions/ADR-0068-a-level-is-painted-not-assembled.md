# ADR-0068 — Un niveau se peint, il ne s'assemble pas

- **Statut :** **accepté** (2026-09-12)
- **Décide :** où vit la grille d'un Tilemap ; ce qui rend ses cellules solides ; comment un Body est arrêté par elles sans qu'on fabrique une boîte par cellule ; comment on peint dans la Scene ; ce que redimensionner veut dire ; ce qu'un passage trop rapide pour un instantané est
- **Dépend de :** ADR-0003 (une Operation par intention), ADR-0004 (un Component, un `update`), ADR-0023 (le Property System), ADR-0024 (undo par ressource), ADR-0025 (le panneau Project), ADR-0034 §3.1 (ordre canonique), ADR-0059 (se toucher est un fait de simulation), ADR-0064 (broad phase), ADR-0067 (Body, solide, balayage)
- **Amende :** ADR-0059 §5 — le cycle de contact gagne une source de plus, et c'est §8 ici
- **Ne décide pas :** autotiling, Wang tiles, rule tiles, génération procédurale, pathfinding, éclairage par tuile, pentes, plateformes à sens unique, tuiles animées, mondes infinis, pipeline de tileset — voir §10

---

## 1. Le problème

`tools/demo/platform.js` construit son monde avec quatre Objects portant quatre Box Colliders.
Pour quatre, c'est honnête. Pour un niveau, c'est une armée : un mur de vingt cellules est vingt
Objects dans la hiérarchie, vingt entrées dans la scène sérialisée, vingt choses à sélectionner
par erreur. Et le `Tilemap` qui existait déjà — une grille qui **dessine** — ne pouvait rien
arrêter.

Trois manques, un seul geste : **peindre le décor, et que ce qui est peint bloque.**

---

## 2. Une seule vérité, et elle a déménagé

```
src/runtime/tilemap/tilemap.js     la grille : cellules, taille, palette, dessin
src/runtime/tilemap/collider.js    ce qui rend ses cellules solides
```

`Tilemap` vivait sous `rendering/`. Le jour où ses cellules arrêtent quelque chose, la physique
aurait dû importer l'arbre du renderer pour savoir où est le sol — une dépendance
`physics → rendering` qu'aucun `layers` n'aurait vue et que personne n'aurait voulue. Le
fichier a donc bougé **à côté** de `collision/` et de `physics/`, et il n'importe rien du
rendu : `draw()` appelle une méthode de ce qu'on lui passe, comme tout Component.

> **Le tableau `tiles` est la seule vérité. Il n'existe ni copie graphique, ni copie
> collision, ni grille d'Editor.**

Le renderer lit les cellules, le solveur lit les cellules, l'outil de peinture écrit les
cellules. Peindre une case la rend bloquante **au pas suivant**, sans reconstruction, parce
qu'il n'y a rien à reconstruire — et c'est vérifié par un test qui peint pendant que le jeu
tourne.

---

## 3. Deux Components, parce qu'il y a deux phrases

```
Tilemap              cette grille se dessine
Tilemap Collider     les cellules non vides de cette grille sont des murs
```

Un ciel étoilé, un décor de fond, un motif de sol : un Tilemap **décoratif** est une chose
réelle, et il l'est en n'ajoutant pas le second Component. La démo en montre un de chaque.

| Décision | Raison |
|---|---|
| **cellule 0 = vide, tout le reste = solide** | Un premier modèle qui sait dire « mur » et « pas mur » est un modèle qu'un débutant utilise. Un matériau par tuile est une décision sur ce **qu'est** une tuile, et elle n'est pas encore prise (§10) |
| **aucun champ `solid` par cellule** | Ce serait quarante mille booléens pour dire ce qu'une seule case à cocher dit déjà |
| **le collider ne porte aucune grille** | Une seconde structure à tenir en phase avec la première est le bug que ce dessin n'a pas |
| **une entrée dans le broad phase, pas quarante mille** | Un Tilemap est **un** Object : le hachage spatial le partitionne comme il partitionne un Object à deux hitboxes (ADR-0064) |
| **les cellules sont matérialisées pour un CORRIDOR** | `tileBoxes()` reçoit la région que le corps peut atteindre pendant ce pas et répond les cellules qui y sont. Le coût suit le personnage, pas la taille du niveau (§7) |

Le contrat du solveur d'ADR-0067 est **inchangé** : X puis Y, le solide le plus proche, aucun
tunneling. Une cellule est une boîte comme une autre — elle arrive simplement plus tard et
seulement si on peut la toucher.

**Un Tilemap ne produit pas d'`On Collision`.** Ses cellules bloquent ; elles ne se recouvrent
avec rien. C'est la même phrase qu'ADR-0067 §3 dit du sol : ce qui **bloque** se demande avec
`grounded`, ce qui **détecte** se demande avec un collider non solide.

---

## 4. Le Transform, et la rotation qu'on refuse d'approximer

Position et échelle sont exactes : elles gardent la grille alignée sur les axes, et l'affichage,
le picking, la peinture et la collision passent tous par la **même** matrice.

```
BLOCKED: collision d'un Tilemap tourné
Reason: une cellule est un carré dans l'espace local ; sous une rotation, sa forme dans le
        monde est un carré tourné, et la seule chose que le solveur sait recevoir est une
        AABB — jusqu'à 41 % trop grande. ADR-0059 §3 a accepté cette approximation pour UN
        collider déclaré qu'un créateur voit et comprend ; l'accepter pour chaque cellule
        rendrait un niveau entier subtilement faux, et « le joueur s'arrête à vingt
        centimètres du mur » est un bug qu'on ne diagnostique jamais.
        Un Tilemap tourné DESSINE tourné et ne bloque rien. Le jour où le balayage sait
        traiter un OBB, c'est ici que ça se branche.
```

---

## 5. Peindre là où le niveau est

> **Le Tilemap sélectionné est le Tilemap qu'on peint. Un clic DANS sa grille peint ; un clic
> ailleurs sélectionne.**

Une phrase, aucun mode, aucun bouton, aucune fenêtre de plus — et toujours une sortie : cliquer
à côté, c'est re-sélectionner. Le viewport route la pression vers l'un ou l'autre outil
(`#toolFor`) ; il n'y a pas de seconde machine à états à tenir en phase avec la première.

| Ce qu'on voit | Comment |
|---|---|
| la grille | son contour toujours, ses lignes intérieures tant qu'une cellule fait plus de cinq pixels |
| la cellule visée | remplie de la couleur active, cerclée d'orange |
| la tuile active | une bande de pastilles sur la surface, la case active cerclée |
| effacer | la première pastille est **Empty** : la choisir et peindre efface |
| ajouter une couleur | la dernière pastille est `+` ; **modifier** une couleur reste la liste de l'Inspector |

**Les cellules entre deux événements de pointeur sont peintes aussi.** Un pointeur est
échantillonné une fois par frame ; un glissé rapide saute des cases, et une ligne trouée n'est
pas ce que quelqu'un a dessiné.

**Un glissé est UN undo** (ADR-0024) : toutes les écritures d'un stroke partagent un `batch`.
Une cellule qui porte déjà la valeur peinte **n'est pas écrite** — repasser dessus ne produit
rien, ce qui est ce qui empêche « un stroke, un undo » de vouloir dire « un stroke, cinquante
opérations qui annulent vers la même grille ».

**`tiles` reste une grille, jamais des centaines de champs d'Inspector.** L'Inspector en dit le
nombre ; ce qui l'édite est la Scene.

---

## 6. Redimensionner, sans cisailler

Une grille est adressée par `row * columns + column`. Écrire `columns` tout seul ne la
redimensionne donc pas : **elle la cisaille** — chaque rangée après la première glisse
latéralement, et un niveau peint pendant dix minutes revient en diagonale.

| Règle | |
|---|---|
| agrandir | ce qui était en (colonne, rangée) y reste ; le neuf est vide |
| réduire | ce qui ne rentre plus est coupé |
| annuler | **rend les dimensions ET le contenu** |

`Tilemap.remap()` est la règle, pure et testée. L'Inspector écrit `tiles` **et** la dimension
dans un seul `batch` (`editor/tilemap.js`) : c'est ce qui donne à l'Operation la grille d'avant
et la grille d'après. Une dimension écrite seule ne saurait annuler que vers « la même taille,
et du vide là où était votre niveau ».

---

## 7. Ce que ça coûte

`node tools/bench-tilemap.mjs` — le même personnage dans le même coin, pendant que le niveau
grandit dix mille fois :

| carte | cellules | corps | ms/pas |
|---|---|---|---|
| 32 × 32 | 1 024 | 1 | 0,027 |
| 100 × 100 | 10 000 | 1 | 0,013 |
| 400 × 400 | 160 000 | 1 | 0,021 |
| 1000 × 1000 | **1 000 000** | 1 | **0,017** |
| 1000 × 1000 | 1 000 000 | 20 | 0,220 |

La colonne des millisecondes ne bouge pas. C'est §3 en chiffres : les cellules demandées sont
celles que le corps peut atteindre.

---

## 8. Un passage n'est pas un recouvrement (contre-épreuve d'ADR-0067)

Un corps qui traverse mille unités en un pas et croise un trigger de quatre unités ne le
recouvre **ni avant ni après**. Deux instantanés ne peuvent pas voir ce passage — et une balle
qui traverse une hitbox à trois mille unités par seconde est exactement cette forme.

> **Trois ensembles, trois questions :**
>
> | ensemble | question | qui le lit |
> |---|---|---|
> | recouvrement | « ces deux-là partagent-ils de l'aire, maintenant ? » | `Is Overlapping` |
> | passage | « ce corps a-t-il traversé ça pendant ce pas ? » | la passe de mouvement |
> | **contact** = les deux | « qu'est-ce qui commence, continue, finit ? » | `Enter` / `Stay` / `Exit` |

La passe de mouvement balaie déjà le chemin ; elle rapporte les croisements, et
`Collisions.update()` les ajoute au **contact** — jamais au recouvrement. `Is Overlapping`
continue de répondre « non » pour une balle qui est déjà passée, parce que c'est vrai.

Le chemin balayé est un **L** — X puis Y — donc chaque branche est un rectangle exact : rien
n'est approximé. Et un croisement n'est rapporté que si le corps ne recouvrait la cible à
aucun bout : un recouvrement au départ a déjà été rapporté par le pas qui commençait là, un
recouvrement à l'arrivée le sera par le suivant.

---

## 9. La démonstration

`tools/demo/tiles.js` — un sol, deux murs, une corniche, un trou et le sol du trou, **peints
dans une seule Tilemap**, plus une seconde Tilemap d'étoiles sans collider. La scène entière
fait **six Objects** : une caméra, le ciel, le niveau, le joueur et deux nœuds de HUD. Il n'y a
pas de `Wall Left` à trouver dedans.

Vérifié dans le navigateur : le personnage tombe sur le sol peint, marche, saute par-dessus le
trou, atterrit sur la plateforme peinte, se cogne sous elle quand il saute dessous, et s'arrête
contre la colonne de cellules qui fait le mur. Et dans l'Editor : ajouter le Component, taper
12 × 8, ajouter une couleur d'un clic, peindre une rangée entière d'un glissé.

---

## 10. Ce que cet ADR ne décide pas

| Refusé | Pourquoi |
|---|---|
| **Autotiling, Wang tiles, rule tiles** | Ce sont des règles sur ce qu'une tuile devient selon ses voisines — un produit, pas une case à cocher |
| **Génération procédurale, mondes infinis / chunkés** | Demandent de décider ce qu'est « une partie du monde », ce que rien n'a encore demandé |
| **Tuiles animées, éclairage par tuile, pathfinding** | Trois systèmes, trois ADR |
| **Pipeline de tileset (une planche au lieu de couleurs)** | La palette est une liste de COULEURS et le reste ainsi pour ce lot. `Sprite` et `animation` savent déjà découper une planche (ADR-0062) : le jour où une palette porte des `ResourceId` de frames, c'est cette liste qui change de type, pas le reste |
| **Matériaux par tuile** | §3 : d'abord « mur » et « pas mur » |
| **Pentes, plateformes à sens unique** | ADR-0067 §6, inchangé |
| **Déplacer un Tilemap sélectionné au glissé** | Dans sa grille, le glissé **peint** (§5). On le déplace par sa Position dans l'Inspector, ou en le désélectionnant d'abord. C'est le prix d'un mode qui n'a pas de bouton |
| **Un stroke sur une carte énorme, côté mémoire** | Une écriture de cellule est une écriture de `tiles`, donc une copie du tableau par cellule touchée : cinquante cases d'une carte de 200 × 200 sont cinquante copies de quarante mille entiers dans l'historique. C'est correct et c'est cher ; le rendre creux demande une Operation d'un genre nouveau (`setCell`), avec son inverse et sa réplication — et personne n'a encore peint une carte de cette taille |

---

## 11. Contre-épreuves

| Vérifié | Où |
|---|---|
| Lire et écrire une cellule ; hors grille on ne lit ni n'écrit rien ; vide vaut 0 | `runtime/tilemap/tilemap.test.js` |
| Un point local nomme sa cellule ; négatif est dehors, pas zéro | idem |
| Agrandir garde tout en place ; réduire coupe ; `remap` est pure | idem |
| Sans collider : on traverse. Avec : on se pose, et sans s'enfoncer en trois cents pas | idem |
| Colonne de cellules = mur, avec glissement ; rangée du haut = plafond ; coin | idem |
| Traverser toute la carte en un pas s'arrête à la première cellule pleine | idem |
| Une cellule vide au milieu d'un mur est une porte | idem |
| Au-delà du bord de la carte il n'y a rien | idem |
| Déplacer la carte déplace ce qu'elle bloque ; la mettre à l'échelle met ses cellules à l'échelle | idem |
| **Une carte tournée dessine et ne bloque rien, et le dit en ne répondant aucune boîte** | idem |
| Deux Tilemaps bloquent, une troisième sans collider non | idem |
| Détruire la carte, ajouter un corps en cours de route | idem |
| **Peindre une cellule la rend bloquante au pas suivant : un seul tableau** | idem |
| Headless, deux Runtime identiques, ordre d'insertion indifférent | idem |
| Une carte de 160 000 cellules : le corridor, pas la carte | idem |
| L'outil n'est vivant que si un Tilemap est sélectionné | `editor/viewport/tools/tile-tool.test.js` |
| Dans la grille il peint, dehors il ne prend pas la pression | idem |
| Une pression peint une cellule ; un glissé peint toutes celles qu'il croise | idem |
| Repasser deux fois sur une cellule ne l'écrit qu'une fois ; repeindre la même valeur n'est pas une édition | idem |
| L'entrée 0 efface ; une pastille choisit ; `+` crée une palette qui n'existait pas | idem |
| Rien n'est jamais écrit hors de la grille | idem |
| La carte se peint là où elle EST, à travers son Transform | idem |
| **Un glissé de cinq cellules = UN undo, et redo remet tout le stroke** | idem |
| **Deux strokes = deux undo** | idem |
| Agrandir/réduire : undo rend la taille ET les cellules coupées ; un resize est une entrée, pas deux | idem |
| Un niveau entier en six Objects, joué par la porte d'un client de jeu | `tools/demo/tiles.test.js` |
| Le mur peint arrête, et il n'existe aucun Object `Wall Left` | idem |
| Le trou est un trou, et les cellules du fond rattrapent la chute | idem |
| La carte décorative n'arrête rien | idem |
| Une cellule peinte pendant la partie devient un mur sans rien reconstruire | idem |
| **Un trigger traversé entièrement en un pas est quand même un contact, et n'est PAS un recouvrement** | `runtime/physics/move.test.js` |

---

## 12. Conséquences

### Positives

- Un niveau se peint dans la Scene, se joue dans Preview, et pèse un Object.
- Rendu et collision restent deux phrases : un décor n'arrête personne.
- Le coût de la collision suit le personnage, pas la taille du monde.
- Redimensionner ne casse plus rien, et s'annule entièrement.
- Une balle rapide ne traverse plus un trigger sans être vue (§8).

### Négatives

- Un Tilemap tourné ne bloque pas (§4).
- Un Tilemap sélectionné ne se déplace plus au glissé (§10).
- Un stroke sur une carte immense coûte cher en historique (§10).
- La palette reste des couleurs : pas encore de vraies tuiles dessinées.
