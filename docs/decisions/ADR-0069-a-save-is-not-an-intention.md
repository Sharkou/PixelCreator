# ADR-0069 — Un enregistrement n'est pas une intention

- **Statut :** **accepté** (2026-09-12)
- **Décide :** ce qu'une History enregistre ; ce qui dit quel document est en cours d'édition ; ce qu'un raccourci possède ; ce qu'un coup de pinceau coûte à l'historique ; ce que « Nouveau projet » veut dire
- **Dépend de :** ADR-0003 (une Operation par intention), ADR-0008 (`previous` rend l'inverse possible), ADR-0019 (Operations), ADR-0024 (une pile par ressource), ADR-0044 (l'Editor est l'autorité), ADR-0065 (un projet survit à l'onglet), ADR-0068 (peindre une Tilemap)
- **Ne décide pas :** la collaboration temps réel, un undo global inter-documents, un format d'Operation réseau — voir §7

---

## 1. Le défaut

`Ctrl Z` ne faisait **rien** dans l'Editor. Pas « rien pour la peinture » : rien pour une
propriété d'Inspector, rien pour un redimensionnement, rien pour un déplacement d'objet — dans
tout projet assez vieux pour s'être sauvegardé une fois, c'est-à-dire tous.

Ce qui était déjà établi et qui était vrai : le keydown atteignait le handler, `History`
passait ses tests, les Operations et les batches fonctionnaient. **La pile que le shell
consultait était vide.**

---

## 2. La cause : une écriture se faisait passer pour une intention

```js
// project.js, save()
this.#store.write(snapshot(resource), payload);
this.setProperty(id, 'revision', resource.revision + 1);   // ← Origin.EDITOR
this.setProperty(id, 'modified', Date.now());              // ← Origin.EDITOR
```

`revision` et `modified` sont des faits **à propos** d'une écriture. Estampillés comme une
intention d'Editor, ils faisaient deux choses, et la seconde était fatale :

1. ils s'empilaient dans l'historique du manifeste — « annule le fait que ceci a été
   sauvegardé » n'est pas une phrase ;
2. ils **déplaçaient le contexte** : `Workspace.#context` était « le pipeline qui a émis en
   dernier », donc l'autosave annonçait, six cents millisecondes après chaque édition, que le
   créateur travaillait maintenant dans le manifeste.

`activeHistory` renvoyait alors la pile du manifeste, où la seule chose à reprendre était la
comptabilité de la sauvegarde elle-même. Invisible, silencieux, et à chaque fois.

> **Le correctif est une phrase : seul ce que quelqu'un a voulu entre dans un historique.**

| Où | Quoi |
|---|---|
| `project.js` | `save()` estampille sa comptabilité `Origin.LOCAL` — « personne n'a demandé ceci » |
| `history.js` | une History n'enregistre que `Origin.EDITOR` |
| `workspace.js` | seul un `Origin.EDITOR` dit quel document est travaillé |

Et le filtre par origine ferme du même geste la question d'ADR-0044 : une opération arrivée du
réseau, déjà décidée ailleurs, n'entre pas dans la pile locale. `Ctrl Z` ne veut pas dire
« annule la dernière chose faite par n'importe quel onglet » — il y a maintenant une
contre-épreuve qui le dit.

---

## 3. Le clavier demande, il ne possède pas

```
shortcutFor(event)   →  'undo' | 'redo' | 'save' | null      une fonction, testable sans DOM
applyShortcut(action, { workspace })                          demande au Workspace, à l'instant
```

Aucune History n'est capturée nulle part : ni au boot, ni dans le handler, ni dans l'objet de
session — qui expose désormais un **getter** plutôt qu'un instantané. Changer de document,
fermer un éditeur, ouvrir un autre projet ne recâble rien.

| Touche | |
|---|---|
| `Ctrl Z` / `Cmd Z` | annuler |
| `Ctrl Shift Z` / `Cmd Shift Z` | rétablir |
| `Ctrl Y` | rétablir aussi — ce que la moitié des créateurs essaient d'abord, et rien d'autre ne l'utilise |
| `Ctrl S` / `Cmd S` | enregistrer ce qui est travaillé |

**La règle du champ de texte, dite et testée.** `applyShortcut` répond s'il a **fait** quelque
chose, et `editor.js` n'appelle `preventDefault()` que dans ce cas. Un créateur qui tape un nom
a une pile à lui : `Ctrl Z` reprend le renommage. Quand il n'y a rien à nous à reprendre, la
touche est laissée au navigateur et son undo de texte a lieu. Voler la touche dans les deux cas
ferait de l'édition d'un nom le seul endroit de l'Editor où l'annulation ment.

**Entre projets.** Deux projets sont deux Workspaces : un undo dans l'un n'atteint jamais
l'autre. Et **une scène à la fois** — la règle que le Workspace avait déjà : ouvrir la seconde
ferme la première et **emporte sa pile**, listeners compris.

---

## 4. Un coup de pinceau coûte le coup de pinceau

`SET_PROPERTY` porte la valeur entière : juste pour un nombre, une couleur ou un nom, ruineux
pour une grille. Peindre cent cellules d'une carte de 1000 × 1000 écrivait cent opérations
portant chacune **deux copies d'un million de nombres**.

```
map = 1 000 000 cellules, stroke = 100 cellules
avant :  100 opérations × 2 × 1 000 000  =  200 000 000 valeurs retenues
après :    1 entrée, 100 cellules × 2     =            200 valeurs retenues
```

> **`SET_CELLS` : des INDEX, avec la valeur qu'ils avaient et celle qu'ils prennent.**

| Décision | Raison |
|---|---|
| une opération, pas un cadre générique | elle dit ce qu'elle fait : « mets ces cases de ce tableau à ces valeurs ». Assez générale pour le prochain gros tableau, et pas une abstraction inventée pour un usage unique |
| **ce n'est pas une seconde vérité** | `Tilemap.tiles` reste le tableau réel ; un patch est la *description* d'une mutation. L'appliquer lit le tableau, le copie, change les index nommés et le réécrit **par la même écriture de propriété** que `SET_PROPERTY` — donc le même Change, les mêmes observateurs, le même fichier |
| l'inverse échange les deux valeurs de chaque cellule | exactement ce que `SET_PROPERTY` fait, cellule par cellule |
| une cellule déjà égale n'entre pas dans le patch | et un index n'y apparaît jamais deux fois |
| le resize garde un instantané complet | changer 1000 × 1000 en 500 × 500 change structurellement toute la grille : une entrée, un tableau, et l'undo rend dimensions **et** contenu (ADR-0068 §6). L'optimiser serait compliquer un contrat correct |

**La persistance n'a pas bougé.** Le fichier de projet contient `tiles`, un tableau de nombres,
et rien de l'historique n'y fuit — ce qui est aussi pourquoi une grille déclarée `n × m` est
désormais **dense dès sa construction** : un patch qui remplit l'index 6 d'un tableau vide
laissait cinq trous, et un trou devient `null` dans un fichier où un créateur attend un zéro.

---

## 5. Ce que ça coûte, mesuré

`node tools/bench-tilemap.mjs`

| carte | cellules | stroke | entrées d'historique | valeurs retenues |
|---|---|---|---|---|
| 100 × 100 | 10 000 | 100 | 1 | **200** |
| 1000 × 1000 | 1 000 000 | 100 | 1 | **200** |

La carte grandit cent fois ; le coût ne bouge pas. Compté en **valeurs** plutôt qu'en
millisecondes parce que c'est le nombre qui est le même sur toutes les machines.

---

## 6. « Nouveau projet » demandait d'oublier, pas de créer

Le menu écrivait : `localStorage.removeItem(LAST_OPENED)`, puis rechargeait. Mais *ne rien se
rappeler* veut dire « ouvre le projet le plus récemment modifié » (ADR-0065 §4) — qui est
précisément celui qu'on venait de quitter. **Le bouton rouvrait le projet dans lequel il avait
été pressé.**

Oublier n'est pas demander : l'intention s'écrit (`NEW_PROJECT`), et `resume()` l'honore avant
d'aller chercher quoi que ce soit. Sans rien de mémorisé, le repli sur le projet le plus récent
reste le bon comportement — c'est un navigateur qui a perdu une commodité, pas un créateur qui
a demandé une page blanche.

---

## 7. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Collaboration temps réel** | Le filtre d'origine dit ce qu'un undo local n'est pas ; ce qu'un undo *partagé* serait — annuler l'opération de quelqu'un d'autre, ou la sienne dans un document que deux personnes écrivent — est une décision de produit qui n'a pas encore de produit |
| **Un undo global inter-documents** | ADR-0024 a tranché l'inverse, et la raison tient toujours : `Ctrl Z` dans la fenêtre Graph ne doit pas reprendre un déplacement dans la scène |
| **Rouvrir une scène ressuscite sa pile** | Une pile vit avec son éditeur : rouvrir donne une pile vide. Conserver les piles des scènes fermées demanderait de décider combien de temps, et pour quelle mémoire |
| **Un `SET_CELLS` pour d'autres tableaux** | L'opération est générale ; le deuxième usage n'existe pas encore, et on ne généralisera pas avant |

---

## 8. Contre-épreuves

| Vérifié | Où |
|---|---|
| Sauver ne déplace pas l'undo hors du document édité | `editor/project/workspace.test.js` |
| La comptabilité d'une sauvegarde n'entre dans aucun historique, et la révision bouge quand même | idem |
| Une opération que personne n'a voulue n'est pas annulable | idem |
| `Ctrl` et `Cmd`, `Shift Z` et `Y`, et ce qui n'est pas un raccourci | `editor/shortcuts.test.js` |
| L'undo vise le document travaillé, demandé au moment de la frappe | idem |
| Un autosave entre les deux ne change rien | idem |
| **Sans rien à nous à reprendre, la touche est laissée au navigateur** | idem |
| Un undo dans un projet n'atteint jamais l'autre | idem |
| Ouvrir une autre scène ferme la première et emporte sa pile | idem |
| Fermer un éditeur ne laisse aucun listener | idem |
| Un stroke coûte les cellules peintes, pas les cellules de la carte | `editor/viewport/tools/tile-tool.test.js` |
| **Contre-épreuve** : l'écriture du tableau entier coûtait un million de fois plus | idem |
| Un patch nomme chaque cellule une fois, quoi que le pointeur ait fait | idem |
| Ce qu'un patch laisse est un tableau ordinaire, exactement tel qu'il est sauvegardé | idem |
| Un stroke = un undo ; deux strokes = deux undo ; redo remet tout | idem |
| Le dernier projet ouvert revient ; **Nouveau projet en crée un** ; oublier rouvre le plus récent | `editor/project/library.test.js` |

---

## 9. Conséquences

### Positives

- `Ctrl Z` fonctionne, pour tout, y compris dans un projet restauré depuis IndexedDB.
- Un historique ne contient plus que des intentions : ni comptabilité, ni simulation, ni réseau.
- Un stroke sur une carte d'un million de cellules coûte deux cents valeurs.
- « Nouveau projet » crée un projet.
- Aucun raccourci, aucune fenêtre, aucun test ne détient de pile : tout le monde demande.

### Négatives

- Une origine de plus à respecter : du code qui produirait des Operations sans l'estampiller
  `EDITOR` se retrouverait non annulable, silencieusement. C'est le prix du filtre, et
  `createOperation` exige déjà une origine, donc l'oubli est impossible — seule une valeur
  *fausse* l'est.
- `SET_CELLS` est un type d'opération de plus à connaître pour qui écrit un transport.
- Rouvrir une scène fermée n'en rend pas l'historique.
