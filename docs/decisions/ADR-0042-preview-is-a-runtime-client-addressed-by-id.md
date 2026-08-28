# ADR-0042 — Un Preview est un client de runtime, adressé par un identifiant

- **Statut :** **accepté** (2026-08-28)
- **Décide :** la frontière Editor / Runtime en tant que deux applications ; comment un projet est transmis à un runtime ; ce qu'est un `preview id` et comment il deviendra un `game id`
- **Dépend de :** ADR-0005 (le runtime est fait de modules), ADR-0011 (autorité), ADR-0015 (un graphe est le comportement d'un type), ADR-0020 (Resources), ADR-0029 (transport et Play), ADR-0035 (ordre de `step()`)
- **Amende :** rien. ADR-0029 reste valide et intact — voir §1.
- **Ne décide pas :** le multijoueur, le transport réseau, l'authentification, la persistance côté serveur. Voir §6, qui dit précisément où ils se brancheront.

---

## 1. Play et Preview sont deux choses, et les deux restent

ADR-0029 a décidé que **Play travaille sur la scène vivante** : pas de second Runtime, pas
de copie, l'objet modifié pendant que le jeu tourne se voit immédiatement. C'est la raison
d'être du produit — « une vue administrateur sur un runtime vivant » (`docs/PROJECT.md` §4).
Cette décision est bonne et n'est pas touchée.

Ce qui manquait est l'autre moitié :

| | Play (ADR-0029) | Preview (ici) |
|---|---|---|
| Où | dans l'éditeur | une fenêtre à part |
| Quoi | la scène **vivante**, éditable pendant qu'elle tourne | un **instantané**, isolé de l'éditeur |
| Pour | régler, observer, corriger en direct | **jouer**, comme un joueur |
| Interface | tous les panneaux | aucune |
| Adressable | non | **oui, par URL** |
| Plusieurs à la fois | non | oui — plusieurs fenêtres |

Un créateur a besoin des deux, et pour des raisons différentes : Play répond à « pourquoi
mon objet fait ça », Preview répond à « est-ce que mon jeu est jouable ». Preview est aussi
la seule des deux qui puisse devenir `play.pixelcreator.io/<id>`.

---

## 2. Décision : deux applications, une frontière, aucun import entre elles

> **L'éditeur et le client de jeu sont deux pages. Elles ne partagent pas d'état, pas de
> mémoire et pas d'imports — seulement un identifiant et un format.**

```
  src/editor/   l'éditeur          →  project, runtime, core
  src/play/     le client de jeu   →  preview, runtime, core
  src/preview/  ce qui passe entre →  project, core
```

`src/play/` ne peut rien importer de `src/editor/`, et l'inverse est vrai aussi. Ce que
l'éditeur envoie au client n'est pas un objet : c'est un **bundle**, du JSON, franchissant
une frontière que `postMessage`, `localStorage` ou HTTP peuvent porter indifféremment.

C'est la propriété qui empêche l'impasse. Le jour où le bundle vient d'un serveur, seule
l'implémentation de `resolve(id)` change ; la page de jeu, elle, ne sait pas d'où il vient.

### 2.1 Le bundle

Un projet complet, sans référence à l'éditeur :

```
{ format, id, name, manifest, payloads: { [resourceId]: payload }, scene }
```

Le manifeste est celui d'ADR-0020 (`Project.serialize()`), les payloads sont ce que le
`ResourceStore` détient, et `scene` désigne la scène à ouvrir. `bundleProject()` et
`openBundle()` sont **purs** et testés sans DOM : le même bundle qu'une page de jeu ouvre,
un serveur headless pourra l'ouvrir pour arbitrer une partie (ADR-0011).

---

## 3. Décision : un identifiant opaque, résolu derrière une seule couture

> **La page de jeu reçoit un identifiant et demande un bundle. Elle ne sait pas si cet
> identifiant est un preview local ou un jeu publié, et elle ne doit jamais le savoir.**

```
play/index.html#p/<id>   →   resolve(id)   →   bundle   →   Runtime
```

| | `preview id` | `game id` (à venir) |
|---|---|---|
| Forme | `prv_` + aléatoire | attribué par le serveur |
| Portée | ce navigateur | public |
| Durée de vie | jusqu'à remplacement ou nettoyage — §4 | tant que le jeu est publié |
| Résolution | stockage local | HTTP |
| Qui l'écrit | l'éditeur, à chaque Preview | l'action Publish |

Une seule fonction les distingue, et c'est délibérément la **seule** : `resolve(id)`. Le
préfixe rend la nature de l'identifiant lisible sans avoir à la deviner.

---

## 4. Ce qui est local et temporaire aujourd'hui

- Le bundle est écrit dans le stockage du navigateur, sous sa clé de preview.
- Le magasin garde les **quelques previews les plus récents** et jette les autres : un
  projet contient des images en data URL, et une session d'édition en produirait sinon un
  historique sans fin.
- Rien ne sort de la machine. Un lien de preview ouvert ailleurs ne trouve rien et le dit.

Ce sont des propriétés de **l'implémentation de `resolve`**, pas du modèle. Aucune d'elles
n'est visible depuis `src/play/`.

---

## 5. Ce que le client de jeu est, et n'est pas

**Est :** un canvas, un `Runtime`, une boucle, et le clavier/souris branchés sur l'`Input`
qu'ADR-0014 décrit. Il ouvre le bundle, enregistre les `.px` comme types, lie les graphes,
et avance à l'horloge fixe d'ADR-0035.

**N'est pas :** un éditeur amputé. Aucun panneau, aucune sélection, aucun `Operation`,
aucun undo. Le client ne peut pas modifier le projet — il n'a même pas le vocabulaire pour
le faire, puisqu'il n'importe rien de `src/editor/`.

---

## 6. Comment cela devient `play.pixelcreator.io/<id>`, et du multijoueur

Rien de ce qui suit n'est construit maintenant. Ce qui compte est que chaque étape soit un
**remplacement**, jamais une reprise.

| Étape | Ce qui change | Ce qui ne change pas |
|---|---|---|
| Preview hébergé | `resolve(id)` fait un `fetch` au lieu de lire le stockage local | la page, le bundle, l'identifiant |
| `play.pixelcreator.io/<id>` | l'URL, et un `game id` durable écrit par Publish | `resolve(id)` reste une fonction d'un id vers un bundle |
| Plusieurs joueurs | chaque fenêtre est déjà un client séparé ; il leur faut un `owner` et un transport | l'`Input` est **déjà** indexé par owner (ADR-0014 §3), et la simulation est **déjà** déterministe (ADR-0011) |
| Serveur autoritaire | il ouvre le même bundle, headless | `openBundle()` est pur et ne touche aucun DOM |

Le point important : **plusieurs fenêtres de preview sont déjà plusieurs clients.** Ce qui
manque au multijoueur n'est pas une refonte, c'est un transport et un `owner` par client —
exactement les deux choses qu'ADR-0011 et ADR-0014 ont laissées en attente.

---

## 7. Contrats observables

| Contrat | Vérifiable par |
|---|---|
| `bundleProject()` / `openBundle()` sont purs et sans DOM | tests headless |
| Un bundle rouvert rend la même scène et les mêmes ressources | aller-retour, dans un test |
| `src/play/` n'importe rien de `src/editor/` | `tools/layers` |
| Rien n'importe `src/play/` | idem |
| Un identifiant inconnu produit un message, jamais une page blanche | la page de jeu |
| Plusieurs previews coexistent | deux fenêtres, deux identifiants |

---

## 8. Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| Un `<iframe>` dans l'éditeur | Ce n'est pas ce qui a été demandé, et ça ne devient jamais une URL partageable : le contexte reste celui de l'éditeur. |
| `postMessage` depuis la fenêtre ouvrante | Le rafraîchissement casse la page, et l'URL ne désigne rien. Un preview qui ne survit pas à F5 n'est pas un client de jeu. |
| Un serveur de preview local dès maintenant | Un processus à lancer et à surveiller pour une fonctionnalité que le stockage du navigateur rend déjà réelle. La couture `resolve(id)` le rendra trivial le jour où il apporte quelque chose. |
| Sérialiser la scène seule | Un jeu est un projet : les `.px` sont le comportement, les images sont le rendu. Une scène sans ses ressources n'est pas jouable. |
| Réutiliser le Runtime de l'éditeur pour la fenêtre | Ce serait refaire ADR-0029, qui a déjà répondu, et cela empêcherait la fenêtre d'être un client comme un autre. |
