# ADR-0067 — Un mur qui arrête vraiment

- **Statut :** **accepté** (2026-09-12)
- **Décide :** ce qui bouge et ce qui bloque ; où le mouvement arrive dans un pas ; comment un corps est arrêté sans traverser ; ce que `grounded` veut dire ; ce qui reste hors du moteur
- **Dépend de :** ADR-0002 (l'espace du parent), ADR-0004 (un Component, un `update`), ADR-0011 (pas fixe), ADR-0014 (l'input est un argument), ADR-0034 §3.1 (ordre canonique), ADR-0057 (déterminisme), ADR-0059 (se toucher est un fait de simulation), ADR-0064 (broad phase, et la preuve différentielle)
- **Amende :** ADR-0059 §9 — la réponse physique arrive, dans sa forme la plus petite ; le `trigger` qu'ADR-0059 refusait devient `solid`, parce qu'il a enfin un sens observable
- **Ne décide pas :** masse, restitution, frottement, rotation physique, joints, pentes, plateformes mobiles, dépénétration — voir §6

---

## 1. Le trou

Le moteur savait dire **que** deux choses se touchent. Il ne savait pas **les empêcher** de se
traverser. Un créateur qui voulait un sol devait écrire lui-même, dans un `.px`, la comparaison
de deux rectangles et la correction de sa propre position — c'est-à-dire écrire un solveur dans
un langage de nœuds conçu pour ne pas en avoir besoin.

Rien de ce qui existait n'était faux. Ce qui manquait était la troisième phrase :

```
1. A recouvre B                      collider.js        un fait géométrique
2. Enter / Stay / Exit               collisions.js      un cycle de contact
3. B empêche A d'avancer             move.js            une réponse physique   ← manquait
```

---

## 2. Trois mots, et un débutant peut montrer chacun du doigt

```
Player  ▸ Body                    cet objet bouge, et le monde peut l'arrêter
Player  ▸ Box Collider ▸ Solid ✓  ce qui l'arrête, et ce qu'il arrête
Coin    ▸ Box Collider ▸ Solid ✗  ne bloque rien, et signale quand même le contact
```

C'est **tout** le modèle. Pas de `RigidBody`, pas de `CharacterController`, pas de `PhysicsMaterial`,
pas de `layer mask`. Un créateur n'apprend pas un vocabulaire de moteur physique ; il coche une
case et ajoute un Component.

| Décision | Raison |
|---|---|
| **`Body` ne porte aucune vitesse** | `Velocity` la porte déjà — dans l'Inspector, dans le schéma, dans `Get Property` et dans toutes les scènes déjà sauvegardées. Deux paires de nombres seraient deux réponses à une question, et celle que le créateur voit serait la mauvaise une fois sur deux |
| **`Body` sans `Velocity` ne bouge pas** | Il n'y a nulle part où accumuler une vitesse. C'est la famille qu'`SpriteAnimator` sans `Sprite` a déjà (ADR-0062 §4) : un Component qui écrit dans un autre ne s'invente pas de second foyer |
| **`gravity` est sur le corps, et vaut 0 par défaut** | Un jeu vu de dessus est aussi courant qu'un platformer, et ce moteur ne fait jamais ce qu'on ne lui a pas demandé — la doctrine que `Velocity` énonce depuis le premier jour. Une gravité de monde serait un réglage global que personne n'a conçu, et interdirait l'ennemi volant |
| **`solid` est vrai par défaut** | Une boîte qu'un créateur dessine autour d'une caisse **est** une caisse. Le débutant qui veut un mur ne tape rien ; celui qui veut une pièce à ramasser décoche une case et garde tous ses `On Collision` |
| **`grounded` est calculé, donc en lecture seule** | C'est la réponse à « est-ce que je suis posé sur quelque chose », et seule la passe qui l'a arrêté peut la connaître |

---

## 3. Trois idées, trois fichiers, une seule géométrie

```
broad-phase.js   quelles paires valent la peine d'être testées
collisions.js    lesquelles se recouvrent, et laquelle vient de commencer ou de finir
move.js          quel mouvement a le droit d'avoir lieu
       ╲              │              ╱
        collidersOf(scene)   — une marche, trois lecteurs
```

`collidersOf()` est la seule chose partagée : la même liste, dans le même ordre canonique, avec
les mêmes règles sur ce qui est éteint. Une seconde marche qui aurait dérivé de celle-là serait
**deux réponses différentes à « qu'y a-t-il dans cette scène »**.

**`Is Overlapping` répond toujours à une question de géométrie**, jamais à « une résolution
a-t-elle eu lieu ». Et `Enter` / `Stay` / `Exit` sont exactement ce qu'ils étaient : un test
différentiel l'aurait dit s'ils avaient bougé.

**Conséquence assumée : se poser sur le sol ne lève aucun `On Collision`.** Un corps arrêté par
le sol finit **collé** à lui — ils partagent une arête et aucune aire — et « se toucher n'est pas
se recouvrir » (ADR-0059 §3). C'est ce qui rend le modèle lisible : ce qui **bloque** se demande
avec `grounded`, ce qui **détecte** se demande avec `On Collision`, et un collider ne fait jamais
les deux à moitié.

---

## 4. L'ordre d'un pas, et pourquoi le mouvement est en dernier

```
1. Collisions.update(scene)     contre les Transforms que le pas précédent a laissés
2. chaque Component, puis le graphe lié à son type, en ordre canonique
3. moveBodies(scene, dt)        gravité → intégration → balayage → résolution → grounded
4. input.commit()
```

**Le mouvement est APRÈS les graphes, et c'est la décision principale de cet ADR.** Si un corps
était déplacé pendant la marche des Components — ce que faisait `Velocity` — alors un graphe qui
lit une touche et écrit une vitesse **plus loin dans la même marche** serait intégré au pas
suivant : le personnage répondrait une frame en retard, pour une raison invisible à l'écran. Le
test `'a speed written during the step moves the body in that same step'` et sa contre-épreuve
mesurent exactement cet écart.

**La détection reste au début**, contre les positions du pas précédent (ADR-0059 §4) : un
`Destroy` dans un callback de collision ne peut toujours pas réécrire les événements que le pas
avait déjà décidés.

**`grounded` est écrit à l'étape 3 et lu à l'étape 2 du pas suivant.** Ce n'est pas un retard :
« suis-je posé » ne peut pas être connu avant d'avoir bougé. Un saut déclenché à la frame N est
intégré à la frame N — la touche et le mouvement sont dans le même pas.

**Un balayage, un axe à la fois, X puis Y.** La distance autorisée est le plus petit **écart**
jusqu'à un solide devant, jamais une position échantillonnée après le déplacement :

- **rien ne traverse.** Mille unités en un pas contre un mur de quatre unités s'arrêtent au mur,
  parce que l'écart vaut ce qu'il vaut quelle que soit l'épaisseur. Aucun sous-pas — un
  sous-découpage ferait dépendre le résultat du nombre de sous-pas.
- **ça glisse, sans que personne n'écrive une projection.** Seul l'axe bloqué est arrêté, et
  seule sa vitesse est annulée. Pour une boîte alignée contre un mur aligné, « annuler la
  composante normale, garder la tangentielle » **est** cela, en deux soustractions.

**Les corps sont résolus en ordre canonique, l'un après l'autre**, chacun voyant où les
précédents se sont arrêtés. C'est un contrôleur de personnage, pas un solveur simultané : aucun
nombre d'itérations à régler, et l'alternative demanderait la masse et l'impulsion que §6 refuse.

---

## 5. L'Inspector et les graphes n'ont rien appris de neuf

`gravity` est un nombre, `solid` une case, `grounded` un booléen en lecture seule : trois lignes
que l'Inspector dessine avec les contrôles qu'il a déjà (ADR-0023). **Aucun nœud n'a été ajouté.**

Le contrôle d'un platformer s'écrit avec ce qui existait :

```
On Key ArrowLeft  ▸ Down     → Set Property ▸ Velocity ▸ x = -190
On Key ArrowLeft  ▸ Released → Set Property ▸ Velocity ▸ x = 0
On Key Space      ▸ Pressed  → Branch (Get Property ▸ Body ▸ grounded) ▸ True
                             → Set Property ▸ Velocity ▸ y = -560
```

Un `Set Velocity` ou un `Jump` auraient doublé ce que le Property System fait déjà, et la
question « pourquoi ce nœud-là plutôt que Set Property » n'aurait pas eu de réponse
(ADR-0040 §1). Ce graphe est `tools/demo/platform.js`, joué par un test et par un navigateur.

---

## 6. Ce que cet ADR ne décide pas — et ne fait pas semblant d'avoir

| Refusé | Pourquoi |
|---|---|
| **Masse, impulsion, restitution, frottement** | Chacun demande un solveur simultané et un jeu de réglages sans bonne valeur par défaut. Rien de tout cela n'est nécessaire pour tenir debout sur un sol |
| **Rotation physique** | Les boîtes sont alignées sur les axes (ADR-0059 §3) ; une boîte qui tourne n'est plus une AABB, et tout le balayage est écrit pour des AABB |
| **Joints, ressorts, contraintes** | Un moteur dans le moteur |
| **Pentes et plateformes à sens unique** | Deux vraies fonctionnalités de platformer, et deux décisions produit : ce qu'est « monter une pente », et par où l'on traverse une plateforme. Le balayage par axe les accueillera ; il ne les invente pas |
| **Plateformes mobiles qui portent un corps** | Demande de transmettre le mouvement d'un solide à ce qui est posé dessus — donc de savoir ce qui est posé, donc un contact conservé entre deux pas. C'est un état, et cette passe n'en a aucun |
| **Dépénétration** | Un corps qui **commence** dans un mur n'est pas repoussé : l'axe concerné l'ignore, donc il peut en sortir. Le figer là serait pire que le recouvrement qu'on prétendait corriger |
| **`grounded` sans gravité** | `grounded` est « mon déplacement vers le bas a été arrêté ce pas-ci ». Avec `gravity = 0` et une vitesse nulle, il n'y a pas de déplacement vers le bas, donc pas de « posé » — et un jeu vu de dessus n'en a pas l'usage |
| **Un corps parenté à un objet tourné ou mis à l'échelle** | Le mouvement repasse par l'inverse de la matrice du parent, donc c'est correct ; mais la BOÎTE d'un collider tourné est son AABB englobante (ADR-0059 §3), et cette approximation-là est inchangée |

---

## 7. Le broad phase est réutilisé, pas réécrit

Une paire écartée par la grille ne doit **jamais** devenir du travail dans le solveur. La passe
lui tend donc les mêmes entrées, dans le même ordre canonique, avec une seule différence : les
bornes d'un corps sont **étirées jusqu'où il va**, pour que la grille n'écarte une paire que si
le corps ne peut pas l'atteindre pendant ce pas.

`node tools/bench-physics.mjs` — la même passe, une fois avec les candidats de la grille, une
fois contre tous les colliders :

| corps | solides | grille | tous les colliders | épargné |
|---|---|---|---|---|
| 1 | 200 | 0,886 ms | 1,305 ms | 1,5× |
| 20 | 200 | 1,099 ms | 2,657 ms | 2,4× |
| 100 | 500 | 3,702 ms | 16,634 ms | 4,5× |
| 400 | 2000 | **10,390 ms** | 249,487 ms | **24×** |

La boucle est quadratique **sans** la grille ; avec elle, quatre cents corps dans deux mille
solides tiennent dans dix millisecondes par pas.

---

## 8. Contre-épreuves

| Vérifié | Où |
|---|---|
| Un corps tombe et s'arrête **exactement** sur le sol, vitesse verticale annulée | `runtime/physics/move.test.js` |
| Cinq cents pas de repos, sans un millième d'unité de dérive | idem |
| Marcher sur le sol n'est pas bloqué par le sol sur lequel on marche | idem |
| Quitter le bord du sol rend `grounded` faux | idem |
| Un mur arrête l'axe horizontal et laisse glisser le long de lui | idem |
| Un plafond annule la montée, et n'est pas un sol | idem |
| Un coin arrête les deux axes | idem |
| Mille unités en un pas ne traversent pas un mur de quatre | idem |
| Plusieurs solides candidats : le plus proche gagne | idem |
| Un trigger est traversé **et** produit Enter / Stay / Exit | idem |
| Un corps sans collider n'est arrêté par rien ; un collider sans corps n'est jamais déplacé | idem |
| Un `Body` éteint rend le mouvement à `Velocity` | idem |
| Une vitesse écrite pendant le pas déplace le corps **dans ce pas** | idem |
| **Contre-épreuve** : sans `Body`, cette même écriture arrive un pas plus tard | idem |
| Le saut est conditionné à `grounded`, et il n'y a pas de double saut | idem |
| Un sol détruit en plein vol cesse d'arrêter quoi que ce soit | idem |
| Scène vide, scène sans corps, pas de scène du tout | idem |
| Headless : deux exécutions, un seul résultat | idem |
| Deux Runtime sur deux scènes identiques : mêmes position, vitesse et `grounded` | idem |
| L'ordre dans lequel les sols ont été ajoutés ne change pas où le corps atterrit | idem |
| Aucun état physique ne survit à un changement de scène — la passe n'en a aucun | idem |
| **Grille et parcours exhaustif : mêmes positions, vitesses et `grounded` sur cinq graines** | idem |
| **Contre-épreuve** : un corps qui ignore ses bloqueurs finit ailleurs | idem |
| Un platformer complet, joué par la porte d'un client de jeu | `tools/demo/platform.test.js` |
| Marcher, s'arrêter, heurter les deux murs, sauter, atterrir sur une corniche | idem |
| Aucune frame passée à l'intérieur d'un mur, sur quatre cents pas | idem |
| La pièce est traversée sans ralentir, et se signale quand même | idem |

---

## 9. La démonstration

`tools/demo/platform.js` — un sol, deux murs, une corniche, une pièce qui ne bloque pas, un
personnage. Construit **uniquement** avec l'API publique ; joué par `platform.test.js` sous Node
et par `tools/demo/platform.html` dans un navigateur, vérifié là : le personnage tombe et se
pose, marche, traverse la pièce (qui disparaît et écrit dans le HUD), saute, se cogne au-dessous
de la corniche, et s'arrête net contre le mur de droite.

Il n'y a **pas un nœud de collision** dans son `.px`.

---

## 10. Conséquences

### Positives

- Un platformer ou un jeu vu de dessus avec de vrais murs se construit sans écrire de solveur.
- Le contrat de collision d'ADR-0059 est intact : les trois idées restent trois.
- Rien ne traverse un mur, quelle que soit la vitesse, sans sous-pas ni dépendance au framerate.
- Aucun nœud ajouté au catalogue : le Property System suffisait.

### Négatives

- Se poser sur un sol ne lève pas d'`On Collision` (§3) — c'est cohérent, et c'est à apprendre.
- Deux corps qui se poussent sont résolus l'un après l'autre : le second voit le premier déjà
  déplacé. C'est déterministe, ce n'est pas symétrique.
- Pas de pentes, pas de plateformes mobiles, pas de dépénétration (§6).
- `Velocity` a maintenant deux temporalités selon qu'un `Body` est là ou non ; c'est documenté
  des deux côtés, et c'est le prix de ne pas avoir réécrit le mouvement de tout ce qui bouge.
