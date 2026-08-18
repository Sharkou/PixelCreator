# ADR-0029 — Play travaille sur la scène vivante, Stop restaure un instantané, et l'historique s'arrête à la porte

- **Statut :** **accepté** (2026-08-18)
- **Dépend de :** ADR-0003 (Property System), ADR-0005 (modules de runtime), ADR-0008 (Operations), ADR-0011 (autorité), ADR-0012 (isolation des erreurs), ADR-0013 (caméra), ADR-0015 (graphe et Component), ADR-0024 (Undo/Redo)
- **Amende :** rien. Il comble le manque que `editor.js` signalait en refusant de dessiner un transport décoratif.

## Contexte observé

`editor.js` portait ceci, et c'était la bonne réponse à l'époque :

> « THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE. Play needs a scene snapshot
> restored on stop, which does not exist yet. A green button that does nothing would be the
> one kind of lie this Editor has consistently refused. »

Ce qui existe aujourd'hui et rend la décision possible :

| Brique | État |
|---|---|
| `Runtime.running`, `advance(dt, input)`, `render({ view })` | en place, et le Viewport tient déjà la boucle |
| `serializeScene()` / `deserializeScene()` | en place, testés, sans dépendance DOM |
| `History` par ressource, entrées groupées par `batch` | en place (ADR-0024) |
| `Behaviors` : état d'exécution d'un graphe dans une WeakMap | en place, déjà déclaré non restauré par ADR-0024 §5 |
| `Clock` : `time`, `fixedStep`, accumulateur | en place, mais sans `reset()` |

Le Viewport construit un `Runtime` avec `running = false` : il dessine chaque frame et ne
simule jamais. Le transport n'a donc pas à créer un moteur — il a à décider qui possède
l'état de la scène pendant qu'elle tourne.

## Décision

### 1. Trois états, et un seul objet de scène

**VALIDÉ.** Le transport est une machine à trois états portée par l'Editor :

```
        Play              Pause              Play
EDITING -----> PLAYING ---------> PAUSED ---------> PLAYING
   ^              |                  |
   +--------------+------------------+
                Stop
```

| État | `Runtime.running` | La boucle avance | La scène est éditable |
|---|---|---|---|
| `EDITING` | `false` | non | oui |
| `PLAYING` | `true` | oui | oui, et c'est délibéré (§4) |
| `PAUSED` | `false` | non | oui |

**Il n'y a pas de second Runtime, et pas de copie de scène pendant l'exécution.** Le
Runtime de l'Editor est celui qui joue. C'est la raison d'être du produit : « une vue
administrateur sur un runtime vivant » (`docs/PROJECT.md` §4) — modifier un objet pendant
que le jeu tourne et voir l'effet immédiatement. Faire tourner Play sur une copie
détruirait précisément cela.

### 2. Play prend un instantané avant de démarrer

**VALIDÉ.** `Play` depuis `EDITING` :

1. `serializeScene(scene)` produit un instantané JSON, gardé par l'Editor ;
2. `runtime.running = true`.

L'instantané est une valeur, pas un objet vivant : il ne peut pas dériver, et il coûte une
sérialisation déjà écrite et déjà testée. `Play` depuis `PAUSED` ne reprend pas
d'instantané — la reprise n'est pas un départ.

### 3. Stop restaure exactement l'instantané, et rien d'autre

**VALIDÉ.** `Stop` :

1. `runtime.running = false` ;
2. la scène est ramenée à l'instantané pris au dernier `Play` ;
3. l'horloge de simulation repart de zéro ;
4. l'état d'exécution des graphes est abandonné ;
5. l'état d'entrée est vidé ;
6. l'état passe à `EDITING`.

**Ce que Stop ne restaure pas, et qui doit être dit :** la caméra de l'Editor (c'est un
point de vue, pas un contenu — ADR-0013), la sélection, le pli des sections, la fenêtre
ouverte, la position du Graph. Rien de tout cela n'est dans la scène, donc rien de tout
cela ne bouge.

### 4. Ce qui arrive aux modifications faites pendant Play : elles sont perdues, et l'Editor le dit

**VALIDÉ.** C'est la conséquence directe de §2 et §3, et le seul point qui doit être
visible plutôt que découvert : tout ce qu'un créateur change pendant `PLAYING` ou `PAUSED`
disparaît au `Stop`.

C'est le comportement d'Unity et de Godot, et il est correct : jouer sert à observer, et
une session de jeu ne doit pas modifier le projet par accident. Ce qui manquerait serait
l'avertissement, donc l'Editor marque l'état — le transport est visiblement actif, et la
scène est visiblement en cours d'exécution.

> **Non décidé ici :** proposer de garder les changements au Stop (le « apply play mode
> changes » que réclament les utilisateurs d'Unity depuis quinze ans). Cela demande de
> diffuser l'instantané et l'état courant, donc un modèle de diff de scène qui n'existe pas.

### 5. L'historique s'arrête à la porte

**VALIDÉ. Quitter `EDITING` vide les piles d'undo, et rien n'est enregistré pendant Play.**

Le raisonnement est celui d'ADR-0024 §5, poussé d'un cran : annuler ne remonte pas le temps
de la simulation. Une pile qui traverserait un `Play` proposerait d'inverser une opération
dont la cible a été détruite par un graphe, ou de rendre une valeur qu'un `update()` a déjà
réécrite trois cents fois. `invert()` produirait une opération valide vers un état qui n'a
jamais existé.

Vider est brutal et honnête ; mélanger serait souple et faux.

### 6. Modifier pendant PAUSED est autorisé

**VALIDÉ.** `PAUSED` n'est pas un état protégé : c'est `PLAYING` sans le temps qui passe.
Les écritures suivent le chemin normal (`setProperty` puis Operation), les vues se mettent
à jour, et le rendu continue — c'est exactement ce que `Runtime` documente déjà : « Whether
the simulation advances. Rendering continues while paused. »

Ces modifications tombent sous §4 comme les autres : le `Stop` les emporte.

### 7. Ce que le Runtime doit gagner, et c'est tout

**VALIDÉ.** Une seule addition, dans `runtime/clock/clock.js` :

```js
/** Put the simulation clock back to zero. */
reset()
```

`Clock` accumule `#time` et un reliquat de pas ; sans `reset()`, un second `Play`
repartirait avec le temps du premier, et un graphe qui lit `time` observerait un saut. Ce
n'est pas une fonctionnalité, c'est le pendant de `Stop`.

**Rien d'autre ne change dans `runtime/`.** Pas d'état de transport dans le Runtime : il ne
sait pas ce qu'est un bouton Play, et il ne doit pas l'apprendre (ADR-0005). La machine à
trois états vit dans l'Editor, qui possède déjà la boucle.

### 8. Multijoueur et headless : ce qui est prévu, ce qui attend

**VALIDÉ pour maintenant : le transport est local.**

Ce que la décision préserve pour la suite :

- le serveur exécute `advance()` sur la même `Scene` et le même Core (`PROJECT.md` §3.2) ;
  rien ici n'ajoute de chemin d'exécution parallèle ;
- l'instantané est du JSON produit par `serializeScene()` — le format qu'un serveur
  enverrait déjà pour amorcer un client ;
- `Play` n'émet aucune Operation : il ne se réplique pas, et ne peut donc pas démarrer la
  partie de quelqu'un d'autre par accident.

Ce qui attend explicitement le runtime multijoueur :

| Question | Pourquoi elle ne peut pas être tranchée ici |
|---|---|
| Qui a le droit d'appuyer sur Play dans une session partagée | Demande le modèle d'autorité en session (ADR-0011 couvre les mutations, pas le cycle de vie) |
| Ce que Stop signifie pour les autres joueurs | Demande de savoir si une session est un objet du modèle |
| Si l'instantané vient du client ou du serveur | Demande le chargement de projet côté serveur |

## Ce que cet ADR ne décide pas

- **Le pas à pas** (avancer d'une frame) : trivial une fois `PAUSED` en place, mais aucun
  contrôle ne le demande encore.
- **La vitesse de lecture.**
- **Un mode « jouer depuis ici »** (caméra de jeu contre caméra d'éditeur) : demande de
  décider quelle `Camera` de la scène est active, ce qu'ADR-0013 laisse ouvert.
- **Conserver les changements au Stop** (§4).

## Conséquences

### Positives

- Trois boutons dont chacun a une définition écrite, et un `Stop` qui restaure vraiment.
- Aucun second runtime, aucune copie de scène : la promesse « éditer pendant que ça tourne »
  est tenue au lieu d'être contournée.
- Le coût pour `runtime/` est d'une méthode, et elle a un sens hors du transport.

### Négatives

- Les modifications faites pendant Play sont perdues (§4) — comportement standard, mais il
  faut le rendre visible plutôt que de le documenter seulement ici.
- L'historique est vidé au démarrage (§5) : un créateur perd son undo en jouant. Le choix
  inverse serait un undo qui ment.
