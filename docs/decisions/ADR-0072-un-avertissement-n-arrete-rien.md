# ADR-0072 — Un avertissement n'arrête rien, et une attente a un plafond

- **Statut :** **accepté** (2026-09-12)
- **Décide :** ce qu'un nœud fait quand rien n'a encore été choisi dedans ; ce qui distingue un
  avertissement d'une erreur à l'exécution ; combien d'exécutions suspendues une instance peut
  tenir ; ce qui arrive aux autres quand l'une d'elles échoue ; d'où vient `io.resumed`
- **Dépend de :** ADR-0012 (le Runtime isole et rapporte), ADR-0027 (le modèle de graphe et
  son interprète), ADR-0031 (une valeur portée par l'instance), ADR-0058 (une exécution peut
  survivre à un pas), ADR-0064 (refuser avant d'exécuter)
- **Ne décide pas :** une console d'erreurs dans l'Editor, la reprise d'une attente en cours de
  partie, l'annulation d'une attente depuis le graphe — voir §5

---

## 1. Le défaut : deux couches, une trouvaille, deux verdicts

Un créateur dépose un `Set Property` et n'a pas encore choisi la propriété. C'est l'état de
tout graphe en cours d'écriture, et les deux couches qui le regardent n'en disaient pas la
même chose :

| Couche | Verdict | Conséquence |
|---|---|---|
| `validate.js` | **avertissement** | `runnable()` est vrai, `project/graphs.js` lie le graphe |
| `standard.js` | **`GraphError` jetée** | à chaque instance, à chaque pas |

Et une exception déroule tout le `walk` : **tout ce qui était câblé APRÈS le nœud non visé ne
tournait plus**. Le commentaire de `graphs.js` nomme pourtant le cas mot pour mot — « refuser
d'exécuter un graphe en construction rendrait l'Editor inutilisable ».

> **La règle : la sévérité décide si un graphe tourne, donc elle décide aussi ce qui peut
> l'arrêter en cours de route. Ce qu'un avertissement laisse passer, l'exécution ne doit pas
> le tuer.**

Concrètement, deux phrases différentes là où il n'y en avait qu'une :

- **rien n'a encore été choisi** — le nœud ne fait rien, le flux continue, un `Get` répond
  `null`. Le validateur continue de dire qu'il manque quelque chose ;
- **ce qui avait été choisi a disparu** — `MISSING_PROPERTY`, erreur, et le graphe ne tourne
  pas du tout (ADR-0064 §6, inchangé).

---

## 2. Une attente a un plafond

`On Update ▸ Every` est le câblage qu'un débutant écrit en premier. Chaque pas y suspendait
une exécution de plus, et rien ne les bornait : dix secondes à soixante pas donnent **six
cents** attentes vivantes, décomptées et reprises à chaque pas, chacune avec son budget
complet. La cadence des impulsions montait de 0,2/s à 120/s et continuait.

L'en-tête de `interpreter.js` promet « un budget, et une garde de cycle, pour qu'un mauvais
graphe ne puisse pas figer une frame ». Le budget borne **un** `walk` ; rien ne bornait
**combien** de `walk` un pas effectuait — donc un mauvais graphe figeait la frame par une route
que le budget ne voyait pas, et le faisait progressivement, ce qui est la pire sorte.

**`MAX_PENDING = 256` par instance.** Ce n'est pas un repli sur une table indexée par nœud :
ADR-0058 §3 est explicite, deux passages dans un même `Delay` attendent indépendamment, et la
liste reste une liste. Ce qui est ajouté est un plafond, et l'atteindre est un **refus
énoncé** — la `GraphError` que le Runtime isole et rapporte, comme pour le budget.

---

## 3. Une exécution qui échoue n'emporte pas les autres

Les exécutions dues sont retirées de `pending` **avant** qu'aucune ne tourne — il le faut, ou
une re-suspension serait décomptée deux fois dans le même pas. Une exception au milieu de la
boucle supprimait donc définitivement toutes celles qui suivaient : deux branches d'un
`Sequence` derrière un `Delay`, un nœud qui échoue, et l'autre branche ne reprenait plus
jamais.

Chacune est désormais isolée ; la première défaillance est relancée une fois la boucle
terminée, donc le Runtime la reçoit et la rapporte comme avant (ADR-0012). Ce qu'elle
n'annule plus, c'est du travail qui n'avait rien à voir avec elle.

**Et le pas lui-même en fait partie.** `resumeDue()` est appelée avant `start` et `update` ;
une défaillance qui remontait de là emportait l'`On Update` du composant pour ce pas, ce qui
est exactement la même phrase un étage au-dessus. Elle est retenue et relancée après les deux
événements : le Runtime la reçoit toujours, une fois que le pas a fait ce qu'il pouvait.

---

## 4. `resumed` ne vaut que pour le nœud qui s'est garé sur lui-même

`io.resumed` dit à un nœud « tu reviens » plutôt que « tu arrives par un fil » — c'est ainsi
qu'`Every` démarre son horloge à l'aller et tire son impulsion au retour.

Une **attente** (`wait`) gare la continuation sur le nœud **suivant** ; un **retour**
(`again`) la gare sur le nœud lui-même. Marquer les deux comme repris disait au premier une
chose fausse : un `Every` placé derrière un `Delay` se croyait de retour de son propre
intervalle et tirait dès l'arrivée. Seule la seconde forme porte la marque.

---

## 5. Ce que cet ADR ne décide pas

- **Une console d'erreurs dans l'Editor.** Une `GraphError` va toujours où `onError`
  l'envoie ; lui donner une fenêtre est un travail à part.
- **Reprendre une attente après un rechargement.** ADR-0058 le refuse encore : rien de
  suspendu n'est sérialisé.
- **Annuler une attente depuis le graphe.** Aucun nœud ne l'exprime, et en inventer un
  demanderait de décider ce qu'« annuler » veut dire pour un `Tween` déjà à mi-course.
