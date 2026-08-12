# ADR-0014 — L'input est abstrait, indexé par owner, et passé au runtime

- **Statut :** **accepté** (2026-08-12)
- **Décide :** où vit l'input, quelle forme il a, et comment la simulation y accède
- **Lié à :** ADR-0001 (`uid` → `owner`), ADR-0004 (contexte d'`update`), ADR-0011 (autorité)

---

## Contexte observé

**Le mode solo hors ligne ne fonctionne pas dans Legacy**, et rien ne le signale :

```
Controller.update()  →  Keyboard  →  Network.users  →  undefined  →  TypeError
```

Une exception par frame, absorbée par le `try/catch` muet d'`Object.update()`. Le
couplage est une inversion de couche complète : les entrées d'un joueur local passent par
le réseau.

L'input y est par ailleurs un **singleton global** lu depuis les composants. Un serveur ne
peut donc pas simuler plusieurs joueurs, et deux exécutions de la même scène ne sont pas
reproductibles puisque l'état des touches peut changer entre deux lectures.

---

## Décision

### 1. `runtime/input/`, pas `core/input/`

Le Core ne connaît aucun input. Un `Object` n'a pas d'entrées ; une simulation en a.

> **Correction.** `ARCHITECTURE.md` §4.5 plaçait initialement l'input dans `core/`, alors
> que `architecture/RUNTIME.md` le plaçait sous `runtime/`. C'est `runtime/` qui est
> retenu : le Core reste le modèle pur, sans notion de temps ni d'entrée.

### 2. Un état abstrait, aucun événement navigateur

`InputState` connaît des touches, des boutons, une position de pointeur et des axes
nommés. Il ne connaît ni `KeyboardEvent`, ni `MouseEvent`, ni `window`, ni `document`.

```
adaptateur navigateur ─┐
                       ├─►  InputState  ──►  simulation
couche réseau ─────────┘
```

Les noms de touches sont des chaînes opaques. Un adaptateur navigateur y met des valeurs
de `KeyboardEvent.code` ; **rien dans le runtime n'en dépend**, et un serveur qui rejoue
des noms reçus du réseau n'a jamais à fabriquer d'événement.

**L'adaptateur navigateur n'est pas construit ici.** Il appartient à la couche qui possède
le DOM, et le runtime n'en définit que le contrat.

La position du pointeur est **en espace écran**. La convertir en coordonnées monde est le
rôle de la caméra (`screenToWorld`, ADR-0013), parce que seuls la caméra et le viewport
connaissent ce mapping ; le figer dans l'état d'entrée le rendrait dépendant de la façon
dont on regarde la scène.

### 3. Indexé par owner, le local existe toujours

`Object.owner` désigne le joueur propriétaire (ADR-0001). L'input est donc un état **par
owner**, pas un clavier global :

```js
const input = ctx.input.of(self.owner);
```

Un serveur fait avancer une simulation contenant l'input de tous les joueurs ; un client
remplit le sien. L'owner `local` **existe toujours** : `of(null)` renvoie l'état local,
donc un objet sans propriétaire est jouable — c'est ce qui répare le mode solo, sans cas
particulier.

`set(owner, state)` remplace un état d'un bloc : c'est le chemin de la couche réseau,
qui reçoit un instantané plutôt qu'une suite de touches.

### 4. Passé au pas de simulation, jamais cherché dans un global

```js
runtime.step(input);
runtime.advance(elapsed, input);
```

**C'est ce qui rend la simulation déterministe.** Mêmes scène initiale et mêmes entrées ⇒
même résultat, dans un navigateur comme sur un serveur qui rejoue ce que les joueurs ont
envoyé. C'est la propriété sur laquelle repose toute réconciliation (ADR-0011).

Un runtime construit sans input **tourne sur un input vide** plutôt que d'échouer. Il ne
va jamais chercher un global : c'est précisément ce que faisait Legacy.

### 5. Fronts montants sur exactement un pas

`pressed()` et `released()` répondent vrai sur le seul pas qui observe la transition. Le
runtime appelle `input.commit()` à la fin de chaque pas, donc une pression est observée
une fois, **quel que soit le nombre de pas qu'une frame doit** — un jeu à 30 Hz et un jeu
à 144 Hz comptent le même saut.

---

## Conséquences

### Positives

- Le mode solo hors ligne fonctionne, sans réseau.
- Un serveur simule plusieurs joueurs avec un seul runtime.
- La simulation est rejouable, donc testable et réconciliable.
- Aucun DOM dans le runtime ; l'adaptateur navigateur est remplaçable.

### Négatives

- `ctx.input.of(self.owner)` est plus verbeux que `Keyboard.isDown(...)`. C'est le prix du
  multijoueur, et la seule forme qui reste correcte à plusieurs joueurs.
- `of()` crée l'état d'un owner inconnu à la première lecture. La carte grandit donc avec
  les owners réellement consultés ; `remove(owner)` la nettoie à la déconnexion.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Singleton `Input` global** | Ni multijoueur, ni déterministe, ni testable. C'est le défaut Legacy. |
| **Input dans `core/`** | Le Core est le modèle ; il n'a ni temps ni entrées. |
| **Adaptateur DOM dans le runtime** | Rendrait le runtime inutilisable côté serveur. |
| **Position du pointeur en coordonnées monde** | Rendrait l'état d'entrée dépendant de la caméra. |
| **Input lu depuis `runtime.input` sans argument de `step()`** | L'état pourrait changer entre deux pas d'une même frame : le déterminisme disparaît. |
