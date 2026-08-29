# ADR-0045 — Deux questions, deux lignes, et une étagère pour bouger

- **Statut :** **accepté** (2026-08-29)
- **Décide :** la forme des nœuds de propriété ; ce qu'un événement d'entrée continu s'appelle ; les catégories du catalogue ; ce qu'un champ de l'Inspector mesure ; ce qu'une propriété peut porter jusqu'au graphe
- **Dépend de :** ADR-0002 (espaces), ADR-0016 (un `.px` est un type), ADR-0023 §2 (pas de type vecteur), ADR-0026 (une frappe est une entrée d'historique), ADR-0031 (propriétés déclarées), ADR-0034 (portée des identités), ADR-0036 (frontière `objectref`), ADR-0039 (taxonomie), ADR-0043 (l'Object répond de lui-même)
- **Amendé par :** ADR-0046 (2026-08-29) — §4 : les trois moments d'une touche deviennent trois PORTS d'un seul nœud, ce qui règle l'objection d'ADR-0041 §3.2 mieux que trois noms. §9 : une couleur redevient un contrôle court. §10 : la poignée d'une propriété est celle du réordonnancement, et il n'y en a plus deux.
- **Amende :** ADR-0040 §2 et §4 (le Component redevient une question posée), ADR-0041 §3.2 (un événement continu existe, sous un autre nom), §6.1 (un Component peut être lâché sur un nœud), §2 (le chemin fusionné redevient deux lignes)
- **Ne décide pas :** l'unité d'un port en général — voir §11.4 ; `Destroy`, `Spawn`, `Random`, `Delay` — voir §11.5.

---

## 1. Le Component redevient une question, mais une question déjà répondue

ADR-0040 §2 a fusionné « quel Component » et « quelle propriété » en **une** ligne, parce que
deux dropdowns pour une chose étaient deux gestes là où le créateur en pense un. La décision
était juste sur le geste et a payé un prix qu'elle a elle-même mesuré : ADR-0040 §8 note que
« la liste de propriétés est plus longue : elle contient tous les Components du projet ».

Ce prix a grossi avec le projet. Un projet réel offre quatre-vingts lignes pour atteindre
`X`, et la ligne fusionnée ne les groupe pas — elle les concatène.

> **`Component` est une ligne, `Property` en est une autre, et `Component` est déjà
> répondu : « This Component ».**

C'est ce qui distingue cette décision de celle qu'ADR-0040 a écartée. Le Component n'est
**jamais vide** et ne bloque jamais : un nœud fraîchement posé lit `This Component ▸ …`, ce
qui est vrai et ce qu'un créateur voulait dans neuf cas sur dix. Répondre à la question est
facultatif ; la poser rend la liste d'en dessous lisible.

| | ADR-0040 | ici |
|---|---|---|
| Lignes | 1 | 2 |
| Le Component est | deviné du choix de propriété | choisi, avec une réponse par défaut |
| La liste de propriétés | tout le projet | celles d'un Component |
| Un nœud neuf | configuré | configuré |
| Changer de Component | impossible sans changer de propriété | un geste ; la propriété que le nouveau type ne déclare pas est retirée **dans le même lot** |

---

## 2. `Property`, pas le nom de la propriété

La sortie de `Get Property` s'appelle **`Property`**. Le picker deux lignes au-dessus dit
déjà laquelle ; répéter `Position X` sur le port le disait deux fois sur une carte de 176 px
sans apprendre à un débutant ce que le port **est**. Le nom et le type restent à un survol.

Cette sortie est **seule sur la dernière ligne**. Une ligne qui porte à la fois un contrôle
et un port qui doit parler pour lui-même ne laisse lire ni l'un ni l'autre.

---

## 3. `Object`, `Component`, `Property` : une colonne de questions

Les trois pickers d'un nœud de propriété se lisent de haut en bas comme une phrase :

```
  Object      Self              ← lequel
  Component   This Component    ← de quoi
  Property    Health            ← quelle valeur
```

Chacun a une réponse par défaut affichée, aucun n'est vide, et l'ordre est celui dans lequel
un créateur pense. C'est la forme qu'ADR-0039 §0.2 exige : un nœud posé est un nœud fini.

---

## 4. Un événement continu existe, et porte un autre nom

ADR-0041 §3.2 a refusé un événement clavier continu, et l'objection était **la
lisibilité** : un tel nœud aurait ressemblé au nœud à un coup, et deux cartes identiques
qui se comportent différemment sont pires que l'absence de la seconde.

L'objection portait sur le nom, pas sur le besoin. Trois noms distincts la lèvent :

| Nœud | Ce qu'il fait | Ce qu'on écrit avec |
|---|---|---|
| `On Key` | déclenche **au moment** où la touche descend, et au moment où elle remonte | sauter, tirer, ouvrir |
| `Key Down` | déclenche **à chaque frame** où la touche est tenue | marcher, viser, charger |
| `Key Is Down` | **répond** vrai ou faux, sans rien déclencher | une condition dans une branche |

`Pointer Button` a exactement les trois mêmes, dans les mêmes mots. « Marcher » coûtait
auparavant `On Update` + `Key Is Down` + `Branch` — trois nœuds pour la première chose que
tout débutant essaie.

---

## 5. `Self` est une ligne du picker, là où il y a un repli

Le champ `Object` d'un nœud de Transform ou de propriété affichait `Self` comme **état
vide**. Un créateur qui choisissait `Player` par erreur n'avait aucun retour : un enum offre
ce qu'il liste, et `Self` n'était pas listé.

`Self` est donc une ligne — **et seulement là où le paramètre déclare un repli**. `Get Object`
utilise la même sorte de référence et n'en a pas : sans socket nommé il ne transmet rien, et
offrir `Self` y décrirait un nœud qui existe déjà (`Self`) plutôt que celui-là.

`Parent` **n'est pas** une ligne. Le nœud `Parent` compose — il se branche sur n'importe quel
Object, pas seulement sur celui-ci — et une valeur sentinelle dans le picker serait un second
vocabulaire pour la même idée.

---

## 6. Un nom de propriété se lit pareil partout

L'Inspector écrit `Scale X` ; le picker du graphe écrivait `scaleX` pour la même propriété.
Un débutant qui passe de l'un à l'autre n'a aucune raison de croire que ce sont la même
chose. Le picker écrit désormais ce que l'Inspector écrit — et une propriété que le créateur
a déclarée lui-même passe par la même règle, une ligne plus loin, donc les deux s'accordent
encore.

---

## 7. Un champ numérique refuse ce qu'il ne pourra pas lire

Une lettre entrait, et disparaissait à la sortie : `Number('12a')` est `NaN`, `format(NaN)`
est `''`, donc **une frappe vidait un champ dont le modèle valait toujours 12**.

Deux règles remplacent cela :

1. Une saisie qui ne laisserait pas quelque chose **en chemin vers** un nombre est refusée
   au moment où elle est tapée. `-`, `1.`, `1e-` restent : ce sont des débuts de valeur.
   `12a` non.
2. Ce qui survit est normalisé **contre la dernière valeur bonne**, jamais contre `NaN`.
   La boîte ne peut donc pas finir vide, ni afficher ce que le modèle ne contient pas.

Le refus a lieu sur `beforeinput`, où le navigateur **demande** : chaque manière dont du
texte arrive y passe — frappe, collage, glisser, dictée, IME — donc un collage est filtré
par la même règle qu'une touche, et la sélection, les flèches et l'annulation du navigateur
ne sont jamais touchées, parce que rien n'est réécrit derrière le curseur.

Un piège mérite d'être nommé : `Number('')` vaut **zéro**. Une boîte vidée pour être
retapée signifie « rien pour l'instant » ; le langage y lit la valeur 0, et un contrôle qui
le croyait annonçait 0 à un panneau pour un objet que la scène tenait à 200.

---

## 8. Un Component qui est un fichier s'ouvre depuis l'Inspector

Un `.px` posé sur un Object est un document qu'on voudra éditer, et le seul chemin était de
quitter le panneau, retrouver la ressource dans Project et double-cliquer — trois étapes pour
atteindre la chose déjà nommée à l'écran. Les Components livrés n'ont pas de fichier : ils
n'ont donc pas de bouton, plutôt qu'un bouton désactivé.

Un Custom Component **créé** depuis l'Inspector s'ouvre de lui-même. « Ajouter un Custom
Component » n'est jamais l'intention complète : un `.px` vide ne fait rien, donc la chose
suivante que l'on veut est son canevas.

Le panneau **annonce**, il n'ouvre pas : quelle surface ouvre un `.px` est une décision du
shell (ADR-0006), et `px-open-resource` est l'événement que le panneau Project émet déjà
pour la même intention.

---

## 9. Un champ de l'Inspector mesure une ou deux cellules, jamais autre chose

Un contrôle faisait la largeur de ce qu'il contenait : un champ Sprite tenant `hero.png`
avait une largeur, le même tenant `a.png` une autre, et un champ vide était un moignon.
Douze lignes de cela font douze bords droits et rien à lire de haut en bas.

> **Le nombre donne la mesure. La colonne des valeurs vaut deux cellules égales : un nombre
> en prend une, tout le reste les prend toutes les deux.**

C'est déjà pourquoi `Rotation` finit là où finit le `X` de `Position`. La règle est
déclarée **une fois**, dans la primitive de ligne : chaque contrôle étire déjà ce qu'il a à
l'intérieur, mais rien ne lui disait quelle part de la ligne il possédait, et la réponse ne
peut pas être par contrôle sans que huit fichiers aient à s'accorder.

Un interrupteur est la seule exception, et il est **hors** de la règle plutôt qu'une
entorse : un bouton à deux états n'a pas de grandeur, donc l'étirer ne ferait qu'une plus
grande cible à manquer.

---

## 10. Une ligne appariée porte deux poignées, parce que c'est deux propriétés

Le Core n'a pas de type vecteur et ADR-0023 §2 a retiré l'idée délibérément. `Position` ne
nomme donc aucune propriété qu'un nœud pourrait lire, tandis que `x` et `y` en nomment une
chacune. Une poignée par moitié est la seule correspondance que le modèle puisse honorer —
et l'alternative, une ligne qu'on ne peut pas glisser, laissait **les trois propriétés les
plus utilisées de l'éditeur** comme les trois à partir desquelles on ne pouvait pas
construire un graphe.

La colonne de poignée est déclarée pour la ligne simple **comme** pour la ligne appariée,
même vide : dès que l'une seule la réservait, les deux cessaient de s'aligner.

---

## 11. Une étagère pour bouger

### 11.1 `Translate`, `Rotate`, `Scale`, `Set Position` sont une famille

`Properties` est où l'on regarde pour **lire** une propriété. « Je veux bouger mon objet »
n'y est pas répondu. Les quatre nœuds partagent donc une catégorie, `Transform`, et gardent
la teinte des propriétés : c'est une autre famille, pas une autre idée.

Une étagère qui ne tient qu'un nœud n'apprend rien ; `Translate` seul disait en plus,
faussement, que se déplacer était la seule chose sur laquelle le moteur avait un avis.

### 11.2 Relatif, sauf quand le nom dit le contraire

`Translate`, `Rotate` et `Scale` sont **relatifs**, comme leur nom le dit. `Set Position` est
absolu, comme le sien. La forme absolue existait déjà en `Set Property ▸ X` + `Set Property
▸ Y` : deux passages dans le picker pour dire une chose, ce qui est exactement le compte
qu'ADR-0040 a décidé de ne plus faire payer.

`Scale` **multiplie** — la seule lecture de « scale » qui compose — donc sa valeur neutre
est `1`, et une carte qui lit `X 1  Y 1` fait lire son caractère relatif sans l'expliquer.

### 11.3 Le port de `Rotate` s'appelle `Degrees`

`Transform.rotation` est stocké en radians et l'Inspector l'affiche en degrés. Un port appelé
`Angle` serait donc une question à deux réponses. Le nommer `Degrees` coûte un mot et
supprime la question — la technique que `Pressed` / `Released` / `Is Down` emploient déjà
(ADR-0041 §3).

### 11.4 Ce que cela ne décide pas

La conversion vit **dans ce nœud** et nulle part ailleurs : le Core stocke toujours des
radians. `Get Property ▸ Rotation` répond donc toujours en radians, et c'est une couture que
ce catalogue ne referme pas aujourd'hui. La refermer veut dire des ports qui déclarent une
unité et un Editor qui convertit au port : cela vaut son propre ADR, pas un effet de bord de
l'ajout d'un nœud.

### 11.5 Ce qui n'est pas codé, et ce qui manque pour l'être

| Nœud | Fréquence | Complexité | Ce qui manque |
|---|---|---|---|
| `Clamp` | haute | une ligne | rien — **fait** |
| `Lerp` | haute | une ligne | rien — **fait** |
| `Move` | — | — | rien à faire : c'est `Translate`, et c'est déjà un de ses mots-clés |
| `Random` | haute | une ligne | **une décision.** Un graphe répliqué doit produire la même partie chez tous les clients (ADR-0011, ADR-0019). Un `Math.random()` non semé désynchronise. Il faut décider où vit la graine et qui l'attribue. |
| `Delay` | haute | moyenne | **une décision.** Où vit le minuteur en attente, survit-il à un `bind` (ADR-0016 §7 dit que relier remplace le comportement), est-il sérialisé, que fait un `undo` ? |
| `Destroy` | haute | moyenne | **une décision.** Retirer un objet pendant que le pipeline l'itère ; et est-ce un `Operation` d'auteur ou une sortie de simulation (ADR-0003) ? |
| `Spawn` | haute | forte | **un concept.** Il n'y a pas de prefab. Instancier quoi, à partir de quoi ? |

Les quatre derniers sont laissés de côté **délibérément** : un nœud posé pour cacher une
question non résolue est un nœud qu'il faudra retirer.

---

## 12. Un Component peut être lâché sur un nœud qui en nomme un

ADR-0040 §4 et ADR-0041 §6.1 ont retiré ce geste deux fois, et pour la même raison : le
picker de propriété écrivait **les deux moitiés**, donc un lâcher qui posait `component`
était défait par le clic suivant — « rien qui survive au clic suivant ».

Cette prémisse a disparu (§1). `Component` est un contrôle à part : le lâcher écrit une ligne
que le créateur voit, le picker de propriété en dessous se restreint à ce Component, et rien
n'écrase rien. Réviser la cible d'un nœud est désormais un glisser plutôt qu'une
reconstruction, et la propriété que le nouveau type ne déclare pas part dans le même lot —
un seul `Ctrl Z` remet les deux.

Le canevas nu reste refusé : un Component lâché sur le vide ne dit pas ce qu'on veut en
lire, et produirait un nœud inachevé (ADR-0039 §0.2).

---

## 13. Un glissement de nombre n'est pas borné par l'écran

La valeur venait de `clientX - départ`, donc un glissement qui atteignait le bord de
l'affichage cessait de produire des nombres. Pointer Lock est la réponse de la plateforme :
le curseur sort de l'écran et la souris rapporte un **mouvement relatif**, donc le geste dure
aussi longtemps que le bras.

Le total est accumulé à partir de deltas plutôt que mesuré depuis une ancre, parce que le
verrou arrive **en retard** et peut être refusé — un navigateur sans, une page qui vient d'en
relâcher un, un `Esc` en cours de geste. Le curseur se fige là où le verrou l'a pris, donc le
repli se réancre tout seul et rien ne saute.

**Rien ne téléporte le curseur.** Le replacer au centre de l'écran est l'autre façon de faire
et c'est un bricolage : il se bat contre le système, casse les réglages d'accessibilité qui
surveillent le pointeur, et abandonne le curseur ailleurs que là où on l'a laissé si le geste
se termine mal.

---

## 14. Sortir d'une catégorie, c'est y revenir

Ressortir de `Transform` et retrouver le curseur sur la première ligne fait perdre sa place
à chaque fois qu'on regarde dans une catégorie et qu'on change d'avis. La catégorie que l'on
quitte est la seule chose à laquelle on pense encore : `→` `←` revient exactement là où `→`
a été pressé. Les trois sorties — la ligne `All categories`, `Escape` et `←` — partagent le
même chemin, parce que c'est une seule intention.

---

## 15. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Un nœud de propriété a trois lignes, dans l'ordre Object / Component / Property | `inspector/node.test.js` |
| Aucune des trois n'est jamais vide | idem |
| La liste de propriétés est celle du Component nommé | idem |
| Les noms de propriété se lisent comme dans l'Inspector | idem |
| Changer de Component retire la propriété absente, dans le même lot | idem |
| `Key Down` court à chaque frame tenue, `On Key` une fois | `runtime/pipeline.test.js` |
| `Rotate` tourne en degrés et le Transform garde des radians | idem |
| `Scale` multiplie ; `Set Position` n'additionne pas | idem |
| Un nœud de Transform sur un Object sans Transform ne dit rien | idem |
| `Clamp` borne dans les deux sens ; `Lerp` atteint ses deux bouts | `scripting/interpreter.test.js` |
| Une lettre n'entre pas dans un champ numérique | `ui/number.test.js` |
| Une boîte vide n'est pas la valeur zéro | idem |
| Un glissement continue au-delà du bord de l'écran | `ui/scrub.test.js` |
| Tout contrôle mesure une ou deux cellules | à l'œil, et au `getBoundingClientRect()` |
| `←` depuis une catégorie la resélectionne | à l'œil |
