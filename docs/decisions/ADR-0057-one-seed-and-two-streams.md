# ADR-0057 — Une graine, deux flux, et une identité d'édition n'est pas une identité de simulation

- **Statut :** **accepté** (2026-09-11)
- **Décide :** où vit la graine d'une simulation ; qui possède l'état aléatoire ; comment une
  identité créée par un pas est produite ; ce qui est déterministe et ce qui ne l'est
  volontairement pas
- **Dépend de :** ADR-0010 (une identité est un ID opaque), ADR-0011 (le serveur est
  l'autorité), ADR-0014 (l'input est passé au runtime), ADR-0034 §3.1 (ordre canonique),
  ADR-0035 (ordre de `Runtime.step()`), ADR-0049 (un identifiant se lit à voix haute),
  ADR-0056 (une copie est le modèle)
- **Ferme :** le point ouvert d'ADR-0045 §11.5 pour `Random` ; le point ouvert d'ADR-0056 §8
  sur le déterminisme des identités sous réplication
- **Ne décide pas :** `Delay` (état d'exécution par instance, question distincte) ; le
  transport qui porterait la graine d'un serveur à ses clients ; la reprise d'une simulation
  en cours de route — voir §7

---

## 1. Problème

ADR-0011 fait du serveur l'autorité d'une simulation que **chaque client exécute aussi**.
Cela ne vaut quelque chose que si la même simulation, exécutée deux fois, arrive au même
endroit. Deux moitiés de cette promesse étaient déjà tenues :

| Déjà résolu | Par |
|---|---|
| le temps | `Clock` — pas fixe, jamais la cadence de l'écran |
| l'entrée | ADR-0014 — passée à `step()`, jamais un global |

Et il restait une exception que personne n'avait écrite : **un graphe qui crée un Object
atteint une source que les deux machines ne partagent pas.** `duplicateObject()` tirait ses
identités de `createId()`, donc du CSPRNG de la plateforme. Deux clients exécutant le même
`Spawn` au même pas créaient deux objets dont ils ne pouvaient plus jamais convenir — et
toute référence stockée ensuite pointait, chez l'un, vers quelque chose que l'autre n'avait
jamais eu.

La même classe de problème attendait `Random`, que ADR-0045 §11.5 refusait de coder pour
cette raison exacte : « Un `Math.random()` non semé désynchronise. Il faut décider où vit la
graine et qui l'attribue. »

### 1.1 Inventaire, et il est court

Mesuré sur tout `src/`, hors tests :

| Source | Où | Classe |
|---|---|---|
| `createId()` dans `duplicateObject()` | `core/duplicate.js` | **A — à corriger** : conséquence d'un pas |
| `Math.random()` | **nulle part** dans du code exécuté | — |
| `createId()` — batches d'undo, `ResourceId`, `ProjectId`, ids de nœuds, `SceneId`, `new Object()` | `editor/`, `project/`, `core/graph/` | **B — identité d'édition**, hors simulation |
| `Date.now()` | `project/project.js`, `project/resource.js` (`created`, `modified`) | **B** — métadonnée de ressource, jamais lue par la simulation |
| `performance.now()` | `editor/viewport/viewport.js` | **C — temps réel volontaire** : cadence d'affichage |
| LCG de `ParticleSystem` | `runtime/rendering/components/` | **D** — déjà déterministe, graine d'instance fixée à la construction |
| Itération de `Map`/`Set` | `input/`, `behaviors/`, `scene-renderer` | **D** — tous triés ou contractuels ; `Runtime.step()` lit l'ordre canonique (ADR-0034 §3.1) |

**Une seule entrée en A.** Le correctif n'avait donc pas à être grand : il avait à être au
bon endroit.

---

## 2. Le Runtime possède le hasard, parce qu'une simulation est ce qu'il est

`runtime/random/`, **pas** `core/random/`. L'argument est celui d'ADR-0014 §1, mot pour mot :

> « Le Core ne connaît aucun input. Un `Object` n'a pas d'entrées ; une simulation en a. »

Un `Object` n'a pas de chance non plus. Ce qui en a est une **simulation**, et une simulation
est ce que le Runtime est. Les trois choses que l'environnement fournirait autrement à un jeu
deviennent trois dossiers côte à côte, et c'est la structure qui décide, pas une préférence :

```text
runtime/clock/    quand              pas fixe
runtime/input/    ce qu'on a fait    passé à step() (ADR-0014)
runtime/random/   la chance          semé (ici)
```

### 2.1 Une graine, deux flux nommés

```text
seed ──┬── "seed:random"  ──►  ctx.random         ce qu'un graphe tire
       └── "seed:ids"     ──►  ctx.createObjectId  ce qu'un pas crée
```

**Deux flux et non un compteur**, et la raison est mesurable sur un graphe réel : avec un
seul compteur, « combien de dés ont été lancés » devient une entrée de toute identité frappée
ensuite. Ajouter un `Random` **n'importe où** renumérote alors la partie entière, et ajouter
un `Spawn` change toutes les valeurs aléatoires suivantes. Un créateur n'a aucun moyen de
lire ce couplage sur la toile.

**Dérivés par NOM, pas par alternance de tirages.** Un troisième flux coûte une ligne et ne
décale ni l'un ni l'autre — alors que « un tirage sur deux pour les ids » fige le nombre de
flux pour toujours.

### 2.2 Ce n'est pas un framework

Deux `Random` et une chaîne. Pas de registre de flux, pas de hiérarchie, pas de sérialisation
de position. `Random` expose `next()`, `between()`, `fill()` et rien d'autre.

---

## 3. Une identité d'édition n'est pas une identité de simulation

C'est la distinction qui empêche la correction d'être une généralisation naïve.

| | identité d'**édition** | identité de **simulation** |
|---|---|---|
| Exemple | l'Object qu'un créateur pose dans la Hierarchy ; une `ResourceId` ; un batch d'undo | l'Object qu'un `Spawn` crée au pas 37 |
| Ce que c'est | du **contenu**, frappé une fois et jamais refrappé | une **conséquence** d'un pas, que deux machines doivent frapper pareil |
| Tirée de | le CSPRNG de la plateforme | le flux `seed:ids` |
| Rejouable | non, et il n'y a rien à rejouer | oui, et il le faut |

> **`createId()` ne devient pas un générateur semé. C'est le chemin du Runtime qui fournit
> l'identité au moment de la duplication.**

Concrètement, le seam est un paramètre et rien d'autre :

```text
duplicateObject(scene, source, { createId })   ◄── défaut : core/id.js
        ▲
        └── le nœud Spawn passe ctx.createObjectId
```

L'Editor n'apprend rien, ne dépend d'aucun Runtime, et continue de frapper ses identités
comme avant. Le Core ne sait pas ce qu'est une simulation : il prend une fabrique.

---

## 4. Un identifiant de simulation est un identifiant ordinaire

`createId(length, { randomBytes })`. Le seam descend jusqu'aux **octets**, et pas plus haut :

| Ce qui ne bouge pas | Pourquoi |
|---|---|
| l'alphabet de 22 lettres sans chiffres ambigus | ADR-0049 — un identifiant se lit à voix haute |
| la longueur de 14 | 62 bits, la garantie d'ADR-0010 |
| le rejet à 242 | 22 ne divise pas 256 ; masquer biaiserait les premières lettres |

Une seconde fonction d'identité pour le Runtime aurait été une **seconde réponse** à « qu'est-ce
qu'une identité ». Il n'y en a qu'une, et ce qui change est d'où viennent les octets.

> **Un identifiant tiré d'un flux semé est reproductible, donc devinable.** C'est exactement
> ce qu'on veut d'une identité de simulation et exactement ce qu'on ne veut pas d'un
> `ProjectId` dans une URL. La distinction de §3 est aussi ce qui garde le CSPRNG là où il
> compte.

---

## 5. Un seul générateur dans le dépôt

`ParticleSystem` embarquait déjà un LCG déterministe, avec déjà ce commentaire — il avait
raison avant tout le monde. Il passe par `advance()` plutôt que par une seconde copie des
constantes.

**Il garde sa propre position dans le flux, et ce n'est pas un oubli.** Un émetteur repart au
même endroit à chaque construction, donc ses particules sont fonction de la scène et de rien
d'autre : elles ne se décalent pas parce qu'un graphe a lancé un dé plus tôt dans l'image, et
elles ne font pas partie de ce que la graine décide. Une seule chose est partagée : la
définition du générateur.

`unitOf()` **jette l'octet de poids faible**, et c'est visible là où un créateur le rencontre
en premier : les bits bas d'un LCG ont une période courte, donc `next() < 0.5` lu sur l'état
entier donne pile-face-pile-face. Un test le dit.

---

## 6. La graine est tirée, et elle est dite

`new Runtime(scene, { seed })`. Sans graine, le Runtime **en tire une** et l'expose comme
`runtime.seed`.

| Refusé | Pourquoi |
|---|---|
| Une graine constante par défaut | Chaque partie serait identique à la précédente — l'inverse de ce qu'un créateur attend de `Random` |
| Un tirage caché | Un bug ne serait pas reproductible ; « quelle graine ? » n'aurait pas de réponse |

**Contrôlé veut dire dit.** La différence entre deux parties fait une chaîne de long, et cette
chaîne est lisible sur l'objet. C'est ce qui rend un rejeu possible sans transport : le payload
de départ plus la graine sont tout ce qu'il faut.

---

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Deux Runtime, une graine : mêmes identités créées par `Spawn` | `runtime/determinism.test.js` |
| Deux Runtime, une graine : mêmes tirages de `Random` | idem |
| Deux Runtime, une graine : même payload sérialisé après N pas | idem |
| Les références internes d'un sous-arbre spawné sont les mêmes des deux côtés | idem |
| Graines différentes : tirages et identités divergent | idem |
| Ajouter un `Random` ne change pas ce qu'un `Spawn` crée | idem |
| Ajouter un `Spawn` ne change pas ce qu'un `Random` tire | idem |
| Payload de départ + graine rejoués : même état d'arrivée | idem |
| Une identité frappée hors simulation reste tirée de la machine | idem |
| Une graine est un run, deux graines sont deux runs | `runtime/random/random.test.js` |
| Un tirage est dans [0, 1), et une pièce n'alterne pas | idem |
| Aucun nœud livré ne nomme `Math.random` | `core/graph/nodes.test.js` |

---

## 8. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Qui envoie la graine** | Le transport n'existe pas (ADR-0042 §6 : deux fenêtres sont déjà deux clients, il leur manque un canal). Quand il existera, la graine est une chaîne de plus dans le message d'ouverture — rien ici ne bouge |
| **Reprendre une simulation en cours** | Le contrat est « même départ + même graine + mêmes pas ». Reprendre à mi-course demanderait de sérialiser la POSITION des flux, donc d'en faire de l'état de scène. Personne n'en a besoin tant qu'un client rejoint en recevant un instantané |
| `Delay` | Reste ouvert (ADR-0045 §11.5) : sa difficulté est l'état d'exécution par instance, pas le hasard |
| **Les particules d'une copie** | Deux `ParticleSystem` copiés émettent le même motif, puisque la graine d'un émetteur est fixée à la construction (§5). C'est trop de déterminisme plutôt que pas assez, et c'est une question de rendu |
| **La caméra choisie par `preview/client.js`** | `scene.objects().find(…)` lit l'ordre d'insertion : classe D, cela ne touche pas la simulation, mais deux clients pourraient regarder par deux caméras si une scène en portait deux |
