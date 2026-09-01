# ADR-0054 — Dire ce qui est vrai

- **Statut :** **accepté** (2026-09-01)
- **Décide :** le nom de la catégorie `Object` ; ce qu'affiche un picker jamais touché ; ce que le seam d'ouverture du Preview a le droit d'affirmer
- **Dépend de :** ADR-0042 §5 (l'opener est délibérément inatteignable), ADR-0043 (le namespace Object), ADR-0047 §1 (une seule question par picker), ADR-0053 (un chemin, un décodeur)
- **Ne décide pas :** `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`, `On Collision` ; la largeur des nœuds ; le transport du canal live

---

Trois défauts sans rapport apparent, un seul énoncé : **une interface n'a pas le droit
d'affirmer ce qu'elle n'observe pas.** Un nom qui décrit l'implémentation plutôt que la
question posée, une boîte vide au-dessus d'une simulation qui tourne déjà, un message
d'échec émis sur le chemin du succès — dans les trois cas ce qui est montré et ce qui est
vrai avaient divergé.

## 1. La catégorie s'appelle `Object`, pas `References`

Le catalogue rangeait `Self`, `Parent`, `Find By Tag`, `Get Object` et `Is Valid` sous
**`References`** — le nom du mécanisme. Or chacun de ces nœuds répond à une seule question,
et ce n'est pas « quelle référence » :

> **Quel Object ?**

Un débutant qui cherche « l'objet que j'ai touché » ne pense pas en références ; il pense en
objets. Le nom de la catégorie est donc celui de la **question à laquelle tous ses nœuds
répondent**, jamais celui de la structure qui l'implémente.

Le catalogue se lit maintenant :

```
Events · Input · Flow · Object · Properties · Transform · Values · Math · Compare · Logic · Debug
```

`Object` reprend par ailleurs le mot que le namespace de propriétés emploie déjà (ADR-0043) :
un seul mot pour une seule notion, dans les deux endroits où l'utilisateur la rencontre.

## 2. Un picker intouché montre ce que le runtime lira

Un `On Key` neuf affichait **`None`** dans son champ `Key`. Son interprète, lui, lisait déjà
`params.key ?? 'Space'`. La carte et la simulation ne parlaient donc pas de la même touche :
appuyer sur Espace déclenchait un nœud qui prétendait n'écouter rien.

La cause est une seule expression, dans `referenceChoice()` :

```
  chosen = node?.params?.[name] ?? ''        → le défaut déclaré est ignoré
```

> **Un param jamais touché affiche la valeur déclarée par défaut, pas une boîte vide.**

**Seulement là où un défaut est déclaré.** Un picker dont le défaut est `null` — toute
propriété, tout Component, toute référence de socket — continue d'afficher son placeholder,
parce que là *rien* EST la réponse et que le dire est précisément l'intérêt du champ.

C'est le même défaut que `value.number` avait déjà connu et qui a déjà été corrigé une fois :
la boîte et la simulation en désaccord sur la même valeur.

## 3. `noopener` rend le blocage indétectable, donc on ne l'affirme pas

`defaultOpen()` lisait la valeur de retour de `window.open(url, '_blank', 'noopener')` comme
une preuve d'ouverture :

```
  return globalThis.open?.(url, '_blank', 'noopener') ?? null;   → null = « bloqué »
```

Mais `noopener` **spécifie** que rien n'est rendu : une fenêtre ouverte avec cette option ne
donne aucun handle à son ouvreur. `null` est donc ce à quoi ressemble le **succès**. Le
créateur recevait « The browser blocked the preview window » à chaque pression, pendant que
le Preview s'ouvrait devant lui — la notice avait été émise 144 fois dans la console au
moment où elle a été mesurée, une par preview jamais ouvert, et toutes étaient fausses.

> **Le seam répond si l'appel a été FAIT, jamais si une fenêtre est apparue.**

Rien ici ne peut le savoir, et la seule façon d'en obtenir la preuve serait de rendre
`window.opener` au jeu — exactement le couplage que ce seam existe pour refuser
(ADR-0042 §5). Un créateur dont les pop-ups sont réellement bloqués garde l'URL : elle est
dans le résultat dans les deux cas.

Le seul cas encore détectable — un hôte sans `window.open` du tout — reste signalé, et c'est
désormais le seul que la notice décrit.

## 4. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| Les cinq nœuds de la catégorie sont rangés sous `Object` | `nodes.test.js`, `palette.test.js` |
| Un `On Key` neuf affiche `Space`, la valeur que son interprète lit | `inspector/node.test.js` |
| Un picker sans défaut déclaré affiche toujours son placeholder | idem |
| Le retour `null` de `noopener` n'est pas lu comme un blocage | `preview.test.js` |
| Un hôte sans `window.open` prévient quand même le créateur | idem |
| `Pressed` une fois, `Down` chaque pas, `Released` une fois | **exécuté dans Preview** |
| Ouvrir un Preview n'écrit rien dans la console | **exécuté dans Chrome** |
