# ADR-0038 — Le pointeur existe dans deux espaces, et c'est le viewport qui remplit le second

- **Statut :** **accepté** (2026-08-27)
- **Décide :** quelles coordonnées de pointeur un graphe `.px` lit, et qui les calcule
- **Dépend de :** ADR-0013 (caméra et viewport), ADR-0014 (l'input est passé au runtime), ADR-0027 (catalogue de nœuds)
- **Amende :** ADR-0014 §2 — la ligne « Position du pointeur en coordonnées monde » de ses alternatives écartées

---

## Contexte observé

ADR-0014 a donné au pointeur une place dans `InputState` et a tranché son espace :

> La position du pointeur est **en espace écran**. La convertir en coordonnées monde est le
> rôle de la caméra (`screenToWorld`, ADR-0013) […] le figer dans l'état d'entrée le rendrait
> dépendant de la façon dont on regarde la scène.

**Mesuré avant d'écrire une ligne :** `movePointer()`, `pointerX` et `pointerY` n'ont
**aucun lecteur** dans le dépôt. Un `grep` sur `src/` ne les trouve qu'à l'endroit où ils sont
définis. La décision de 2026-08-12 a donc fixé un espace de coordonnées **avant** que quoi que
ce soit ait à le lire, et cette tranche est le premier consommateur.

Or ce premier consommateur ne peut pas s'en servir :

| Ce qu'un nœud lirait | Ce qu'il pourrait en faire |
|---|---|
| `pointerX = 400`, `pointerY = 300` | rien — c'est le centre d'une surface dont il ignore la taille |
| pour en tirer le monde | il lui faudrait la caméra, le zoom, le pan et le viewport |

Et le contexte de pas ne porte **ni caméra ni viewport**, délibérément : `Runtime.step()`
reçoit `time`, `deltaTime`, `scene`, `runtime` et `input`. Y ajouter la vue rendrait la
simulation dépendante de la façon dont on la regarde — exactement ce qu'ADR-0014 protège, et
ce qui casserait le headless.

Le chemin était donc fermé aux deux bouts : le nœud ne peut pas convertir, et on ne peut pas
lui donner de quoi convertir.

---

## Décision

### 1. Les deux espaces coexistent ; aucun ne remplace l'autre

**VALIDÉ.** `InputState` garde `movePointer()` / `pointerX` / `pointerY` **inchangés**, en
espace écran, et gagne `movePointerInWorld()` / `pointerWorldX` / `pointerWorldY`.

Ce ne sont pas deux vues d'une même donnée :

```
écran   « où le pointeur est sur la surface »   fait brut du périphérique
monde   « ce que le pointeur désigne »          fait de jeu
```

**Aucune arithmétique ne relie les deux dans `InputState`**, et aucune ne le pourrait : la
correspondance appartient à un viewport que ce fichier ne doit jamais connaître. L'objection
d'ADR-0014 — « ne pas figer la conversion dans l'état d'entrée » — est donc tenue : rien n'y
est converti. Ce qui y est **écrit**, c'est un résultat, par celui qui avait de quoi le
calculer.

### 2. Le nœud lit le monde, parce que c'est le seul des deux qui soit jouable

**VALIDÉ.** `input.pointer` sort `x` et `y` en coordonnées monde.

Un `.px` doit pouvoir viser, suivre, poser quelque chose là où on a cliqué. Toutes ces
phrases parlent de la scène. Aucune ne parle de pixels.

> **Ce que cela coûte, et pourquoi c'est le bon prix.** La valeur écrite dépend de la caméra
> au moment où elle a été écrite. C'est le reproche qu'ADR-0014 faisait à cette voie — et
> c'est le **contenu même** de la donnée : « ce que le joueur vise » ne veut rien dire sans le
> point de vue depuis lequel il visait. Le fait n'est pas pollué par la caméra, il est
> constitué par elle.

### 3. Pour un serveur, c'est le monde qui est transportable — pas l'écran

**VALIDÉ, et c'est ce qui renverse l'argument d'ADR-0014.**

| Ce que le client envoie | Ce que le serveur peut en faire |
|---|---|
| « la souris était en (400, 300) » | rien, sans connaître la fenêtre et la caméra du client |
| « le joueur visait (120, −45) » | valider, simuler, réconcilier |

Seul le client possède un viewport. C'est donc **au client** de résoudre la visée, et au
serveur de recevoir la visée résolue. Exiger l'espace écran sur le fil obligerait le serveur à
répliquer la caméra de chaque client pour interpréter quoi que ce soit — c'est-à-dire à faire
entrer le point de vue dans la simulation autoritaire, précisément ce qu'on voulait éviter.

### 4. La conversion vit dans le viewport, et elle est pure

**VALIDÉ.** `editor/viewport/surface.js` gagne `locatePointer()`, qui énonce la chaîne
entière en un endroit lisible :

```
PointerEvent.clientX/Y  →  coin haut-gauche de la surface  →  pixels device  →  screenToWorld
```

Elle est **pure**, donc vérifiée sous Node contre les matrices mêmes avec lesquelles le
renderer dessine — pan, zoom, décalage de la surface dans la page, et rapport device/CSS.
C'est la seule partie du chemin du pointeur qui peut être fausse sans qu'aucune capture
d'écran ne le montre.

`Viewport.locate()` l'expose ; `PointerInput` l'appelle et **ne fait aucun calcul**.

### 5. Ce qui sort vers le Runtime est en pixels CSS et en unités monde, jamais en device

**VALIDÉ.** Le pas « pixels device » est un fait sur le backing store du canvas, pas sur le
jeu. Un `.px` doit lire les mêmes nombres sur un écran Retina et sur un écran ordinaire, sinon
un jeu se comporterait différemment selon la machine qui l'édite.

### 6. Le pointeur est indexé par owner comme le reste

**VALIDÉ.** La position monde vit sur `InputState`, donc `input.of(owner)` la sépare déjà par
joueur, sans une ligne de plus. Le navigateur n'a qu'une souris aujourd'hui ; ce n'est pas une
raison pour que le modèle n'en ait qu'une (ADR-0014 §3).

### 7. Les boutons ne gagnent aucune sémantique

**VALIDÉ.** `isButtonDown()`, `buttonPressed()` et `buttonReleased()` existent déjà, bornés au
même pas unique par le même `commit()` (ADR-0014 §5). `input.pointerButton` les expose sous les
trois mêmes mots que `input.key`.

Ce que le `.px` **stocke** est en revanche un **nom** — `"left"`, `"middle"`, `"right"` — et
non l'index. `InputState` indexe par numéro parce que c'est ce que rapporte chaque plateforme,
mais un `.px` est un fichier qui survit à la plateforme qui l'a écrit : il porte donc un nom,
comme `input.key` porte `"Space"`, et pour la raison qu'ADR-0014 §2 donne déjà. Il n'y a pas
deux numérotations pour autant — **la position dans la liste des noms EST l'index**, donc une
seule liste, lue par les deux bouts.

> **Mesuré dans l'Editor, et c'est ce qui a tranché.** Une première version stockait l'index
> avec des `labels`. Le contrôle Choice du canvas convertit sa valeur en chaîne avant de
> chercher son libellé (`ui/field.js`, `String(next ?? '')`), donc `0` ne retrouvait pas
> `Left` et le nœud affichait `0`. Des valeurs nommées sont la forme que ce contrôle sait
> déjà rendre — et, indépendamment de lui, la meilleure des deux pour le format.

---

## Ce qui n'est pas décidé ici

- **Le « game focus ».** Il n'a pas été nécessaire : l'adaptateur écoute la surface du jeu, donc
  une pression dans l'Inspector ne lui parvient jamais. Le jour où le jeu occupera plus d'une
  surface, ou une surface partagée, la question devra être posée pour de bon.
- **Delta et molette.** `InputState` n'en a pas, et rien ne les réclame encore.
- **Multitouch.** Un seul pointeur est suivi ; `pointerId` est ignoré.

---

## Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Une coordonnée de page n'est pas une coordonnée monde | une surface décalée dans la page |
| Le pan et le zoom composent | caméra déplacée **et** zoomée |
| Le rapport device ne change aucune coordonnée de jeu | même clic, deux backing stores |
| Les deux espaces sont indépendants | écrire l'un ne bouge pas l'autre |
| Un graphe lit le monde, jamais l'écran | écrire l'écran seul ne déplace rien |
| Une pression hors de la surface n'est pas un clic de jeu | `pointerup` seul, sur la fenêtre |
| Un relâchement hors de la surface termine la pression | `pointerdown` surface, `pointerup` fenêtre |

---

## Conséquences

### Positives

- Un `.px` peut viser, suivre et cliquer dans la scène, sans rien savoir de la caméra.
- Le Runtime reste sans DOM, sans `PointerEvent` et sans viewport ; le headless est intact.
- La conversion est testée contre les matrices réelles, hors navigateur.
- `pointerX` / `pointerY` cessent d'être une API morte sans que leur contrat bouge.
- Le chemin serveur est ouvert par la même donnée, sans second format.

### Négatives

- Deux positions au lieu d'une, donc deux choses qu'un adaptateur doit penser à écrire.
- La position monde est datée de la caméra qui l'a produite. Un enregistrement rejoué sous une
  autre caméra rejoue la visée, pas les pixels — ce qui est voulu, et qu'il faut savoir.
- ADR-0014 §2 se lit désormais avec cet amendement à côté.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Garder l'écran seul, et convertir dans le graphe** | Le nœud aurait besoin de la caméra et du viewport, donc de les faire entrer dans le pas de simulation. |
| **Mettre la vue dans le contexte de pas** | La simulation dépendrait de la façon dont on la regarde ; le headless n'aurait rien à y mettre. |
| **Remplacer l'écran par le monde** | Détruirait le fait brut du périphérique, seul utile à un futur curseur dessiné ou à une UI écran. |
| **Convertir dans `InputState`** | Il lui faudrait une caméra ; c'est exactement ce qu'ADR-0014 §2 refuse, et à raison. |
| **Un nœud `Screen To World` avec une caméra en entrée** | Reporte le problème : le nœud aurait toujours besoin d'un viewport, que le graphe n'a pas. |
| **Faire porter la conversion par l'adaptateur lui-même** | Le pan, le zoom et le rapport device sont au Viewport ; une seconde copie de cette arithmétique est une seconde chance de diverger. |
| **Un pointeur global hors `InputState`** | Un singleton, et la fin de l'indexation par owner (ADR-0014 §3). |
| **Stocker l'index du bouton dans le `.px`** | Fait dépendre un fichier de la numérotation d'une plateforme, et le contrôle Choice ne sait pas afficher une valeur non textuelle. |
