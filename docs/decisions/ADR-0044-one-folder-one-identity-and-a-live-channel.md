# ADR-0044 — Un dossier, une identité, et un canal vivant

- **Statut :** **accepté** (2026-08-29)
- **Décide :** où vit le Preview dans l'arborescence ; ce qui l'identifie ; comment une modification de l'éditeur atteint un Preview déjà ouvert
- **Dépend de :** ADR-0011 (autorité et arbitrage), ADR-0016 §7 (relier un graphe remplace le comportement), ADR-0019 (réplication), ADR-0027 (un `Operation` est une intention d'auteur), ADR-0042 (le Preview est un client de runtime adressé par identifiant)
- **Amende :** ADR-0042 §2 (les deux dossiers deviennent un), §3 (le préfixe `prv_` disparaît), §4 (ce que le magasin garde), §7 (les contrats de couches)
- **Ne décide pas :** le sens inverse (Preview → Editor), le multijoueur, la résolution de conflits, la persistance côté serveur. Voir §6.

---

## 1. Ce qui n'allait pas

Trois défauts, et ils sont le même : **le Preview n'avait pas d'identité stable**.

| Symptôme | Cause |
|---|---|
| Deux dossiers, `src/play/` et `src/preview/`, pour une seule application | ADR-0042 a séparé « le client » et « ce qui passe entre » avant de savoir que le second n'avait qu'un seul lecteur |
| Ouvrir Preview deux fois donnait deux jeux sans rapport | l'identifiant était tiré à chaque ouverture (`prv_` + aléatoire) |
| Une modification dans l'éditeur n'atteignait jamais une fenêtre ouverte | il fallait refermer, rappuyer, et retrouver où l'on en était |

Le troisième est celui qui coûte. Pixel Creator est orienté multijoueur : le geste normal
d'un créateur est d'avoir **le jeu ouvert à côté de l'éditeur** et de régler pendant que ça
tourne. Une fenêtre qu'il faut relancer à chaque essai n'est pas ce geste, c'est un
compilateur.

---

## 2. Décision : un dossier, et l'identité du projet

> **`src/preview/` est l'application Preview, entière. Un Preview est identifié par le
> projet qu'il montre, et par rien d'autre.**

```
  src/editor/    l'éditeur           →  project, runtime, core, preview
  src/preview/   le client de jeu    →  runtime, core
```

`src/preview/` n'importe toujours rien de `src/editor/` — c'est la frontière d'ADR-0042 §2 et
elle est intacte. Ce qui change est que le bundle, le magasin et le client habitent
ensemble : il n'y a qu'une application, elle a un dossier.

**Aucun alias `play → preview` n'est laissé en place.** Un alias permanent est un deuxième
nom pour une chose qui en a déjà un ; il survit aux réécritures, se glisse dans les imports
neufs, et fait mentir `tools/layers` sur ce qui existe.

### 2.1 L'identifiant est celui du projet

| | avant | maintenant |
|---|---|---|
| Forme | `prv_` + aléatoire | l'identifiant du projet |
| Combien par projet | un par pression sur Preview | **un** |
| Deux fenêtres | deux jeux étrangers | deux clients d'un jeu |
| Le magasin | une entrée par pression | une entrée par projet, réécrite |

Le préfixe existait pour rendre « la nature de l'identifiant lisible » (ADR-0042 §3). Il
répondait à une question que personne ne pose : ce que `resolve(id)` fait de l'identifiant
est déjà la seule différence entre un preview et un jeu publié, et cette fonction n'a jamais
lu le préfixe. Ce qu'il coûtait, en revanche, est réel — **rien ne pouvait nommer « le
Preview de CE projet »**, ce qui est exactement ce qu'un canal vivant, et plus tard une URL
publiée, doivent nommer.

Un `game id` attribué par un serveur reste possible et reste distinct : il est attribué par
Publish, pas dérivé du projet. La colonne d'ADR-0042 §3 tient toujours, moins la ligne
« Forme » du preview.

---

## 3. Décision : l'éditeur diffuse ses `Operation`, le Preview les applique

> **Ce qui traverse est un `Operation` — le même enregistrement que l'historique de
> l'éditeur détient, et le même qu'un serveur transmettra un jour.**

Aucun protocole n'est inventé ici, parce que le Core en a déjà un. ADR-0011 a séparé deux
verbes, et la séparation existait précisément pour ce moment :

```
  submit()   arbitre, applique et ANNONCE      ← ce que fait un auteur
  apply()    applique ce qui fait autorité      ← ce que fait un suiveur
             et n'annonce rien
```

`apply()` n'annonce rien, « ce qui est la raison pour laquelle appliquer une opération
distante ne renvoie rien » (`core/operations/operations.js`). Rien ne boucle, parce que
rien ne peut boucler : un pipeline n'émet `operation` que depuis `submit()`.

Il ne manquait qu'un **canal**. C'est un `BroadcastChannel` nommé `px.live.<projectId>` :
la plus petite chose qui porte un message entre deux pages d'un navigateur. Le jour où
c'est une WebSocket, `openLiveChannel()` change et **personne d'autre** — la promesse
d'ADR-0042 §6, tenue une couche plus bas.

### 3.1 Deux sortes de message, et l'asymétrie est le sujet

| | `operation` | `definition` |
|---|---|---|
| Porte | une modification de la **scène** | un `.px` **entier** |
| Parce que | la scène est un **état que le Preview habite** : les objets ont bougé, les minuteurs ont tourné. La remplacer jetterait tout ce que la partie est devenue | un `.px` est une **définition que le Preview lit**. Relier un graphe remplace le comportement en cours, ce qu'ADR-0016 §7 dit déjà d'une modification de graphe |
| Coût d'un déplacement de nœud | — | un envoi, pas quarante `SET_PROPERTY` |

Un `.px` est donc envoyé **entier et au plus une fois par frame**. Une microtâche serait
trop pressée — un lot d'opérations en contient plusieurs — donc l'envoi attend la frame où
le geste du créateur se termine.

### 3.2 Ce que l'éditeur suit

Le Workspace annonce `attached` au moment exact où une ressource gagne un modèle vivant
(ADR-0043 §3). Suivre « tous les modèles qu'il y a » est donc **un abonnement**, et non un
registre à tenir à jour. Les modèles déjà attachés au démarrage — la scène, notamment — sont
ramassés au passage : sans cela, la ressource qui compte le plus serait la seule à n'être
jamais suivie.

---

## 4. Ce qui n'est pas décidé, et pourquoi

| Question | Réponse d'aujourd'hui |
|---|---|
| Preview → Editor | **non**. Le Preview n'a pas le vocabulaire d'une modification (ADR-0042 §5) et ne doit pas l'acquérir par un canal. |
| Deux éditeurs sur un projet | hors sujet ici : un seul auteur émet. C'est l'arbitrage d'ADR-0011, et il se branchera au même endroit. |
| Conflits, ordre, reprise après perte | rien. Un `BroadcastChannel` ne perd pas de message entre deux onglets d'un navigateur, et un Preview qui a raté quelque chose se rouvre. Sur une WebSocket, la question devient réelle et vaut son propre ADR. |
| Rejouer l'historique à un Preview ouvert en retard | non. Le Preview ouvre le bundle du moment où il est ouvert, puis suit. |

---

## 5. Ce qu'un échec fait

Aucun de ces chemins n'est une erreur d'auteur, et aucun n'interrompt une édition :

- **Pas de `BroadcastChannel`** (navigateur ancien, contexte restreint) → `openLiveChannel()`
  répond `null`, le Preview joue sans suivre. Un Preview qui ne peut pas suivre l'éditeur
  reste un Preview.
- **Canal fermé** (la fenêtre d'en face est partie) → l'envoi est avalé. Une modification ne
  peut pas échouer parce que personne n'écoutait.
- **Message pour une autre ressource** → ignoré. Le Preview n'applique que ce qui concerne la
  scène qu'il joue.

---

## 6. Comment cela devient du multijoueur

C'est la même phrase qu'ADR-0042 §6, une couche plus bas et désormais vraie :

```
  aujourd'hui   Editor ──BroadcastChannel──▶ Preview           (une machine, N fenêtres)
  ensuite       Client ──WebSocket──▶ serveur ──▶ Clients      (N machines)
```

Ce qui traverse ne change pas : un `Operation`. Ce qui change est `openLiveChannel()`, et
l'arbitrage qu'ADR-0011 a déjà décrit s'installe côté serveur. **Deux fenêtres d'un projet
sont déjà deux clients d'une partie** — la propriété qu'ADR-0042 nommait comme la totalité
de la préparation au multijoueur.

---

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `src/play/` n'existe plus, et aucun alias ne le remplace | l'arborescence, `tools/check-exports` |
| `src/preview/` n'importe rien de `src/editor/` | `tools/layers` |
| Deux ouvertures d'un projet donnent une entrée de magasin | `preview/store.test.js` |
| Un `Operation` émis par l'éditeur arrive au Preview | `preview/live.test.js` |
| Ce que le Preview applique ne repart pas | `apply()` n'émet rien — `operations.test.js` |
| Un canal absent ne casse ni l'éditeur ni le Preview | `live.test.js`, les deux sens |
| Un `.px` modifié arrive entier, une fois par frame | `live.test.js` |
| Bouger un objet dans l'éditeur le bouge dans un Preview ouvert | deux fenêtres, à l'œil |

---

## 8. Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Renvoyer le bundle entier à chaque modification | La scène est un état habité : le Preview perdrait la partie en cours à chaque frappe. C'est justement la distinction de §3.1. |
| Un diff calculé entre deux états | Le Core produit déjà l'intention exacte, arbitrée et annoncée. Calculer après coup ce que l'on savait avant est du travail en double, et faux dès qu'une opération n'est pas idempotente. |
| `postMessage` sur la fenêtre ouverte | Ne survit pas à un rafraîchissement du Preview et ne nomme que la fenêtre que l'on a ouverte soi-même — pas « les Previews de ce projet ». |
| `storage` events sur `localStorage` | Il faudrait réécrire le bundle entier pour signaler une frappe, et l'événement ne porte pas d'intention. |
| Un serveur local dès maintenant | Un processus à lancer pour une fonctionnalité que le navigateur rend déjà réelle. La couture est en place pour le jour où il apporte quelque chose. |
| Garder `prv_` et ajouter un identifiant de projet à côté | Deux identités pour une chose : le magasin, le canal et l'URL devraient s'accorder sur laquelle est la vraie. |
| Un alias `src/play/` réexportant `src/preview/` | Un second nom permanent pour une chose qui en a un. Il se glisse dans les imports neufs et fait mentir la vérification de couches. |
