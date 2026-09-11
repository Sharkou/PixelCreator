# ADR-0058 — Une exécution peut survivre au pas qui l'a commencée

- **Statut :** **accepté** (2026-09-11)
- **Décide :** où vit l'état temporaire d'une exécution de graphe entre deux `Runtime.step()` ;
  ce qu'est une continuation et ce qu'elle retient ; si un même nœud peut attendre deux fois à
  la fois ; d'où vient le temps ; ce qu'il advient d'une attente quand ce à quoi elle
  appartient disparaît
- **Dépend de :** ADR-0004 (cycle de vie d'un Component), ADR-0011 (le serveur est
  l'autorité), ADR-0012 (isolation des erreurs), ADR-0015 §3 (un graphe est lu une fois,
  exécuté par instance), ADR-0027 (modèle de graphe et budget), ADR-0034 invariant 3 (un
  handle n'est pas mémoïsé), ADR-0035 (ordre de `Runtime.step()`), ADR-0056 §4 (un nœud de
  flux peut rendre une valeur), ADR-0057 (une graine, deux flux)
- **Ferme :** le dernier point ouvert d'ADR-0045 §11.5 — `Delay`
- **Ne décide pas :** la reprise d'une simulation à mi-partie ; les nœuds temporels qui
  viendront après — voir §9

---

## 1. Problème

`Delay` était le dernier nœud qu'ADR-0045 §11.5 refusait de coder, et sa difficulté n'a jamais
été le temps :

> « **une décision.** Où vit le minuteur en attente, survit-il à un `bind`, est-il sérialisé,
> que fait un `undo` ? »

Le vrai sujet est plus large que ce nœud : **où vit l'état temporaire d'une exécution de
graphe entre deux pas ?** Tant qu'aucun nœud ne s'arrêtait au milieu d'un flux, la question
n'avait pas à être posée — une exécution naissait et mourait dans un `step()`, entièrement sur
la pile JavaScript. Le premier nœud qui dit « pas encore » la pose entièrement, et la réponse
décide du comportement de tous les nœuds temporels à venir.

---

## 2. Trois choses, et le dépôt les distinguait déjà

Le vocabulaire manquait, le code ne manquait pas :

| Niveau | Ce que c'est | Où il vit aujourd'hui | Partagé par |
|---|---|---|---|
| **définition** | le graphe lu une fois, immuable | `compiled`, mémoïsé par `Behaviors.#factories` (WeakMap clé = graphe) | tous les Components du type |
| **instance** | ce `.px` sur cet Object | la fermeture de `create(component)`, tenue par `Behaviors.#running` (WeakMap clé = component) | rien |
| **exécution** | un déclenchement particulier d'un événement | `runFlow()` : une pile, un budget, une table `produced` — **sur la pile JS** | rien |

`started` vivait déjà au niveau 2, avec le commentaire qui dit pourquoi : « ONE EXECUTION
STATE PER COMPONENT […] two Controllers must each get their own first step ».

> **Une exécution suspendue est de l'état d'exécution, et l'état d'exécution appartient à
> l'instance.** Elle se range à côté de `started`, dans la fermeture que `Behaviors` tient par
> WeakMap.

### 2.1 Pourquoi pas ailleurs

| Modèle | Rejet |
|---|---|
| **B — l'interprète** | L'interprète est une lecture partagée par toutes les instances du type. Y mettre l'état d'attente ferait qu'un `Delay` sur un ennemi retiendrait le tir d'un autre. |
| **C — le Runtime, comme file d'exécutions suspendues** | Le Runtime ne connaît ni nœud, ni port, ni table de valeurs produites : il connaît des Components. Lui apprendre tout cela pour porter une liste serait un scheduler générique — et il faudrait alors écrire une passe d'annulation pour chaque façon dont un Object peut disparaître. |
| **Sur le Component, en propriété** | Ce serait de l'état de scène : sérialisé, répliqué, montré dans l'Inspector. Une attente n'est rien de tout cela (§7). |
| **Sur le nœud** | Le graphe est immuable pour le Runtime (ADR-0016 §7) et partagé par toutes les instances. C'est le bug que §2.1 « B » décrit, une couche plus bas. |

### 2.2 Ce que le choix donne gratuitement

**Tout le cycle de vie, sans une ligne d'annulation.** La fermeture n'est atteignable que
depuis la WeakMap clé-component de `Behaviors`. Object détruit, Component retiré, Scene
remplacée, Runtime abandonné : le component s'en va, la fermeture s'en va, et les exécutions
suspendues s'en vont avec lui. Il n'y a pas de passe d'annulation **parce qu'il n'y a rien à
annuler**.

Et le Runtime pilote déjà la reprise sans le savoir : il appelle
`behaviorFor(component).update(self, ctx)` à chaque pas, dans l'ordre canonique, pour les seuls
Objects et Components actifs. Aucun nouveau point d'appel, aucun ordonnanceur.

---

## 3. Ce qu'est une continuation

Un nœud dit **quand**, jamais **s'il faut attendre** :

```text
execute(io) -> { next, wait }
```

`next` est lu par `continuationsOf()` comme dans les quatre autres formes ; `wait` est la
cinquième et la seule qui ne continue pas tout de suite. L'interprète gare alors ce qu'il
aurait empilé :

```text
{ remaining, to, produced }
```

| Champ | Pourquoi il est là, et pas plus |
|---|---|
| `remaining` | le temps qui reste, décompté par `deltaTime` |
| `to` | `{ node, port }` — où reprendre. Le graphe tient tout le reste |
| `produced` | ce que cette exécution avait poussé hors de ses nœuds de flux |

**Aucune identité n'est frappée.** Une continuation est de l'état runtime éphémère : elle n'est
ni adressée, ni référencée, ni persistée, donc elle n'a besoin d'aucun `ObjectId` ni
`ResourceId` (ADR-0010 parle d'identités de contenu, et ce n'en est pas).

**`produced` traverse l'attente, et c'est sûr.** ADR-0056 §4.1 avait déjà étendu l'invariant 3
d'ADR-0034 de « un pas de flux » à « une exécution », **à la condition que toute lecture d'un
port `object` soit redemandée à la Scene**. Cette condition est tenue par `producedFrom()` et
ne dépend pas de la durée : un `Spawn` avant un `Delay` et un `Set Position` après fonctionnent,
et si la copie a été détruite entre-temps le port se lit `null` plutôt que de rendre un handle
mort. Sans cela, un spawn suivi d'une attente serait inutilisable.

---

## 4. Deux passages dans un même `Delay` attendent séparément

```text
On Update → Delay(1) → Action
```

démarre une exécution **à chaque pas**. La réponse est explicite :

> **Oui. Deux exécutions du même nœud attendent indépendamment.** Ce qui attend est une
> exécution, pas un nœud.

Techniquement c'est une **liste**, pas une table clé-nœud. Une table ferait que la seconde
écrase la première : le graphe cesserait silencieusement d'être réentrant, et tous les nœuds
temporels ultérieurs hériteraient du défaut sans qu'un ADR ne l'ait jamais décidé. C'est un
test, pas une intention.

### 4.1 L'ordre de reprise

**L'ordre dans lequel elles ont été suspendues**, et il est déjà canonique : il découle de
l'ordre canonique de la Scene (ADR-0034 §3.1), puis de l'ordre des Components (ADR-0018), puis
de l'ordre du payload, puis du parcours en profondeur d'un flux. Rien n'est trié ; l'ordre est
lu là où il existe déjà.

### 4.2 L'ordre dans un pas

```text
reprendre les attentes dues  →  On Start (au premier pas)  →  On Update
```

Deux raisons, et la seconde est décisive :

1. ce qui a été suspendu appartient à un moment **antérieur** à ce que ce pas soulève ;
2. **le pas qui ATTEINT un `Delay` ne doit pas décompter son propre `deltaTime`.** Une attente
   d'une seconde commencée à `t = 0` finit à `t = 1`, pas à `t = 1 − dt`. Reprendre en premier
   garantit qu'une continuation garée par le `start` ou l'`update` de ce pas reste intacte
   jusqu'au suivant — par construction, sans drapeau disant de quel pas elle date.

Les attentes dues sont par ailleurs **prélevées avant que l'une d'elles ne tourne** : une
exécution reprise peut se suspendre à nouveau, et une entrée ajoutée pendant la boucle serait
sinon décomptée deux fois dans un même pas.

---

## 5. Ce qu'une durée qui n'en est pas une veut dire

> **Une attente est un nombre fini strictement positif. Tout le reste n'est pas une autre
> sorte d'attente : c'est aucune attente.**

`0`, un négatif, `NaN`, `Infinity`, une chaîne : le flux continue **dans ce pas même**. Ce
n'est pas une règle inventée ici — c'est la convention numérique que `number()` applique déjà
dans `Clamp`, `Lerp`, `Translate` et partout ailleurs dans le catalogue.

Et elle a une conséquence que le choix inverse n'aurait pas : **un `Delay(0)` dans une boucle
est une boucle ordinaire**, bornée par le budget d'ADR-0027 et rapportée comme telle. Si
`Delay(0)` se suspendait pour un pas, une boucle en tournerait indéfiniment, un tour par image,
sans jamais rien déclencher — un graphe qui ne finit pas et que rien ne signale.

La durée est **lue quand le `Delay` est atteint, puis capturée**. La relire pendant l'attente
ferait qu'une attente alimentée par une propriété change de longueur en cours de route : une
attente dont la fin bouge n'est pas une attente, et rien sur la toile ne le dirait.

---

## 6. Déterminisme et budget

Le temps vient de `ctx.deltaTime` et de rien d'autre : pas d'horloge murale, pas de `Promise`,
pas de `setTimeout`, pas d'ordonnanceur du navigateur. Le pas est fixe et identique sur un
serveur et sur chaque client (`Clock`), donc **deux Runtime nourris des mêmes pas reprennent
les mêmes exécutions aux mêmes pas** — le contrat d'ADR-0057 étendu à ce qui attend.

Le décompte emploie **la tolérance relative de `Clock.advance()`** : soustraire 1/60 soixante
fois ne laisse pas exactement zéro, et un `<= 0` nu ferait finir une seconde d'attente un pas
trop tard. Le défaut est celui que `Clock` documente déjà pour son accumulateur, rencontré une
couche plus haut et réglé pareil.

**Une exécution reprise est une exécution ordinaire** : même pile, mêmes nœuds, même budget.
Ce qu'elle n'obtient pas, c'est le droit d'aller plus loin qu'un événement.

---

## 7. Ce n'est pas de l'état de Scene

Une continuation vit dans une fermeture, tenue par une WeakMap. Rien n'en atteint le Component,
donc `serializeScene()` n'en écrit rien et il n'y a pas de champ à ignorer.

Un rechargement **repart de l'état initial** : les attentes en cours ne reprennent pas. C'est
exactement la position qu'ADR-0057 §8 a prise pour la position des flux aléatoires, et pour la
même raison — reprendre une simulation à mi-course demanderait de sérialiser l'état
d'exécution, donc d'en faire de l'état de scène, et personne n'en a besoin tant qu'un client
qui rejoint reçoit un instantané.

---

## 8. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Rien avant l'échéance, une fois à l'échéance, jamais deux | `runtime/delay.test.js` |
| Une attente est une durée, pas un nombre d'images | idem |
| Le même temps écoulé donne le même résultat quel qu'en soit le découpage | idem |
| La durée est capturée à l'entrée du nœud | idem |
| `0`, négatif, `NaN`, `Infinity`, non-numérique : aucune attente | idem |
| Un `Delay(0)` bouclé est borné par le budget et rapporté | idem |
| Deux exécutions d'un même nœud attendent séparément | idem |
| Deux instances d'un même `.px` ont leurs propres attentes | idem |
| Deux échéances dans un pas reprennent dans l'ordre de suspension | idem |
| Object détruit, Component retiré : rien ne reprend, rien n'est rapporté | idem |
| Component éteint : l'attente tient, elle ne s'écoule pas | idem |
| Rien d'une attente n'apparaît dans un payload de scène | idem |
| Deux Runtime, mêmes pas : mêmes reprises, payload identique | idem |
| Un handle produit avant l'attente est encore utilisable après | idem |

---

## 9. Ce que cet ADR ne décide pas, et ce qu'il rend possible

| Point ouvert | Pourquoi |
|---|---|
| **Reprendre une simulation à mi-partie** | §7. Même position qu'ADR-0057 §8 |
| **Annuler une attente depuis le graphe** | « arrêter ce qui attend » est un geste produit que personne n'a conçu ; rien ici ne l'empêche, et une continuation est déjà adressable par l'instance qui la tient |
| **Un `undo` pendant une partie** | Sans objet : l'historique s'arrête à la porte du mode Play (ADR-0029 §5) |

Ce que le mécanisme rend naturel, sans rien décider de plus : **`Wait Until`** (une condition
relue à chaque reprise plutôt qu'un temps décompté), **`Every N seconds`** (une continuation qui
se re-gare elle-même), **`Tween`** (une continuation reprise à chaque pas jusqu'à son terme, qui
écrit une valeur interpolée au passage), et **`On Timer`**. Tous sont la même structure avec une
condition de reprise différente — ce qui est précisément la raison de ne pas avoir nommé cet
ADR d'après `Delay`.
