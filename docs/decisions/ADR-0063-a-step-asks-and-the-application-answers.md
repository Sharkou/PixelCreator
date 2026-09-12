# ADR-0063 — Un pas demande, l'application répond

- **Statut :** **accepté** (2026-09-12)
- **Décide :** ce que fait `Load Scene` ; qui lit la Scene et quand ; ce que devient l'ancien monde ; ce qui traverse une transition ; ce qui survit à une transition et sous quelle forme
- **Dépend de :** ADR-0011 (le serveur fait autorité), ADR-0014 (l'entrée est passée), ADR-0020 §4 (le store est asynchrone), ADR-0029 (Play/Pause/Stop), ADR-0042 (Preview est un client de runtime), ADR-0057 §3 (les identités viennent de la simulation), ADR-0058 (une exécution peut survivre à un pas), ADR-0060 §6 (`AudioSource` est un réconciliateur), ADR-0061 §4 (résoudre avant la simulation)
- **Ne décide pas :** une transition animée ; charger une scène **à côté** d'une autre (additive) ; une sauvegarde de partie ; le changement de scène dans le mode Play de l'Editor — voir §6

---

## 1. Problème

Un jeu Pixel Creator était structurellement **mono-écran**. Pas de menu, pas de niveau 2, pas
d'écran de fin : une seule Scene était jouée, et rien dans le catalogue ne pouvait en demander
une autre.

Et la raison était la même que pour les prefabs : **une Scene est une Resource**, une Resource
se lit à travers un store **asynchrone**, et `Runtime.step()` ne peut pas attendre. Le prefab a
répondu en résolvant **tout avant** la simulation (ADR-0061 §4). Une scène ne peut pas : la
charger **jette la simulation**.

---

## 2. Le nœud demande, il ne charge pas

> **`Load Scene` enregistre une demande. Le pas se termine là où il était.**

```
step()                    le nœud appelle ctx.requestScene(id) et rend la main
   …                      les nœuds suivants tournent sur la scène encore là
advance() finit           ← ici, et seulement ici, l'application est prévenue
   ↓  asynchrone, entre deux frames
read → deserialize → dispose → new Runtime
```

**Trois propriétés en découlent, et ce sont exactement celles qui étaient exigées :**

- l'interprète reste **synchrone** — rien n'a été rendu `async`, pas un nœud, pas un pas ;
- aucun stockage n'est touché **pendant** un pas ;
- il n'existe jamais de Runtime à moitié remplacé : l'ancien est disposé, puis le nouveau est
  construit sur un monde complet.

**La dernière demande d'un pas gagne.** Deux `Load Scene` atteints dans un pas, c'est un graphe
qui dit deux choses ; charger les deux jouerait une scène zéro frame, et refuser ferait de
l'ordre de deux flux une erreur qu'un créateur ne peut pas voir.

**Il n'y a ni port `Then` ni sortie `Scene Loaded`.** Il n'existe pas d'« après » où ce flux
pourrait continuer : quand la scène est lue, le graphe qui a demandé, le Component qui le
portait et l'Object qui le portait ont disparu.

**Un Runtime que personne n'écoute enregistre la demande et continue.** C'est ce que fait un
appel headless, et c'est ce que fait aujourd'hui le mode Play de l'Editor (§6).

---

## 3. Le cycle de vie : un nouveau Runtime, et ce qui traverse

> **Changer de scène, c'est jeter un Runtime et en construire un autre.**

C'est plus simple que de vider un Runtime en place *et* plus sûr : il n'existe aucun état
résiduel à oublier, parce qu'il n'existe aucun objet survivant à nettoyer.

| | Ce qui se passe | Pourquoi |
|---|---|---|
| l'ancienne Scene | **vidée**, racine par racine | chaque départ est annoncé, donc chaque `onRemoved` tourne |
| les musiques | **arrêtées** | un niveau ne doit pas garder la musique du menu (ADR-0060 §6) |
| `Delay` / `Tween` / `Every` suspendus | **injoignables** | ils vivent dans des closures que seule la WeakMap de `Behaviors` atteint, indexée par Component ; le Component part, elles partent. Il n'y a rien à annuler (ADR-0058) |
| collisions | neuves | un instantané de paires est un fait sur un monde |
| horloge | neuve | le temps d'un niveau commence au niveau |
| **Input** | **le même** | un joueur qui tient une touche la tient encore ; un `Input` neuf perdrait un `keyup` — une touche coincée, et le dernier bug que quiconque relierait à un changement de scène |
| **sortie audio** | **la même** | déjà déverrouillée ; en reconstruire une couperait le son et redemanderait un geste |
| **images décodées** | **les mêmes** | elles appartiennent au PROJET ; les redécoder serait un écran noir à chaque porte |
| **définitions résolues** | **les mêmes** | idem |
| **Behaviors** | **les mêmes** | un `.px` est de portée projet |
| **session** | **la même** | §5 |
| seed | **dérivée** : `session:scène` | une partie reste reproductible d'un bout à l'autre (ADR-0057) |
| caméra, `ScreenSpace` | ceux de la nouvelle scène | ce sont des Objects |

`Runtime.dispose()` **n'est pas un `stop()`** : il ne touche ni la boucle, ni le renderer, ni la
sortie audio. Ceux-là appartiennent à l'application, et le Runtime suivant reçoit les mêmes.

---

## 4. La forme : un rappel, pas un sondage

Le Runtime reçoit `onSceneRequest`. `advance()` l'appelle **après** la dernière étape de la
frame, une fois, avec l'identifiant — puis oublie la demande.

**Un rappel plutôt qu'un drapeau lu en boucle** : une application qui interroge
`runtime.requestedScene` à chaque frame doit se souvenir de le faire et de l'effacer, et celle
qui oublie accumule une demande jamais honorée. Le rappel est délivré exactement une fois, au
seul endroit où attendre est permis.

`requestedScene` existe quand même, en lecture, parce qu'un test doit pouvoir constater qu'un
pas a **enregistré** sans que rien n'ait été chargé.

---

## 5. Ce qui traverse : `SessionState`, et pas un second Property System

Une transition jette le monde. Un score porté de `Level` à `GameOver` n'a donc **nulle part où
vivre** : tout ce qui pourrait le tenir meurt en route.

```
Get Session Value   Key = score   → Value
Set Session Value   Key = score   ← Value
```

Ce n'est **pas** un second Property System, et les différences sont le sujet :

| Ce que le Property System a | `SessionState` |
|---|---|
| réactivité, `Change`, observateurs | rien |
| Operations : répliqué, arbitré, annulable | rien |
| schéma, types déclarés, valeurs par défaut | trois types primitifs, déclarés nulle part |
| sérialisation dans une scène / un projet | **jamais** |
| identité opaque (`ResourceId`, `ObjectId`) | un nom qu'un créateur tape |

Une propriété de Component **décrit un Object** ; ceci est une poignée de nombres qu'une partie
transporte. Faire le premier avec le second, ce serait une sauvegarde faite d'un brouillon ;
faire le second avec le premier demanderait un Object qui survive à la scène — la chose même
qu'une transition existe pour détruire.

**Trois types : nombre, booléen, texte.** Une poignée d'Object nommerait une scène qu'on vient
de jeter ; un tableau ou un enregistrement serait un format que personne n'a décidé, et le jour
où il l'est, c'est une **sauvegarde de partie**, pas ceci. Ce qui n'est pas l'un des trois
**efface la clé** au lieu d'être stocké : relire une valeur transformée après une transition
serait pire qu'une clé vide (ADR-0054).

**Elle appartient à l'application.** Un Runtime est construit par scène et ceci survit à
plusieurs : c'est donc l'application qui la crée et la passe à chaque Runtime — la forme que la
sortie audio et le registre de ressources ont déjà. « Nouvelle partie » est `clear()`, et c'est
l'application qui décide quand.

---

## 6. Ce que cet ADR ne décide pas

| Point ouvert | Pourquoi |
|---|---|
| **Une transition animée** (fondu, volet) | Demande de dessiner pendant qu'aucune scène n'est vivante, donc une couche de présentation au-dessus des deux ; c'est un produit |
| **Le chargement additif** | « Deux scènes à la fois » demande de décider ce qu'est une caméra active, un ordre de dessin et un espace de noms entre elles |
| **Une sauvegarde de partie** | §5. Un instantané de brouillon reste un brouillon ; ce qu'est une partie sauvegardée n'est pas décidé |
| **Le changement de scène dans le mode Play de l'Editor** | Le Runtime de l'Editor est lié à la Hierarchy, à l'Inspector et à l'historique d'une Scene ouverte ; le remplacer, c'est réouvrir un document. La demande est enregistrée et n'est pas honorée. **BLOCKED: Load Scene en mode Play de l'Editor — Reason: remplacer la Scene ouverte est un `Workspace.open()`, qui referme la première et rebind toutes les fenêtres ; ce n'est pas un changement de Runtime mais un changement de document, et l'échange de documents est la fenêtre qu'ADR-0020 §3 laisse ouverte.** Le Preview le fait, et c'est là qu'un jeu se joue |

---

## 7. Contre-épreuves

| Vérifié | Où |
|---|---|
| `Load Scene` enregistre, et le pas finit sur la scène de départ | `preview/scene-transition.test.js` |
| L'application est prévenue **entre** deux frames | idem |
| La dernière demande d'un pas gagne ; une demande est remise une fois | idem |
| Un Runtime sans écouteur enregistre et continue | idem |
| Un sélecteur vide ne demande rien | idem |
| La scène quittée est vidée, donc sa musique s'arrête | idem |
| Un `Delay` suspendu dans l'ancienne scène ne revient jamais | idem |
| La nouvelle scène est ce qui est simulé, avec ses Objects | idem |
| Audio, Input et définitions sont **les mêmes objets** après la transition | idem |
| Deux parties d'une même seed atteignent les mêmes identités | idem |
| Une valeur de session écrite avant est lisible après | idem |
| Les trois types passent ; une poignée d'Object et un `NaN` effacent la clé | idem |
| « Nouvelle partie » est un `clear()` | idem |
| Un Runtime sans session ne lit rien et n'écrit nulle part | idem |
| **Contre-épreuve** : une transition sans `dispose()` laisse la musique du menu jouer | idem |

---

## 8. Conséquences

### Positives

- Un jeu a un menu, des niveaux et un écran de fin.
- La contrainte asynchrone est respectée sans être contournée : l'interprète est inchangé.
- Le cycle de vie est dit, testé, et sans état résiduel à oublier.
- Rien de coûteux n'est refait à une porte : images, sons et définitions traversent.
- Une partie reste reproductible d'une scène à l'autre.

### Négatives

- `Runtime` gagne trois membres (`requestScene`, `requestedScene`, `dispose`) et une option.
- Le mode Play de l'Editor ne change pas de scène (§6), et un créateur qui essaie là plutôt que
  dans le Preview ne voit rien se passer.
- `SessionState` est un endroit de plus où une valeur peut vivre ; c'est le prix d'un monde qui
  est jeté, et ses limites (trois types, pas de sérialisation) sont faites pour qu'il ne
  devienne pas un second modèle.
