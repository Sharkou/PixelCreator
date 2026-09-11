# ADR-0060 — Un second espace de dessin, et une seconde sortie

- **Statut :** **accepté** (2026-09-11)
- **Décide :** comment un texte est dessiné ; où vit la primitive ; ce qu'un HUD est ; quelle
  forme prend « ne pas bouger avec la caméra » ; où vit le son ; ce qu'un `AudioSource` est ;
  pourquoi il n'existe ni nœud `Stop Sound` ni mixeur ; quels nœuds de texte manquaient
- **Dépend de :** ADR-0004 (capacités optionnelles d'un Component), ADR-0005 (le rendu passe
  par une abstraction), ADR-0007 (schéma), ADR-0011 (le serveur fait autorité), ADR-0013 (la
  caméra est un Object, le viewport est une surface), ADR-0014 (l'entrée est passée, jamais
  cherchée), ADR-0020 (Resource, store asynchrone), ADR-0023 (un type dit ce qu'une valeur
  *veut dire*), ADR-0026 §6 (une table dit ce qu'un dépôt signifie), ADR-0048 (une propriété
  se nomme comme elle se lit), ADR-0054 (dire ce qui est vrai)
- **Ne décide pas :** le chargement de polices ; la mise en page (retour à la ligne,
  paragraphes, alignement vertical) ; un moteur d'UI ; un mixeur, des bus, des effets, le son
  spatialisé — voir §8

---

## 1. Problème

Trois choses manquaient entre « ça se joue » et « ça ressemble à un jeu » :

| Manque | Conséquence observée |
|---|---|
| **Aucun texte** | Un score existe dans le modèle et ne peut pas être montré. Le seul moyen d'afficher un nombre était `Log`, dans la console du navigateur |
| **Aucun son** | Un tir, une collision et une destruction se voient et ne s'entendent pas |
| **Aucun HUD** | Un Object placé à `(20, 20)` est à vingt unités de l'origine du **monde** : il sort de l'écran dès que la caméra bouge |

Les trois se règlent ensemble parce que les deux premières ne servent à rien sans la
troisième — un score qui s'en va avec le décor n'est pas un score.

---

## 2. Un HUD est un **espace**, pas une fenêtre

`ScreenSpace` est un Component. Un Object qui en porte un est dessiné à travers la **surface**
au lieu de la caméra : `(0, 0)` est le coin haut-gauche, une unité est un pixel CSS, et
`x = 20, y = 20` reste à vingt pixels du coin quoi que fasse la caméra.

```js
render(scene, { view, screen })     // deux matrices, deux espaces
```

**Deux matrices plutôt qu'une matrice et un drapeau.** L'appelant sait une chose que le
`SceneRenderer` ignore : sur un écran 2×, l'échelle de densité est **au-dessus des deux**.
Passer l'identité pour l'espace écran dessinerait le HUD à demi-taille, et seulement sur ces
écrans-là — le genre de bug qu'on ne voit pas sur sa propre machine.

**L'espace s'hérite, parce qu'une transform s'hérite.** `worldMatrix()` compose déjà un
enfant à travers son parent ; un enfant qui n'hériterait pas de l'espace serait positionné en
unités d'écran puis dessiné à travers la caméra, ce qui n'est jamais ce que quelqu'un voulait.
La question remonte la chaîne des parents — la même chaîne le long de laquelle la matrice est
composée.

**Il n'y a pas de second ordre de dessin.** Un HUD passe au-dessus parce que son `layer` est
plus haut. Trier les objets d'écran après ceux du monde serait une seconde règle qu'un
créateur ne peut lire nulle part dans l'Inspector.

**Et l'Editor le sait aussi.** Le picking, le contour de sélection, les poignées, le curseur
et le déplacement à la souris passent tous par `objectMatrix(object, view, screen)` : une
étiquette de HUD se clique là où elle est, et se déplace à la vitesse du pointeur même à 200 %
de zoom. Sans cela, l'Editor aurait affiché le HUD au bon endroit et l'aurait rendu
insaisissable — pire qu'une limitation, un mensonge.

### Pourquoi pas les trois autres formes

| Alternative | Pourquoi non |
|---|---|
| **`space: World \| Screen` sur chaque renderer** | La même décision écrite trois fois (`TextRenderer`, `Sprite`, `RectangleRenderer`), et un Object portant deux renderers pourrait être en désaccord avec lui-même sur *où il est*. « Où cet Object est-il dessiné » est une question sur l'**Object** |
| **Un booléen `fixed`** | Un drapeau obscur, sans nom pour ce qu'il fait, et sans place pour le second espace du jour où il en faudra un |
| **Une caméra d'UI séparée** | Une seconde caméra à tenir en phase avec le viewport, et une question nouvelle à chaque redimensionnement : ce que le HUD suit. L'écran *est* déjà cette caméra |
| **Un moteur d'UI DOM** | Un second arbre, un second système de layout, un second système d'événements, et un jeu publié qui ne peut plus être une seule surface. C'est un produit entier, et il n'est pas conçu |

### Ce que `ScreenSpace` ne porte pas

Aucun champ. Une **ancre** (`top-left`, `centre`, `bottom-right`) est la première chose que
l'on demande, et elle est délibérément absente : l'origine de la surface **est** déjà le coin
haut-gauche, donc une ancre serait un second système de coordonnées posé sur celui qu'un
créateur vient d'apprendre. Elle reviendra le jour où il y aura une mise en page à quoi
l'accrocher.

---

## 3. `fillText` est une primitive du contrat de rendu

Le Core ne touche pas au DOM et un Component non plus (ADR-0005). `TextRenderer` appelle
`renderer.fillText(text, x, y, { color, alpha, fontSize, fontFamily, align, baseline })`, et
seul `canvas2d.js` sait ce qu'est un canvas — exactement comme pour `Sprite`, `Tilemap` et
`ParticleSystem`.

**La police voyage en deux valeurs, jamais en raccourci CSS.** `16px sans-serif` ne veut rien
dire pour un backend WebGL qui rastérise ses propres glyphes. La composition de la chaîne vit
dans le seul fichier qui possède un canvas.

**Il n'y a pas de `measureText`.** Un Component qui poserait une **question** à son renderer
cesserait d'être dessinable sans lui : `bounds()` répondrait différemment sur un canvas, sur
un serveur et dans un test, donc le picking et le contour dépendraient de qui a dessiné en
dernier. L'étendue est donc **estimée** depuis la déclaration (`AVERAGE_ADVANCE`), ce qui
donne le même nombre partout. C'est faux de quelques pixels ; c'est faux **de la même façon**
sur toutes les machines, et c'est ce qui compte ici.

**Une ligne, pas un paragraphe.** `fillText` ne coupe pas sur un retour à la ligne et ce
composant ne prétend pas le contraire. Inventer une hauteur de ligne serait la première moitié
d'un moteur de texte que personne n'a conçu.

### Ce que `TextRenderer` déclare

```
Text          string   "Text"
Font Size     number   16
Font Family   string   "sans-serif"
Color         color    #ffffff
Align         choice   Left | Center | Right
Alpha         number   1
```

`fontSize` et non `size` : l'Inspector humanise un nom en libellé (ADR-0048), donc `fontSize`
se lit `Font Size` — et `size` entrerait en collision avec la ligne `Size` que `width`/`height`
forment déjà sur un `Sprite`, où elle veut dire autre chose.

Trois alignements et pas quinze options typographiques. `start`/`end`, la justification,
l'interlettrage et la direction sont de la typographie qu'un moteur 2D n'a aucune mise en page
où appliquer ; chacun est une ligne de plus le jour où quelque chose la lit.

---

## 4. Deux nœuds font le pont entre ce qu'un jeu *sait* et ce qu'il *montre*

`TextRenderer.text` est une propriété `string` ordinaire, donc `Set Property` l'écrit déjà.
Ce qui manquait était de **produire** la chaîne : `typesCompatible()` refuse un nombre sur un
port texte, délibérément et correctement (ADR-0023 — le type dit ce qu'une valeur *veut dire*),
donc un score n'avait aucun chemin vers une étiquette.

```
To Text      Value (n'importe quoi) → Text
Join Text    A (texte) + B (texte)  → Text
```

**Un seul port polymorphe, et le système de types l'avait déjà.** `ANY_TYPE` est l'*absence*
de contrainte, pas une union de formes : `To Text` ne coûte donc aucune règle nouvelle dans
`typesCompatible()` et aucun second type de socket — ce qu'auraient été `Number To Text` +
`Boolean To Text` + `Text To Text`, trois nœuds pour un acte et un créateur obligé de savoir
lequel son fil demande.

**Les deux ports de `Join Text` sont du texte, exprès.** Les typer `any` rendrait `To Text`
décoratif *et* réadmettrait en douce la conversion que le système refuse sur tous les autres
ports — un nombre se lirait comme du texte à un endroit et pas au suivant. Le fil qu'un
créateur doit tirer **est** l'énoncé qu'il l'a voulu (ADR-0054).

**Deux ports, pas N.** Trois morceaux, ce sont deux `Join Text` — ce qui se lit de gauche à
droite exactement comme la phrase. Un nombre de ports configurable ferait de ce nœud le
premier du catalogue dont il faut régler la **forme** avant de pouvoir le câbler.

**Et pas de formateur.** `"Score: {0}"` serait un petit langage avec sa syntaxe, ses erreurs et
ses règles d'échappement, à apprendre avant que la première étiquette marche. Convertir et
concaténer sont les deux actes dont ce langage serait fait, et ils sont déjà de la forme d'un
graphe.

`To Text` répond **vide** pour `null`, pour `NaN`, pour les infinis et pour une poignée
d'Object : un accident d'arithmétique n'atterrit pas à l'écran, et il n'existe aucun nom
stable d'Object à montrer — `Get Property ▸ Object ▸ Name` est le nœud qui répond à la
question réellement posée.

---

## 5. Le son est une **sortie**, comme le rendu

```
AudioOutput
  play(clip, { volume, loop, rate }) -> handle | null
  stop(handle)
  set(handle, { volume, rate })
  unlock()
```

C'est le même joint qu'`ADR-0005` dessine pour le rendu, et pour les mêmes trois raisons : le
Core et la simulation restent sans DOM, un serveur qui arbitre une partie construit un Runtime
**sans sortie** et se tait, et un test est un objet littéral de vingt lignes au lieu d'un
navigateur simulé.

**Un clip est un `ResourceId`, et c'est le backend qui le résout.** La simulation nomme ce
qu'elle veut entendre par identité, exactement comme `Sprite.source` nomme une image : aucun
Blob URL, aucun élément, aucun octet n'approche jamais d'une valeur sérialisée. Transformer
une identité en quelque chose qu'un haut-parleur accepte demande les payloads du projet —
savoir que l'application possède et que le Runtime ne doit pas (ADR-0020 §5). Le backend est
donc construit **avec un résolveur**, et le Runtime reçoit le backend.

**Le son n'est jamais une entrée de la simulation.** Un Runtime sans sortie audio produit
exactement le même état que le même Runtime avec : c'est ce qui garde le déterminisme intact,
et pourquoi un serveur muet n'est pas un serveur cassé.

### La règle d'autoplay est réelle, et elle n'est pas cachée

Tous les navigateurs actuels refusent de sonner avant une interaction. Un `play()` refusé
**rejette sa promesse** — donc un jeu qui démarre sa musique au premier pas serait simplement
muet, avec un rejet non traité dans la console et rien d'autre à quoi se raccrocher.

| Cas | Traitement |
|---|---|
| Le refus | attrapé, **compté** (`output.blocked`), jamais avalé |
| Un son **tenu** (qui boucle) | mémorisé, et démarré par `unlock()` |
| Un **one-shot** | abandonné — un coup de feu d'il y a huit secondes n'est plus un coup de feu |
| `unlock()` | appelé par l'application à la première vraie touche ou au premier clic |

`unlock()` est dans le contrat parce que « cette personne a-t-elle cliqué » est un fait sur un
**navigateur**, pas un état du jeu : un graphe ne doit jamais pouvoir le lire.

Dans l'Editor, le geste qui déclenche tout est **le bouton Play lui-même**, ce qui est la
forme la plus honnête possible : le créateur a cliqué, donc le son est autorisé.

### Pourquoi un élément et pas `AudioContext`

Un `HTMLAudioElement` joue la data URL que le store détient déjà, avec un volume, une boucle et
une vitesse, en quatre lignes et sans étape de décodage à ordonnancer. Un graphe Web Audio
achète l'ordonnancement à l'échantillon près, les effets et le mixage — trois produits que
personne n'a conçus. Le jour où l'un d'eux l'est, c'est un second fichier à côté de
`html-audio.js`, et rien d'autre ne bouge.

**Un élément par son, pas un par clip.** Deux tirs dans la même seconde doivent se superposer,
et un élément rembobiné coupe le premier — c'est exactement ce que fait un élément partagé, et
exactement ce que ça s'entend.

---

## 6. `AudioSource` est l'**état**, `Play Sound` est le **moment**

Un coup de feu est un **moment** : il n'a pas d'état, rien ne peut changer une fois qu'il est
parti, et le nœud qui le tire est `Play Sound`. Une bande-son est un **état** : allumée ou
éteinte, à un volume qu'un fondu change, et elle vit aussi longtemps que l'Object. Un état
appartient à un Component — l'Inspector le montre, le format le sauvegarde, `Set Property`
l'écrit ; un moment, non.

```
Audio Source
  Clip     resource<asset, audio/>
  Volume   0 → 1
  Loop     true
  Playing  false
```

**Il n'y a donc aucun nœud `Play` ni `Stop` pour lui, et c'est tout le dessin.** `playing` est
un booléen ordinaire : lancer la musique est `Set Property AudioSource.playing = true`,
l'arrêter est le même nœud avec `false`. Un `Play Sound` visant un Component serait une
seconde façon d'écrire une valeur que `Set Property` écrit déjà, et les deux se
contrediraient la première fois que l'une serait utilisée pendant que l'autre est suspendue
dans un `Delay` (ADR-0058).

**Et un fondu est un `Tween` sur `volume`,** pour la même raison : le mixeur que personne n'a
conçu n'est pas nécessaire pour baisser une musique, parce que le Property System anime déjà
les nombres et que la sortie accepte déjà un nouveau volume sur un son en cours.

**Le composant est un réconciliateur, jamais un commandé.** À chaque pas il fait coïncider ce
qui sonne avec ses valeurs : c'est ce qui rend l'état après un chargement, après un undo et
après une opération réseau identique, parce que les trois finissent sur les mêmes valeurs.
Changer le clip ou la boucle **remplace** le son ; changer le volume ne fait que l'ajuster —
la différence entre ce qu'un son *est* et à quel point il est fort.

**Un `AudioSource` par Object, et ça tombe du modèle.** Un Object porte au plus un Component
d'un type (ADR-0004), donc un Object qui a besoin de trois sons n'obtient pas trois
`AudioSource` : il les tire avec `Play Sound`. La séparation n'est pas un goût, c'est une
conséquence.

### `onRemoved(self, ctx)` — une quatrième capacité optionnelle

Un réconciliateur qui ne tourne plus laisse sonner la dernière chose qu'il a demandée. Or
`onDetach(self)` — qui existait déjà — se déclenche quand un **Component quitte un Object**, et
détruire un Object n'enlève rien de lui. Il manquait donc l'événement « l'Object a quitté la
Scene ».

Le Core **nomme** la capacité et **lève** l'événement (`Scene.remove()` l'annonce déjà, pour
l'objet et pour chaque descendant) ; c'est le `Runtime` qui l'**appelle**, parce que c'est lui
qui détient le contexte qu'un Component demanderait — la sortie audio, la scène, l'heure — et
parce qu'il isole déjà un Component qui lève (ADR-0012). Un ennemi détruit qui continue de
vrombir est le bug que cela ferme.

---

## 7. Une ligne de plus dans la table, et rien d'autre

« Un son est un `AudioSource` » est la même phrase qu'« une image est un `Sprite` » (ADR-0026
§6). Aucune seconde infrastructure de drag & drop n'a été écrite :

```
image → Sprite(source)        width/height   ligne existante
audio → AudioSource(clip)     playing: true  ligne ajoutée
```

`playing: true` fait que le geste **répond** : un `AudioSource` neuf est muet exprès — ajouter
un Component ne doit jamais faire un bruit que personne n'a demandé — mais glisser un son dans
un jeu, c'est le demander, et un dépôt qui produit un composant inerte est ce qu'ADR-0026 §6
appelle la pire réponse possible à un geste.

Le même raisonnement s'applique deux fois de plus :

- **Le `+` du Project** gagne `Sound…` à côté d'`Image…` : une ligne, un `accept`, et l'import
  lui-même est écrit une fois.
- **L'icône d'une ressource** cesse de dépendre du seul `kind`. Une image et un son sont le
  **même** kind (ADR-0020 §2) et c'est juste ; ce qui diffère est ce qu'un créateur regarde, et
  une vignette d'image sur un `.mp3` est un panneau qui dit quelque chose de faux (ADR-0054).
  Le mime décide, par préfixe, en deux lignes de table.
- **L'Inspector d'une ressource audio** propose un lecteur `controls` — le seul contrôle de
  l'Editor qui fait du bruit, et seulement quand on appuie dessus.

---

## 8. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Le chargement de polices** | Une famille est une chaîne que la surface sait déjà résoudre. Une police **livrée** est une Resource, un pipeline et un ADR à elle |
| **La mise en page du texte** | Retour à la ligne, paragraphes, alignement vertical, mesure exacte : c'est un moteur de texte, et §3 dit pourquoi la mesure ne peut pas passer par le renderer sans casser `bounds()` |
| **Un moteur d'UI** | Boutons, champs, focus, layout, événements : un produit entier. Le HUD de cette tranche est fait d'Objects, ce qui est honnête et suffit pour un score et un « You win! » |
| **Une ancre de `ScreenSpace`** | §2. Elle a besoin d'une mise en page à quoi s'accrocher |
| **Un mixeur** | Bus, groupes, ducking, effets : chacun est une décision sur un mixeur, et un mixeur est un produit que personne n'a conçu |
| **Le son spatialisé** | Pan, atténuation, listener. La forme du contrat ne l'interdit pas — c'est un `set(handle, …)` de plus — mais ce qu'il *veut dire* dans un jeu 2D est une décision produit |
| **Le son dans le rendu de l'Editor hors Play** | L'Editor ne simule pas en mode édition (ADR-0029 §1), donc rien ne sonne tant qu'on n'a pas appuyé sur Play. C'est voulu : un panneau qui joue de la musique pendant qu'on range une scène est un panneau qu'on coupe |
| **Le décodage des formats** | Ce que le navigateur sait lire, il le lit ; `.mp3`, `.ogg`, `.wav` sont déjà dans la table des extensions. Il n'y a pas de transcodeur et il n'y en aura pas ici |

---

## 9. Contre-épreuves

| Ce qui est vérifié | Où |
|---|---|
| Un `TextRenderer` neuf montre quelque chose, et son schéma dit la même chose que son constructeur | `runtime/rendering/components/text-renderer.test.js` |
| Un nombre écrit par un graphe se dessine, et `0` n'est pas « rien » | idem |
| Un texte vide et une taille nulle ne dessinent rien du tout | idem |
| La police est composée `18px Georgia, serif` et l'alpha est rendu au suivant | idem |
| Position, rotation, échelle, parentage, `layer`, `active`, `Component.active` | idem |
| L'étendue suit le texte, la taille et l'alignement | idem |
| Aller-retour de sérialisation, et rien d'autre que les clés du schéma | idem |
| La caméra bouge le monde et laisse le HUD où il est | `runtime/rendering/space.test.js` |
| La matrice d'écran s'applique au-dessus, donc un écran 2× ne divise pas le HUD par deux | idem |
| L'espace s'hérite sur deux niveaux, et s'éteint avec `active` | idem |
| Tous les renderers l'honorent, parce que la décision appartient à l'Object | idem |
| `layer` décide toujours ce qui couvre quoi | idem |
| `To Text` : nombre, booléen, texte, `null`, `NaN`, infini, poignée d'Object | `core/graph/nodes.test.js` |
| `Join Text` refuse un nombre, ce qui donne son sens à `To Text` | idem |
| `"Score: " + score` en exactement deux nœuds | idem |
| Un backend audio incomplet est nommé ; un volume est borné en un seul endroit | `runtime/audio/audio.test.js` |
| Un clip inconnu ne joue rien ; deux sons d'un clip sont deux éléments | idem |
| Un refus d'autoplay est compté ; une boucle refusée repart à `unlock()`, un one-shot non | idem |
| `AudioSource` est réconcilié : demander cinq fois joue une fois | idem |
| `playing = false` arrête ; le volume ajuste ; le clip remplace | idem |
| Un Object détruit, un parent détruit, un Component retiré : le son s'arrête | idem |
| Un handle n'est jamais sérialisé ; `playing: true` rejoue au chargement | idem |
| `Play Sound` : picker, fil prioritaire sur picker, clip vide, Runtime sans sortie | idem |
| Un hôte sans `Audio` du tout ne plante pas | `editor/project/session.test.js` |

---

## 10. Conséquences

### Positives

- Un score s'affiche, change et se lit — avec `Set Property`, `To Text` et `Join Text`, sans
  vocabulaire nouveau.
- Un HUD tient en place, dans le Preview **et** dans l'Editor, y compris sous le pointeur.
- Un tir, un impact et une musique s'entendent, et la règle d'autoplay est traitée plutôt que
  contournée.
- Le contrat audio est le contrat de rendu une seconde fois : un serveur muet, un test
  littéral, un backend Web Audio possible sans rien bouger d'autre.
- Deux lignes de table (image, audio) couvrent l'import, le DnD, l'icône et l'Inspector.

### Négatives

- `RENDERER_OPERATIONS` gagne une opération : tout backend et tout double de test doit
  fournir `fillText`.
- `bounds()` d'un texte est une estimation, et le dit. Un contour de sélection est faux de
  quelques pixels sur une police très étroite ou très large.
- `SceneRenderer.render()` gagne un argument, et cinq fonctions de l'Editor gagnent un
  paramètre optionnel `screen`. Leur défaut est `view`, donc aucun appelant existant ne change.
- L'Editor ne fait aucun bruit avant Play, ce qui peut surprendre — et c'est le comportement
  voulu (§8).
