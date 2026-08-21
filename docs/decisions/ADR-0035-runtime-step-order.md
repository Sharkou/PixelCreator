# ADR-0035 — L'ordre d'exécution de `Runtime.step()`

- **Statut :** **proposé** — décision à prendre avant que l'écriture croisée d'ADR-0034 porte sa garantie multijoueur
- **Décide :** dans quel ordre le Runtime exécute les Objects d'une Scene
- **Dépend de :** ADR-0005 (modules de runtime), ADR-0011 (autorité et déterminisme), ADR-0015 (un graphe s'exécute où son Component s'exécute), ADR-0018 (ordre structurel), ADR-0034 (ordre canonique d'une Scene)
- **Amenderait :** le contrat écrit dans `runtime/runtime.js` — « in scene insertion order »

---

## Pourquoi c'est un ADR séparé

ADR-0034 avait besoin d'un ordre canonique et l'a défini. La tentation était d'y intégrer
aussi le changement d'ordre d'exécution du Runtime. Trois raisons l'ont écarté, et chacune
suffit :

1. **Ce serait modifier un contrat écrit.** `runtime/runtime.js` documente, en toutes lettres,
   que les composants s'exécutent « with the same fixed delta, **in scene insertion order** ».
   Changer cela au détour d'une décision sur les références serait un changement de contrat
   par effet de bord.
2. **Ce n'est pas une conséquence d'ADR-0034.** Celui-ci porte sur l'**observation** — un nœud
   qui construit une liste ordonnée et en prend le premier. Celui-ci porte sur l'**exécution**
   — qui tourne avant qui. Un `Find By Tag` canonique est déterministe quel que soit l'ordre
   de `step()`.
3. **La portée n'est pas la même.** L'ordre d'exécution concerne **tout composant du moteur**,
   y compris ceux écrits en JavaScript qui n'ont rien à voir avec le visual scripting.

---

## Contexte observé

`runtime/runtime.js` itère `this.#scene.objects()`, c'est-à-dire l'ordre d'insertion dans la
`Map` de la Scene.

ADR-0034 §1 a mesuré que **cet ordre est fonction de l'historique de construction, pas de
l'état** :

- après un reparent, l'ordre d'insertion et l'ordre hiérarchique divergent (`A,B,C` contre
  `A,C,B`) ;
- la sérialisation **normalise** l'ordre d'insertion vers l'ordre hiérarchique, donc un
  rechargement change `objects()` sans que l'état ait bougé ;
- une suppression suivie de son Operation inverse laisse l'état identique et l'ordre
  d'insertion différent (`A,B,C` devient `B,C,A`).

Conséquence : deux machines au même état répliqué mais d'historiques différents — l'une
démarrée depuis un instantané, l'autre ayant rejoué les opérations — exécutent leurs
composants dans un ordre différent.

**Aujourd'hui ce fait est inobservable depuis un `.px`**, parce qu'un graphe ne peut ni lire
ni écrire hors de son propre Component. ADR-0034 le rend atteignable sans écrire une ligne de
code, par `property.setOn`.

---

## Impact mesuré sur l'existant

| Élément | Constat |
|---|---|
| Composants livrés possédant un `update()` | **un seul** : `ParticleSystem`. `Transform`, `Sprite`, `RectangleRenderer`, `Tilemap` et `Camera` n'en ont pas |
| Ce `update()` lit-il d'autres objets ? | Non : il fait avancer ses propres particules |
| Tests assertant un ordre inter-objets | **un seul**, dans `runtime/runtime.test.js` : deux racines créées dans l'ordre, donc insertion et hiérarchie coïncident — il passerait inchangé |

Le risque pratique est donc faible. Le changement de contrat, lui, est réel : c'est cela que
cet ADR existe pour rendre délibéré plutôt qu'incident.

---

## Décision à prendre

### 1. `Runtime.step()` adopte-t-il l'ordre canonique d'ADR-0034 §1 ?

Si oui, un parent s'exécute avant ses enfants — ce qui est aussi ce qu'une hiérarchie de
transforms veut dire — et l'ordre d'exécution devient une fonction de l'état répliqué.

### 2. Que devient la phrase « in scene insertion order » ?

Elle est fausse dès que la décision 1 est prise. Le contrat écrit doit dire l'ordre réel, et
dire **pourquoi** cet ordre-là : parce qu'il est le seul qui ne dépende pas de l'historique.

### 3. L'ordre de dessin à `layer` égal suit-il la même règle ?

`runtime/rendering/scene-renderer.js` trie par `layer`. `Array.prototype.sort` est stable,
donc les objets de même `layer` sont départagés par l'ordre de `scene.objects()`,
c'est-à-dire par l'ordre d'insertion. **Le même défaut, sur un autre consommateur.**

Il faut décider explicitement : soit le tri de dessin part lui aussi de l'ordre canonique,
soit il reste tel quel et cet ADR dit pourquoi la question du dessin est différente de celle
de la simulation. Ne pas trancher laisserait deux ordres pour une seule idée.

### 4. `Scene.objects()` reste-t-il l'ordre d'insertion ?

La réponse attendue est **oui**. Le rendre canonique serait une refonte : le stockage, la
sérialisation, le renderer, l'Editor et l'ensemble de la suite de tests en dépendent, et
ADR-0034 §1 a déjà écarté cette voie.

---

## Tests de non-régression nécessaires

| # | Test | Protège |
|---|---|---|
| S1 | L'ordre d'`update` est identique avant et après un aller-retour de sérialisation | l'ordre est fonction de l'état |
| S2 | L'ordre d'`update` est identique avant et après une suppression suivie de son Operation inverse | idem, sur le chemin d'undo |
| S3 | Un parent s'exécute avant ses enfants | la conséquence sémantique de la décision 1 |
| S4 | Le test d'ordre existant de `runtime/runtime.test.js` continue de passer | non-régression du contrat visible |
| S5 | Deux `Runtime` construits par deux chemins différents — opérations rejouées contre instantané — atteignent le même état après N pas | **le critère qui justifie l'ADR** |
| S6 | Tout objet d'une Scene est atteignable depuis ses roots | un objet non atteignable cesserait d'être simulé (partagé avec ADR-0034 T2) |

S6 mérite d'être souligné : tant que `Runtime.step()` itère `objects()`, un objet non
atteignable depuis les roots est simulé quand même. S'il adopte un parcours depuis les roots,
un tel objet **cesserait de tourner**. L'invariant doit donc être garanti par un test avant la
décision 1, et non après.

---

## Séquencement

ADR-0034 est implémentable sans cet ADR. Celui-ci est un prérequis de la **garantie
multijoueur de l'écriture croisée** (`property.setOn`) : sans lui, deux machines au même état
mais d'historiques différents peuvent diverger d'une frame.

Cette non-détermination est **préexistante** — tout composant écrit à la main peut déjà écrire
chez un voisin — et aucun transport réseau n'existe dans `src/`, donc rien n'est observable
aujourd'hui. Ce que change ADR-0034, c'est qu'un créateur peut l'atteindre sans écrire de
code.

Ordre recommandé : ADR-0034 §3.1 et §3.2, puis cet ADR, puis ADR-0034 §3.3, puis §3.5.

---

## Alternatives à peser dans la décision

| Alternative | Remarque |
|---|---|
| Ne rien changer | Tenable tant qu'aucun nœud n'écrit chez un voisin ; intenable dès que `property.setOn` existe et qu'un transport apparaît |
| Rendre `Scene.objects()` canonique | Écarté par ADR-0034 §1 : refonte du stockage et de tous ses lecteurs |
| Faire maintenir l'ordre canonique par la Scene, de façon incrémentale | Un cache, donc une seconde source de vérité à invalider sur chaque `REPARENT`. Le dépôt refuse déjà ce raisonnement pour le tri de dessin |
| Trier par `id` | Déterministe, mais l'ordre d'exécution cesserait d'avoir un sens lisible pour un créateur |
