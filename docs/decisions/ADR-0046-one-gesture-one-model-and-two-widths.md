# ADR-0046 — Un geste, un modèle, et deux largeurs

- **Statut :** **accepté** (2026-08-29)
- **Décide :** ce qui porte une propriété de l'Object ; combien de poignées porte une propriété ; ce que voit l'Inspector après la création d'un `.px` ; ce qu'un Component sans fichier s'appelle ; combien de nœuds décrivent une touche ; ce que mesure un contrôle ; ce qu'un identifiant peut contenir ; combien de modèles une ressource a
- **Dépend de :** ADR-0006 (une fenêtre annonce, le shell route), ADR-0011 (autorité), ADR-0014 (l'input est passé), ADR-0021 (une identité n'est pas un nom), ADR-0028 (réordonner), ADR-0041 (un événement est un moment), ADR-0043 (l'Object répond de lui-même), ADR-0044 (canal vivant), ADR-0045 (deux questions, deux lignes)
- **Amende :** ADR-0041 §3.2 (réglée autrement, voir §6) ; ADR-0045 §4 (trois nœuds deviennent trois ports), §9 (une couleur redevient courte), §10 (la poignée de la propriété est celle du réordonnancement)
- **Ne décide pas :** le transport du Preview (voir §1, qui explique pourquoi il ne change pas) ; l'unité d'un port ; `Rotation X/Y` ; le devenir d'une instance dont le fichier est supprimé (§5) ; le modèle Object/Component/Property des nœuds ; `Random`, `Delay`, `Destroy`, `Spawn`

---

## 1. Le transport du Preview ne change pas, et le legacy dit pourquoi

Le mécanisme legacy a été retrouvé et lu (`legacy/editor/misc/play.js`, `legacy/build/index.html`) :

```js
const app = window.open('/build/', '_blank', '…');
app.data = { host, port, online, objects: scene.objects };   // ← la scène de l'éditeur
```

```js
const editorObjects = window.data?.objects;
objects = editorObjects;         // les MÊMES objets
scene.init(objects, camera);     // que la fenêtre de jeu rend chaque frame
```

**Il n'y a pas de synchronisation : il y a de l'aliasing.** Aucun `postMessage`, aucun
`window.opener`, aucun événement `message` dans tout le chemin Editor ↔ Preview du legacy —
la recherche ne trouve `onmessage` que dans les WebSockets du réseau. Le Preview affichait
les objets vivants de l'éditeur parce que c'étaient littéralement les mêmes objets.

Le coût, mesuré et non supposé :

| Ce que l'aliasing donne | Ce qu'il coûte |
|---|---|
| Zéro ligne de synchronisation | Le Preview ne survit pas à `F5` : `window.data` disparaît |
| Fidélité parfaite — pas « synchronisé », **identique** | Le Preview n'est pas une URL, donc jamais un jeu publié |
| Aucune latence | **Jouer, c'est éditer** : le runtime du Preview mute la scène de l'éditeur |
| — | Deux Previews muteraient les mêmes objets et se battraient |
| — | Rien ne traverse, donc rien de ce chemin ne prépare un réseau |

Le legacy avait d'ailleurs **deux mécanismes disjoints** : l'aliasing ci-dessus, et 355
lignes de `network.js` — un message par sorte de mutation (`update`, `add`, `remove`,
`addComponent`, …) plus des `heartbeat` d'état complet. Le chemin local n'était pas un
transport dégradé du chemin réseau ; il le contournait entièrement.

### Comparaison

| Solution | Complexité | Sync temps réel | Plusieurs previews | Futur WebSocket | Futur WebRTC | Limites |
|---|---|---|---|---|---|---|
| Legacy / `window.open` + référence partagée | 24 lignes | totale, par construction | non — ils se battraient | **aucun apport** | aucun apport | pas de `F5`, pas d'URL, pas d'isolation, même processus |
| `postMessage` | ~60 lignes | oui | oui, mais il faut tenir la liste des fenêtres | proche | proche | il faut `noopener` en moins, un handshake de démarrage, une détection de fermeture, et un Preview ouvert par URL n'a pas d'`opener` |
| `BroadcastChannel` (actuel) | **29 + 40 lignes** | oui | **gratuit** | `openLiveChannel()` change, rien d'autre | idem | un seul navigateur |
| Abstraction de transport | + une couche | oui | oui | oui | oui | **prématurée** : la couture est déjà `openLiveChannel()` |

`noopener` est déjà passé à `window.open` (`editor/preview.js`), ce qui **rend le modèle
`postMessage` impossible sans le retirer** — et le retirer rouvre au Preview l'accès à
`window.opener.*`, c'est-à-dire exactement la porte que l'aliasing legacy était.

> **Décision : le canal reste celui d'ADR-0044.** Il est plus court que l'alternative,
> il n'a pas d'état à tenir, il marche pour un Preview ouvert par URL, et la seule fonction
> à changer le jour d'une WebSocket est déjà isolée. Aucune abstraction n'est ajoutée : il
> n'y a rien à abstraire tant qu'il y a une implémentation.

---

## 2. Les quatre propriétés de l'Object sont des propriétés comme les autres

`Name`, `Tag`, `Layer` et `Active` n'avaient pas de poignée. La cause tenait en un argument
manquant : le panneau dessinait leurs lignes sans nommer de Component, donc sans rien à
mettre dans la charge du glisser.

ADR-0043 avait déjà fait le travail — l'Object répond de lui-même sous son propre namespace,
et le catalogue l'expose comme un type. Les quatre lignes qu'un débutant rencontre **en
premier** étaient les quatre qu'un graphe ne pouvait pas atteindre, et aucune exception n'a
été créée pour les réparer : elles passent par le mécanisme qui existait.

---

## 3. Une propriété a une poignée, pas deux

Une propriété d'un `.px` portait deux poignées : une pour réordonner, une pour emporter.
C'était le coût honnête de deux gestes — et c'était la mauvaise affaire. Un créateur a **une**
intention, « prendre cette propriété » ; ce qui la distingue est l'endroit où il lâche.

La primitive le disait déjà : *« a gesture with no payload never leaves »*. Une section de
Component avait sa charge depuis toujours ; une propriété n'en avait pas. C'est la charge qui
arrive, pas un second mécanisme — et l'infobulle nomme désormais les deux destinations, sans
quoi la moitié du geste reste invisible.

---

## 4. Créer un Custom Component, c'est l'ouvrir ET s'y placer

Le canevas s'ouvrait, l'Inspector restait sur l'Object. Or un `.px` vide ne fait rien : la
chose suivante dont on a besoin est **une propriété**, et `Add property` vit dans l'Inspector.

Le panneau **annonce** l'ouverture (`px-open-resource`, ADR-0006) et **passe par l'arbitre**
pour la sélection : un Object et une Resource sont deux sujets mutuellement exclusifs, et
`Subject` est le seul endroit qui les tient ainsi. Écrire dans le Workspace directement
laisserait l'Object sélectionné dessous et les deux détenteurs en désaccord.

---

## 5. Une identité n'est pas un nom, même quand le fichier a disparu

Supprimer un `.px` encore attaché à un Object laissait un Component intitulé
`ffs2qex9nw0v` — reproduit exactement, au niveau du modèle :

```
BEFORE delete: label = "New Component"
AFTER  delete: still registered = true
AFTER  delete: label = "ffs2qex9nw0v"
```

Deux défauts distincts, et un seul est réglé ici.

**Réglé : le nom.** La chaîne de repli finissait sur le type, qui pour un `.px` **est** sa
ResourceId — précisément ce qu'ADR-0021 existe pour garder hors de vue. Un type que rien ne
peut nommer se lit désormais `Missing Component`. La condition est exacte et non heuristique :
`static definition` est ce que `defineComponent()` estampille sur une classe construite à
partir d'un payload de projet, tandis qu'un Component livré déclare `static schema`. Un type
qui vient d'un fichier et dont le projet n'a plus le fichier est un fichier disparu.

**Non réglé, et volontairement : l'instance.** Rien ne désenregistre le type, donc le
Component reste attaché et continue de tourner. Le convertir en `MissingComponent` — le
placeholder d'ADR-0021, qui conserve les valeurs et ne tourne jamais — est la suite évidente,
mais elle demande une décision : est-ce une Operation, se défait-elle avec le `Ctrl Z` de la
suppression, que voit un collaborateur ? Voir le rapport, §C.

À noter : **l'Editor n'offre aujourd'hui aucun geste de suppression de ressource.** Le défaut
est donc latent, pas atteignable par un créateur — ce qui est aussi la raison pour laquelle
il n'a pas été vu plus tôt.

---

## 6. Une touche est un nœud et trois ports

Il y en avait trois — `On Key`, `Key Down`, `Key Is Down` — et les deux premiers posaient la
même question à la même touche. Un créateur devait donc **connaître la différence avant** de
pouvoir choisir la carte qui la lui aurait apprise.

> **`On Key` a trois sorties : `Pressed`, `Released`, `Down`. `On Pointer Button` a les
> mêmes, dans les mêmes mots.**

Cela règle ADR-0041 §3.2 mieux que ne le faisait ADR-0045 §4. Cette section refusait un
événement continu parce qu'il *ressemblerait* au coup unique ; deux cartes qui se ressemblent
est un problème qu'une seule carte n'a pas.

**La sémantique est celle du runtime, pas celle du nœud.** `InputState` répond déjà aux trois
questions, et `commit()` borne les deux transitions à exactement un pas quelle que soit la
fréquence — donc un serveur rejouant des entrées calcule les mêmes trois réponses (ADR-0011,
ADR-0014 §5). Rien ici n'est un booléen portant le nom d'un événement.

| Port | Vrai quand |
|---|---|
| `Pressed` | la transition vers le bas a eu lieu **ce pas-ci** |
| `Released` | la transition vers le haut a eu lieu **ce pas-ci** |
| `Down` | la touche est tenue, **maintenant** |

Le pas où une touche descend est `Pressed` **et** `Down`, et les deux partent : « à l'appui,
puis à chaque pas » est ce que tenir une touche *est*.

**`Events` contre `Input`, et la ligne est celle du modèle :** ce qui **démarre un flux** est
un Event ; ce qui **répond à une question** est un Input. `Key Is Down`, `Pointer` et
`Pointer Button Is Down` restent donc dans `Input`, où ils sont ce qu'on demande à l'intérieur
d'une condition.

`input.keyDown` et `input.pointerButtonDown` sont **retirés**, sans alias : une seconde façon
de dire une chose est la duplication que cette recomposition supprime.

---

## 7. Deux largeurs, déclarées une fois

> **Un contrôle court prend une cellule ; un contrôle large prend les deux.**

Ce qui décide n'est pas le goût mais ce que le contrôle doit **montrer** : un nom de fichier,
le nom d'un Object, la course d'un curseur et une liste de lignes débordent d'une demi-colonne
— un nombre, un interrupteur, une pastille, un mot et une option choisie non.

`Color` était large « parce qu'une couleur est une valeur comme une autre », ce qui en faisait
la seule ligne dont le bord droit dépassait tous les nombres au-dessus. Corrigé : court.
`Alpha` reste large, parce qu'un curseur a une course.

**Dans un node, la règle ne peut pas être la même, et il faut le dire.** Une ligne d'Inspector
a une colonne de libellé et une colonne de valeur ; une ligne de node a 176 px et des ports
des deux côtés. Y appliquer « 50 % » laisserait à un nombre moins de place que n'en occupe sa
propre mécanique. Ce que les deux surfaces partagent est le **contrôle** et son descripteur,
pas la colonne.

Ce qui manquait au node était plus simple et bien réel : chaque ligne se mesurait seule, donc
`Get Property` — dont la première ligne porte une prise Object et pas les deux suivantes —
dessinait trois contrôles à deux abscisses différentes. **Un seul bord gauche par carte**, au
plus 8 px, et la colonne se lit. Le bord droit reste celui de chaque ligne : un port qui
**imprime** son libellé occupe vraiment cette place.

---

## 8. Un identifiant contient des chiffres, et c'est normal

`createId()` tire dans un base32 de Crockford — dix chiffres et vingt-deux lettres. Rien dans
ce moteur ne restreint un identifiant aux lettres : ni la génération, ni le stockage, ni
`idFromHash()` (qui prend tout ce qui suit `#p/`), ni les clés du magasin. Le seul sélecteur
CSS construit à partir d'un identifiant passe par une valeur d'attribut entre guillemets, où
un chiffre initial est sans effet.

La contrainte supposée n'existe pas. Une régression la fixe désormais, parce qu'une contrainte
absente est plus facile à réintroduire par accident qu'une contrainte écrite.

---

## 9. Une ressource, un modèle, même quand deux appelants la demandent en même temps

`#attach()` attend un chargement. Deux appelants arrivés dans le même tick voyaient donc tous
les deux « pas encore de modèle » et en construisaient chacun un : deux `ComponentDefinition`
sur un payload, deux historiques, et le second remplaçant silencieusement le premier dans la
table — **après** que le premier appelant l'eut capturé. `open()` basculait alors `open` sur
un enregistrement que plus personne ne détenait, l'annonçait, et aucune fenêtre ne dessinait
le document.

Ce n'est pas théorique : §4 ci-dessus atteint ce chemin depuis **un seul geste** — créer un
Custom Component l'OUVRE et le SÉLECTIONNE, et sélectionner attache. La promesse en vol est
partagée ; c'est ce qui fait de ces deux demandes un seul modèle.

---

## 10. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `Name`, `Tag`, `Layer`, `Active` portent une poignée | l'Inspector, à l'œil et au `getBoundingClientRect()` |
| Une propriété de `.px` a exactement une poignée | idem |
| Créer un Custom Component ouvre le canevas **et** place l'Inspector | à l'œil |
| Un `.px` supprimé ne se lit jamais comme son identifiant | `describeType`, en test |
| `On Key` a trois ports, et le pas de l'appui en allume deux | `nodes.test.js`, `pipeline.test.js` |
| `input.keyDown` n'existe plus, même en alias | `nodes.test.js` |
| Tout contrôle court mesure une cellule, tout large en mesure deux | mesuré dans Chrome |
| Une carte de node dessine ses contrôles depuis un seul bord gauche | `view.test.js` |
| Un identifiant à chiffres traverse URL, magasin et analyse | `store.test.js` |
| Deux `attach()` simultanés donnent un modèle | le workflow de §4, dans Chrome |
