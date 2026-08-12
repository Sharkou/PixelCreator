# ADR-0015 — Un script compile vers un comportement, exécuté par un Component

- **Statut :** **accepté** (2026-08-12)
- **Décide :** la couture par laquelle du code utilisateur devient quelque chose que la simulation exécute
- **Lié à :** ADR-0004 (Components), ADR-0005 (pas de « Systems »), ADR-0009 (`.px` et `.js`), ADR-0012 (erreurs)

---

## Contexte

ADR-0009 a tranché **quoi** : `.px` est un graphe interprété, `.js` un vrai module ES.
Aucun des deux n'est construit — le graphe attend son modèle de données et son
interprète, `.js` attend le chargement de ressources.

Ce qui manque et bloque la suite, c'est **par où** ils entrent dans la simulation. Cette
décision ne construit ni langage, ni interprète, ni VM, ni bac à sable : elle fixe la
couture, pour que les deux implémentations à venir s'y branchent sans rien changer au
runtime.

---

## Décision

### 1. La couture

```
source  ──(compilateur de kind)──►  behavior  ──(Component Script)──►  update(self, ctx)
```

Un **kind** de script (`px`, `js`, …) est enregistré sur un hôte `Scripting` avec une
fonction qui transforme une source en **behavior** — un objet exposant `update`,
duck-typé comme tout le reste (ADR-0004).

Un hôte `Scripting` **ne connaît aucun kind à sa création**, et c'est son état correct :
c'est un registre, pas un langage.

### 2. Il n'y a pas de `ScriptSystem`

Un script s'exécute parce qu'un **Component** l'exécute, exactement comme toute autre
logique de jeu (ADR-0005). Ce n'est pas une préférence de style : le script hérite ainsi
gratuitement de l'isolation des erreurs (ADR-0012), du pas fixe, de la séparation
update/draw, de l'ordre déterministe et de l'exécution headless — **sans second chemin
d'exécution à maintenir cohérent entre client et serveur.**

C'est la réponse directe à l'exigence « même contrat de simulation des deux côtés » : il
n'y a pas deux contrats, il n'y en a qu'un, celui des Components.

### 3. Le comportement compilé n'est pas de l'état

Les propriétés propres énumérables d'un composant **sont** son état sérialisé. Un behavior
est un objet vivant, porteur de méthodes, **dérivé** de `kind` et `source`. L'écrire sur
le composant mettrait des fonctions dans chaque instantané et chaque charge répliquée.

Il vit donc dans une `WeakMap` indexée par le composant. Ce qui sérialise est exactement
ce qui identifie le script : **son kind et sa source**.

### 4. Compilé à la première utilisation, recompilé si la source change

Pas de phase de chargement séparée qu'on peut oublier d'appeler, et éditer `source` dans
l'Inspector prend effet au pas suivant.

### 5. Les erreurs suivent ADR-0012, sans exception

Compilation impossible, kind inconnu, hôte absent, exception du script : tout remonte
comme un `throw` depuis `update()`. Le runtime le **rapporte** et ne touche à rien.

- aucune désactivation automatique ;
- aucune écriture implicite d'`active` ;
- aucun `Change` produit par le traitement de l'erreur ;
- le reste de la scène continue de tourner.

Un script systématiquement cassé est signalé à chaque pas. C'est délibéré : le silence de
Legacy est ce qu'on refuse.

### 6. `Script` ne dessine pas

Le `SceneRenderer` établit la transformation d'un objet dès qu'un de ses composants
déclare `draw`. Un `Script` qui en déclarerait un en permanence ferait payer à **tout**
objet scripté — y compris purement logique — un `save`/`setTransform`/`restore` par frame,
et le compterait comme dessiné.

Les scripts qui produisent des pixels sont un besoin réel, mais ils demandent un type de
composant qui l'assume, pas un crochet sur le lanceur générique.

---

## Limite connue : un script par Object

Un `Object` porte un composant par type (ADR-0004), donc un `Script`.

**La réponse n'est pas d'assouplir cette règle.** Un script compilé devrait à terme
devenir **son propre type de composant** enregistré dans le `ComponentRegistry` : il y
gagne un nom, un schéma et une entrée d'Inspector, et plusieurs scripts par objet
deviennent naturels. Cela demande le chargement de ressources — une étape ultérieure.

---

## Conséquences

### Positives

- Zéro nouveau chemin d'exécution dans le runtime.
- `.px` et `.js` se branchent sans rien modifier de ce qui existe.
- Identique client et serveur, par construction.
- Rien de spécifique à un langage n'est figé prématurément.

### Négatives

- Un script par objet pour l'instant (voir ci-dessus).
- La compilation paresseuse fait porter le coût du premier appel au premier pas. Sans
  conséquence pour un graphe ou un module déjà chargé.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **`ScriptSystem` orchestrant les scripts** | Second chemin d'exécution à maintenir, et contredit ADR-0005. Un script est une logique de jeu comme une autre. |
| **`eval` / `new Function` sur du texte** | Sécurité, et contredit ADR-0009 (`.px` interprété, `.js` chargé comme module). |
| **VM ou bac à sable dès maintenant** | Décide par accident une question qui n'est pas posée, pour un besoin non démontré. |
| **Behavior stocké sur le composant** | Met des fonctions dans la sérialisation et la réplication. |
| **Compilation explicite via un `load()`** | Une phase de plus qu'on peut oublier d'appeler, et un état « pas encore chargé » à gérer partout. |
