# ADR-0041 — Un événement est un moment, un état est une question, et une propriété porte son chemin

- **Statut :** **accepté** (2026-08-28)
- **Décide :** ce qu'est un nœud d'entrée clavier/souris ; comment un nœud d'entrée dit quels flux il déclenche ; comment une propriété choisie se lit une fois choisie
- **Dépend de :** ADR-0011 (déterminisme), ADR-0014 (l'input est passé, jamais lu), ADR-0027 (modèle de graphe), ADR-0033 (rangées), ADR-0040 (un nœud par intention)
- **Amende :** ADR-0014 §5 (les trois questions ne sont plus un seul nœud) ; ADR-0040 §2 (le Component redevient visible — comme contexte, pas comme question)
- **Ne décide pas :** la mise en mémoire tampon des transitions d'input — voir §3.4

---

## 1. Le défaut : la phrase la plus courante d'un débutant était inécrivable

> « Quand j'appuie sur Espace, saute. »

Le catalogue n'avait aucun moyen de dire cela. `Key` rendait trois booléens, donc il fallait :

```
On Update ──▶ Branch ──▶ Jump
                 ▲
      Key.Just Pressed
```

Trois nœuds et deux fils pour une phrase de cinq mots. Et le coût réel n'est pas le nombre
de nœuds : c'est que le créateur doit d'abord comprendre qu'**un appui n'est pas un moment
mais une valeur qu'on teste à chaque image**. C'est un concept de boucle de jeu, imposé
avant la première réussite.

Le nœud était par ailleurs rangé dans une catégorie `Input` portant la teinte des `Events` :
l'interface disait « ceci est un événement » et le modèle disait « ceci est un booléen ».

---

## 2. Décision : une propriété choisie se lit avec son Component

| | |
|---|---|
| **Ancienne décision** | ADR-0040 §2 : `component` est caché, et le sélecteur affiche le seul nom de la propriété. |
| **Problème** | Le nom seul est ambigu dès que deux Components déclarent `speed`, `position`, `enabled` ou `height` — ce qui est le cas normal et non un cas limite. Dans la LISTE une en-tête répond ; sur le nœud, fermé, il n'y a pas d'en-tête. |
| **Nouvelle décision** | **Un seul sélecteur, hiérarchique, comme avant.** Ce qui change est la lecture de la RÉPONSE : fermé, le contrôle affiche `Transform ▸ Rotation` ; ouvert, la liste garde les noms courts sous leurs en-têtes. Les propriétés du `.px` lui-même n'ont pas de préfixe : il n'y a qu'un Component possible. |
| **Justification UX** | Le Component redevient **visible comme contexte** sans redevenir une **question**. Le créateur ne le choisit jamais séparément ; il le lit. Deux sélections indépendantes restent refusées — c'était la faute d'ADR-0040 §1, et elle n'est pas réintroduite. |
| **Impact Core** | Aucun. Le stockage est inchangé : `component` + `property`, deux identités de portée projet. |
| **Impact runtime** | Aucun : c'est de la présentation. |
| **Sérialisation** | Aucune. |
| **Migration** | Aucune. |

### 2.1 Un glyphe, jamais un point

`Transform.rotation` est une expression de langage de programmation. `Transform ▸ Rotation`
est une direction : la propriété est **dans** le Component, et la forme le dit sans mot. Le
titre du nœud, lui, ne bouge toujours pas — `Get Property` reste `Get Property` (ADR-0040 §5).

---

## 3. Décision : un événement et un état sont deux nœuds

> **Un nœud qui a une sortie de FLUX déclenche quelque chose. Un nœud qui a une sortie de
> DONNÉE répond à une question. Aucun nœud ne fait les deux.**

| | |
|---|---|
| **Ancienne décision** | ADR-0014 §5 : un nœud `Key` répond aux trois questions — tenue, enfoncée à ce pas, relâchée à ce pas — en trois sorties booléennes. |
| **Problème** | Les trois ne sont pas la même sorte de chose. « Tenue » est un ÉTAT, vrai tant qu'on tient ; « enfoncée » est un MOMENT, vrai une fois. Les réunir en booléens force tout moment à passer par `On Update → Branch`, et fait porter au créateur une notion de boucle de jeu avant sa première réussite. |
| **Nouvelle décision** | **`On Key`** — nœud d'entrée, paramètre `Key`, deux sorties de flux `Pressed` et `Released`, aucune sortie de donnée. **`Key Is Down`** — nœud de donnée, paramètre `Key`, une sortie booléenne `Is Down`. Idem pour le pointeur : `On Pointer Button` et `Pointer Button Is Down`. |
| **Justification UX** | `On Key [Space] ▶ Jump` : un nœud, un fil. Chaque nœud a exactement une sémantique d'exécution, ce qui rend le catalogue enseignable — « une sortie de flux démarre, une sortie de donnée répond » est une règle sans exception. Le rangement suit : `On Key` est dans `Events`, `Key Is Down` dans `Input`. |
| **Impact Core** | Deux types de nœuds ajoutés, deux réécrits. Aucun nouveau vocabulaire : voir §3.1. |
| **Impact runtime** | `runEvent()` demande au nœud quels flux se déclenchent, au lieu de tous les suivre. |
| **Sérialisation** | Inchangée pour `Key Is Down` : le type `input.key` et le port `held` sont conservés exprès, donc tout graphe qui lisait `held` le lit encore. |
| **Migration** | Voir §3.3. |

### 3.1 Comment un nœud d'entrée dit ce qui s'est produit — sans vocabulaire nouveau

`runEvent()` suivait **toutes** les sorties de flux de tout nœud déclarant `event:`. C'était
indistinguable de « les suivre toutes » tant qu'aucun événement n'était **conditionnel**.

La réponse réutilise le contrat que tout nœud de flux respecte déjà :

```
execute(io) → portId | portId[] | null
```

C'est celui de `Branch` et de `Sequence`. Un nœud d'entrée qui déclare `execute` dit quels
flux partent ce pas-ci ; un nœud qui n'en déclare pas les déclenche tous — ce que veulent
`On Start` et `On Update`, et pourquoi aucun des deux n'a changé.

`continuationsOf()` lit les trois formes au même endroit, pour les deux appelants, afin
qu'un nœud d'entrée et un nœud de flux ne puissent pas diverger sur le sens de `null`.

### 3.2 Ce qui reste une condition, et pourquoi c'est délibéré

« Tant que je tiens Droite, avance » coûte toujours `On Update → Branch → Set`. C'est
**correct** : tenir une touche n'est pas un événement, c'est vrai à chaque pas jusqu'à ce
que ça ne le soit plus. En faire un événement mettrait au catalogue un nœud qui se déclenche
soixante fois par seconde en ressemblant exactement à celui qui se déclenche une fois.

### 3.3 Migration

| Graphe ancien | Après |
|---|---|
| lit `input.key` → `held` | **inchangé.** Le type et le port sont conservés ; seul le libellé devient `Key Is Down`. |
| lit `input.key` → `pressed` / `released` | le fil désigne un port qui n'existe plus. `validateGraph()` le signale (`UNKNOWN_PORT`), et l'interpréteur **saute le fil périmé et exécute le reste** — le graphe tourne, amputé, et le panneau dit où. |

Le second cas n'est **pas réécrit automatiquement**, et c'est un choix : un fil de donnée
vers une condition de `Branch` et une sortie de flux n'ont pas la même topologie, et deviner
laquelle le créateur voulait reviendrait à réécrire son graphe à sa place. Un signalement
visible vaut mieux qu'une réécriture silencieuse (ADR-0027 §8). Aucun jeu n'est maintenu
pendant cette phase, ce qui est précisément le moment de payer ce coût.

### 3.4 Ce que cette décision ne corrige pas

Un appui **et** un relâchement entre deux pas de simulation ne sont vus ni par l'ancien
modèle ni par le nouveau : `pressed()` est `enfoncée maintenant && pas au pas précédent`,
donc un tap trop rapide laisse les deux ensembles vides. C'est une propriété du modèle
d'input (ADR-0014 §5), antérieure à cette décision et non traitée ici. Un test la consigne
pour qu'elle soit constatée plutôt que redécouverte.

---

## 6. La matrice du glisser-déposer

Le critère est « **est-ce une action qu'un créateur peut raisonnablement vouloir faire ?** »,
jamais « est-ce facile à implémenter ». Chaque case dit ce que le geste SIGNIFIE ; une case
refusée l'est avec une phrase, parce qu'un refus silencieux est la pire réponse à un geste
(ADR-0026 §6).

### Vers le graphe

| Ce qu'on porte | Sur le canevas vide | Sur un nœud |
|---|---|---|
| **Object** (Hierarchy) | **Accepte** — déclare une entrée `objectref` nommée d'après l'Object, et pose un `Get Object` qui la lit. Aucune `ObjectId` n'entre dans le `.px`. | **Accepte** — pointe le nœud sur cet Object, en réutilisant l'entrée si elle existe déjà. |
| **Property** (Inspector) | **Accepte, après un choix** — menu `Get` / `Set`, puis un nœud **fini** : l'Object, le Component et la propriété étaient tous connus au moment du geste. | **Accepte** — écrit le chemin complet sur le nœud. |
| **Component** (Inspector) | **Refuse**, avec une phrase — voir §6.1. | **Refuse**, avec la même phrase. |
| **Resource** (Project) | **Accepte** — un nœud `Resource` tenant son identité. Rien n'est dupliqué : la ressource existe déjà. | **Accepte** si le nœud tient une ressource. |
| **Fichier** (hors du navigateur) | **Accepte** — importe dans le Project, puis pose un nœud `Resource` dessus. **Deux annulations**, voir §6.2. | **Accepte** si le nœud tient une ressource : importe, puis pointe. Idem. |
| n'importe quoi, canevas sans `.px` ouvert | **Refuse** — « il n'y a pas de Component ouvert sur ce canevas ». | — |

### Ailleurs

| Ce qu'on porte | Cible | Résultat |
|---|---|---|
| Object | propriété `objectref` | **Accepte** — assigne l'identité (ADR-0034 §3.5). |
| Object | Project | **Refuse** — un Object appartient à une scène ; le Project tient des ressources. |
| Component | Object (Hierarchy) | **Accepte** — l'ajoute à cet Object. C'est la signification principale de ce drag. |
| Resource | propriété `resource` | **Accepte** si la propriété déclare l'accepter. |
| Resource | scène / Hierarchy | **Accepte** — instancie. |
| Resource | dossier du Project | **Accepte** — déplace. |
| Fichier | Project / scène / Hierarchy / propriété / contenu | **Accepte** — importe, et fait ensuite ce que la cible veut dire. |

### 6.1 Component → graphe : refusé, et cette fois c'est mesuré

Le geste a été retiré une première fois **par argument** : le Component était caché, donc le
dépôt écrivait un paramètre que rien ne montrait. Il a été réactivé quand le contrôle s'est
mis à afficher `Transform ▸ …`, ce qui rendait l'effet visible.

À l'essai, le raisonnement ne tient pas :

> **Le sélecteur de propriété écrit les DEUX moitiés.** Un dépôt de Component règle
> `component` et laisse `property` ouverte ; la toute première action du créateur — choisir
> la propriété — réécrit `component`. Le seul effet du geste est remplacé par le geste
> suivant.

C'est exactement le critère posé pour cette tranche : « sans créer un paramètre qui sera
immédiatement remplacé par une autre action ». Et il n'existe pas de version « finie » de ce
geste : quelle propriété est précisément ce qu'un Component ne dit pas, et la deviner serait
la magie que cet éditeur refuse (ADR-0037 §2.4).

**Un Component garde donc une signification, une seule, et elle est ailleurs :** le donner à
un Object. Le refus le dit.

| Geste | Ce que le créateur veut | Ce qui est produit |
|---|---|---|
| Object → graphe | « travailler sur cet Object » | une entrée nommée + un nœud qui la lit — **fini** |
| Property → graphe | « lire/écrire cette valeur » | un nœud visé et configuré — **fini** |
| Component → graphe | — | rien qui survive au clic suivant |

### 6.2 Le dépôt d'un fichier n'est pas une seule annulation, et ne peut pas l'être

Mesuré : un Ctrl+Z retire le nœud, la ressource importée reste dans le Project.

Ce n'est pas un oubli de `batch`. Le geste écrit dans **deux ressources** — le manifeste du
projet pour l'import, le `.px` pour le nœud — et ADR-0024 donne à chaque ressource sa propre
pile. Une entrée couvrant les deux serait une annulation inter-ressources, que
ADR-0034 §3.7 laisse explicitement ouverte.

Le comportement est donc : **le nœud s'annule, la ressource reste**. C'est aussi le moins
surprenant des deux : une ressource importée est un fait du projet, et la faire disparaître
parce qu'on annule un nœud serait plus étonnant que de la laisser. Les dépôts qui n'écrivent
que dans le `.px` — Object, Property — restent, eux, atomiques (`batch`, ADR-0024 §4).

La même remarque vaut pour `Add Component ▸ Custom Component` : créer le `.px` et l'attacher
sont deux ressources, donc deux annulations.

### Ce qui reste délibérément refusé

| Geste | Pourquoi non |
|---|---|
| Fichier → graphe, plusieurs à la fois | Un nœud tient **une** ressource. Les autres seraient importées puis silencieusement perdues, ce qui est pire que ne pas les prendre. |
| Property → nœud qui ne travaille sur aucune propriété | Il n'y a rien à y écrire ; le refus dit où déposer. |
| Component → nœud, ou canevas | §6.1 : tout ce qu'il écrit est réécrit par le clic suivant. |

---

## 4. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `On Key` ne déclenche que le pas où la touche bouge | `interpreter.test.js`, via `Runtime.step()` |
| Une touche tenue cent pas ne déclenche qu'une fois | idem |
| `Key Is Down` reste vrai tant qu'on tient | idem |
| Le port `held` de `input.key` est inchangé | `nodes.test.js` |
| Un nœud d'événement n'a aucune sortie de donnée, et l'inverse | `nodes.test.js`, sur le catalogue réel |
| `On Key` est dans `Events`, `Key Is Down` dans `Input` | idem |
| Aucun nœud ne se renomme selon sa configuration | `nodes.test.js` (ADR-0040 §5) |
| Le contrôle fermé affiche `Transform ▸ Rotation` | `inspector/node.test.js` |
| La liste garde les noms courts sous leurs en-têtes | idem |
| Le chemin ne contient jamais de point | idem |

---

## 5. Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Garder les booléens et ajouter un nœud `On Key` à côté | Deux façons de lire une touche, dont une piège : `Just Pressed` en booléen reste un nœud qui se lit comme un état et se comporte comme un moment. |
| Un seul nœud `Key` avec flux **et** booléen | C'est le mélange qui rend Blueprints illisible pour un débutant : une boîte, deux sémantiques d'exécution, et rien dans le dessin qui dise laquelle s'applique. |
| Un paramètre `When [Pressed | Released]` au lieu de deux ports | Cache la moitié des possibilités derrière un choix fait avant que le créateur sache qu'il la veut, et rend incomposable « au relâchement, tirer » à côté de « à l'appui, viser ». |
| Faire de `Is Down` un événement continu | Un nœud qui se déclenche soixante fois par seconde en ressemblant à celui qui se déclenche une fois. |
| Réécrire automatiquement les anciens fils `pressed` | Deviner une topologie à la place du créateur. Le signalement est honnête, la réécriture ne l'est pas. |
| Deux listes déroulantes Component puis Property | La faute qu'ADR-0040 §1 a corrigée. Le Component redevient un contexte, pas une question. |
