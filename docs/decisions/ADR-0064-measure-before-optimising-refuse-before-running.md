# ADR-0064 — Mesurer avant d'optimiser, refuser avant d'exécuter

- **Statut :** **accepté** (2026-09-12)
- **Décide :** quelle partition remplace l'O(n²) ; ce qu'un broad phase n'a pas le droit de changer ; comment on le prouve ; où un graphe cassé est arrêté
- **Dépend de :** ADR-0012 (isolation des erreurs), ADR-0015 (un `.px` est un comportement), ADR-0027 (modèle de graphe, `validateGraph`), ADR-0034 §3.1 (ordre canonique), ADR-0059 (se toucher est un fait de simulation)
- **Amende :** ADR-0059 §7 — le broad phase arrive, avec le chiffre qui le justifiait
- **Ne décide pas :** la résolution physique ; les couches de collision ; le collider polygonal ; l'OBB exact — ADR-0059 §9 est inchangé
- **Amendé le 2026-09-12 (ADR-0072) :** « seules les ERREURS retiennent la liaison » vaut
  aussi **pendant** l'exécution. Un nœud dont le validateur ne fait qu'un avertissement — une
  propriété pas encore choisie — ne doit pas jeter à chaque pas : une exception déroule tout le
  `walk`, donc elle arrêtait aussi tout ce qui était câblé après lui

---

## 1. Deux dettes, une même forme

ADR-0059 §7 disait que la boucle O(n²) serait remplacée « le jour où une mesure le demande ».
`validateGraph()` savait depuis ADR-0027 dire qu'un fil nomme un port qui n'existe pas, et
personne ne le lui demandait avant de jouer. Les deux dettes étaient déjà **nommées** ; il ne
manquait qu'un chiffre pour la première et un appelant pour la seconde.

```
1000 colliders étalés         7,56 ms par pas   — 500 000 tests de boîte pour 0 contact
1000 colliders superposés   760    ms par pas
```

Le second nombre n'est pas le problème d'un broad phase : mille choses qui se touchent
vraiment **sont** un demi-million de paires. Le premier l'est entièrement.

---

## 2. Un hachage spatial uniforme, pas un quadtree

Le monde est 2D, les formes sont des AABB, et les objets d'un jeu sont surtout de taille
comparable et surtout groupés — le cas exact où une grille est la meilleure et un arbre le
pire. C'est aussi quarante lignes : **aucune structure à rééquilibrer, aucun nœud à découper,
aucune profondeur à régler et rien à conserver entre deux pas.** Cela compte plus que
l'asymptotique : un arbre qui doit rester correct à travers mille spawns et destructions par
seconde est une seconde source de bugs, et ceci n'a aucun état.

| Décision | Raison |
|---|---|
| **taille de cellule = étendue moyenne** | une grille à la taille de ce qu'elle contient met un objet typique dans une à quatre cellules. Une taille fixe serait un réglage sans bonne valeur : un jeu de balles de 8 px et un jeu de plateformes de 256 px en veulent deux différentes, et aucun créateur ne devrait avoir à le savoir |
| dérivée de l'état | deux machines calculent la même taille, donc les mêmes seaux |
| **moins de 24 objets : aucune partition** | à deux douzaines de boîtes, toute la boucle brute coûte moins que l'allocation d'une `Map` — et une scène de cette taille est l'écrasante majorité |
| **plus de 64 cellules pour un objet : liste « grands »** | un sol de 4000 unités serait inséré dans des centaines de cellules. Ce qui couvre tout est apparié avec tout, ce avec quoi il aurait été apparié de toute façon |
| déduplication par `i * n + j` | deux boîtes partageant trois cellules sont **une** paire ; une clé arithmétique n'alloue rien là où une scène dense propose cent mille candidats |
| **tri final en ordre canonique** | §3 |

---

## 3. Le contrat observable ne bouge pas — et c'est prouvé, pas affirmé

Ce qui change est **quelles paires sont testées**. Ce qui ne change pas :

- quelles paires se recouvrent ;
- l'ordre dans lequel elles sont rapportées ;
- `Enter`, `Stay`, `Exit` et leur disjonction (ADR-0059 §5) ;
- la paire au niveau **Object** (ADR-0059 §5) ;
- la réponse de `Is Overlapping` ;
- le déterminisme.

Une `Map` itère dans l'ordre d'insertion, qui est un ordre que le hachage invente. Le contrat
de l'appelant est celui de la scène (ADR-0034 §3.1), et deux machines doivent s'accorder
dessus : **les candidats sont donc triés par `(i, j)` avant de sortir**. C'est ce qui fait du
hachage un détail d'implémentation plutôt qu'un détail observable.

---

## 4. La preuve est différentielle, pas unitaire

Un changement de partition est le plus facile des régressions silencieuses : rien ne lève quand
une paire candidate est manquée — une collision n'a simplement pas lieu, dans un coin d'un
niveau, pour une disposition. Des tests unitaires de la grille ne trouvent pas cela, parce
qu'une grille fausse reste cohérente avec elle-même.

> **`Collisions` garde un mode `exhaustive`, et le test rejoue les mêmes scènes des deux
> façons.**

Huit distributions générées depuis une graine — étalées, groupées, empilées, minuscules,
énormes, un objet géant parmi des petits — et les **séquences** de transitions doivent être
identiques, pas seulement les ensembles. Plus six pas de mouvement, pour que `Enter`, `Stay` et
`Exit` soient comparés et pas seulement les recouvrements d'un instant.

Le mode `exhaustive` n'est utilisé par rien dans le produit : il existe pour que cette phrase
soit vérifiable.

---

## 5. Les chiffres, avant et après

`node tools/bench-collision.mjs`

| disposition | n | brute | grille | gain | paires testées (brute → grille) | contacts réels |
|---|---|---|---|---|---|---|
| étalée | 1000 | 45,87 ms | **2,87 ms** | 16× | 499 500 → 0 | 0 |
| étalée | 5000 | 1374,21 ms | **17,68 ms** | **78×** | 12 497 500 → 0 | 0 |
| groupée | 1000 | 39,40 ms | **4,92 ms** | 8× | 499 500 → 2 700 | 1 700 |
| groupée | 5000 | 1422,13 ms | **27,91 ms** | **51×** | 12 497 500 → 13 500 | 8 500 |
| empilée | 1000 | 854,14 ms | 970,09 ms | **0,9×** | 499 500 → 499 500 | 499 500 |

**Le benchmark rapporte deux coûts et pas un.** `testées` est ce qu'un broad phase déplace ;
`contacts` est ce que rien ne peut déplacer. Sans les deux, la dernière ligne se lirait comme
un échec de la grille alors qu'elle est la mesure d'une scène pathologique : mille objets qui
se recouvrent **tous** sont un demi-million de paires réelles, et la grille les paie **plus une
taxe de 10 %** pour avoir proposé ce qu'elle ne pouvait pas écarter. C'est honnête et c'est le
prix ; le cas n'existe pas dans un jeu.

---

## 6. Un graphe cassé est arrêté à la porte, pas dans la boucle

Un fil vers un port inexistant était rapporté par `validateGraph()` et **ignoré en silence** à
l'exécution : l'interprète ne trouvait pas le port, l'entrée prenait sa valeur par défaut, et
tous les nœuds continuaient de tourner. Rencontré pour de vrai en écrivant le jeu de
démonstration — `time.delta` a un port `seconds`, pas `delta` — et le symptôme était « le
joueur ne bouge pas », sans un mot nulle part.

> **La vérification est faite une fois, à la liaison, dans la couche Project.**

| Où | Pourquoi pas ailleurs |
|---|---|
| `project/graphs.js` (`bindGraph`, `checkGraph`) | c'est **la** porte que tout `.px` franchit pour entrer dans un jeu : chargement d'un projet, installation d'une définition éditée, arrivée par le canal live |
| pas dans l'interprète | valider à chaque lecture de port serait un coût par frame pour une question qui ne change jamais |
| pas dans `Behaviors` | c'est un joint **duck-typé** : ses propres tests lient des objets faits main à des interprètes faits main. Un validateur là-dedans jugerait des choses qu'il ne gouverne pas |

**Seules les ERREURS retiennent la liaison.** Un `Set Property` dont rien n'est choisi est un
graphe **en cours**, et refuser de l'exécuter rendrait l'Editor inutilisable pendant qu'on le
construit — c'est un avertissement, et ADR-0027 le disait déjà.

**Un `.px` refusé n'est pas fatal (ADR-0012).** Son Component existe, s'attache et porte ses
propriétés ; seul le comportement est retenu, et la raison est rapportée avec le nœud et le
port. Un projet s'ouvre ; il dit ce qui ne tourne pas.

---

## 7. Contre-épreuves

| Vérifié | Où |
|---|---|
| Grille et brute trouvent **exactement** les mêmes paires, sur huit distributions | `runtime/collision/broad-phase.test.js` |
| Elles s'accordent sur `Enter`, `Stay`, `Exit` sur six pas de mouvement | idem |
| Beaucoup moins de paires testées quand rien n'est près de rien | idem |
| **Toutes** les paires testées quand tout se touche, et le dire | idem |
| Une petite scène n'est pas partitionnée | idem |
| Une paire trouvée dans plusieurs cellules est proposée une fois | idem |
| Les candidats sortent en ordre canonique | idem |
| Un objet immense est apparié avec tout plutôt que de remplir la grille | idem |
| Des boîtes de taille nulle ne divisent pas par zéro | idem |
| **Contre-épreuve** : rapporter les mêmes paires dans un autre ordre est une autre réponse | idem |
| Un fil vers un port inexistant est une erreur, et l'était déjà | `project/graphs.test.js` |
| Un type de nœud inconnu aussi | idem |
| Un graphe en cours est un avertissement, et tourne | idem |
| Un graphe non exécutable **n'est pas lié**, et la raison est rapportée | idem |
| Le TYPE est quand même enregistré : seul le comportement est retenu | idem |
| Un `.px` cassé n'empêche pas les autres de se charger | idem |
| Lier directement passe par la même porte | idem |
| **Contre-épreuve** : sans la porte, le fil est ignoré et rien n'est dit | idem |

---

## 8. Conséquences

### Positives

- Une scène de mille colliders étalés passe de 45,87 ms à 2,87 ms par pas ; cinq mille, de 1,37 s à 17,7 ms.
- Le contrat de collision est inchangé, et un test différentiel le garantit pour la prochaine implémentation aussi.
- Un graphe cassé le dit, une fois, avec le nœud et le port — au lieu d'un objet qui a
  silencieusement cessé de bouger.

### Négatives

- Le cas « tout se touche » coûte 10 % de plus qu'avant. Il coûtait déjà 850 ms par pas.
- `Collisions` gagne un mode qui n'existe que pour les tests ; il est documenté comme tel.
- Un `.px` en cours d'écriture dont un fil a été cassé cesse de tourner jusqu'à réparation —
  c'est le comportement voulu, et c'est un changement visible pour qui s'était habitué au
  silence.
