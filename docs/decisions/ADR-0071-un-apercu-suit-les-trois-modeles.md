# ADR-0071 — Un aperçu suit les trois modèles

- **Statut :** **accepté** (2026-09-12)
- **Décide :** ce qui traverse le canal vivant ; sous quel nom le manifeste voyage ; d'où un
  client de jeu lit ses images et ses sons ; par quel chemin le contenu d'une ressource est
  remplacé
- **Dépend de :** ADR-0020 (`Resource`, `ResourceStore`, un store asynchrone), ADR-0042
  (l'aperçu est un client de runtime), ADR-0044 (le canal vivant, deux genres de message),
  ADR-0062 (une table de ressources résolues), ADR-0069 (un enregistrement n'est pas une
  intention), ADR-0070 (`SET_PAYLOAD`)
- **Ne décide pas :** la collaboration multi-utilisateurs, un transport réseau, l'ordonnancement
  de deux éditeurs sur un même projet — voir §6

---

## 1. Le défaut

Un créateur ouvre un aperçu, revient dans l'Editor, **recoupe son tileset** — et la fenêtre
d'à côté continue de jouer l'ancien découpage. Idem pour un clip retimé, un prefab remplacé,
une image importée : rien de tout cela n'arrivait jamais dans une fenêtre déjà ouverte.

Ce n'est pas une limite annoncée. ADR-0044 §3 dit qu'un aperçu suit l'Editor, et le viewport
de l'Editor, lui, se remet à jour sur **exactement ces opérations** : `editor.js` réinterroge
`session.refresh()` dès qu'une opération touche une ressource résolue. Une moitié de la phrase
avait été écrite.

La cause est étroite. `broadcastEdits()` suit « tout modèle attaché » — la scène, chaque `.px`
— et le manifeste n'est attaché à rien : c'est un modèle de plus, avec son propre pipeline
(`project/project.js`), que personne ne suivait.

---

## 2. La décision

**Le manifeste traverse le même canal, comme une Operation, sous l'identité du projet.**

```
px.live.<projectId>
   ├── resource = <sceneId>       une opération de scène   — un état où l'on vit
   ├── resource = <pxId>          une définition entière   — un fichier qu'on lit
   └── resource = <projectId>     une opération de manifeste — ce que le projet DÉCLARE
```

Aucun genre de message n'est inventé : ADR-0044 dit « aucun protocole n'est inventé ici, ce
qui traverse est une Operation », et une opération de manifeste en est une. Le suiveur
distingue les trois **par le nom sous lequel elles arrivent**, ce qu'il faisait déjà.

### 2.1 Seules les intentions traversent

`forwardOperations()` ne relaie plus que `Origin.EDITOR`. C'est la règle qu'ADR-0069 §2 a
posée pour l'historique et pour « quel document est édité », appliquée au fil : la
comptabilité d'une sauvegarde — `revision`, `modified` — ne porte aucune charge utile, donc un
suiveur qui l'applique n'apprend rien et re-résout une définition qu'il détient déjà, deux
fois par autosave.

### 2.2 Ce qu'un suiveur fait d'une opération de manifeste

`apply()`, jamais `submit()` — la règle inchangée d'ADR-0011. Écrire l'entrée écrit aussi sa
charge utile dans le store que la page interroge ; ce qu'il reste à faire est d'**oublier ce
qui avait été résolu à partir de l'ancienne** :

| Ce qui a bougé | Ce qui est oublié |
|---|---|
| une image | `ImageCache.invalidate(id)` — la prochaine frame décode la nouvelle |
| un prefab, un clip, un tileset | l'entrée de la `ResourceRegistry`, relue depuis le store |
| une ressource supprimée | les deux, pour qu'un jeu ne fasse plus apparaître ce que le projet ne déclare plus |

C'est la paire de tables qu'`editor/project/session.js` tient déjà, et la même règle
(ADR-0062 §1).

---

## 3. Le client lit son store, pas le bundle

`openBundle()` écrit chaque charge utile dans un `MemoryResourceStore` — puis `client.js`
allait relire le **bundle figé** pour les images et les sons. Une ressource arrivée après
l'ouverture de la fenêtre n'y était pas, par construction.

Les deux résolveurs lisent désormais `opened.store`. Rien d'autre ne change : ce store répond
tout de suite, donc `draw()` n'attend toujours rien (ADR-0062 §2).

---

## 4. Remplacer un contenu est une intention

`Replace…`, et le dépôt d'un fichier sur une section *Content*, écrivaient par `project.save()`
— le chemin de la comptabilité. ADR-0070 §5 trace pourtant la ligne lui-même : `save()` écrit
ce qu'un modèle vivant a déjà décidé ; **modifier le contenu d'une ressource qui n'a pas de
modèle vivant est une intention**, donc `SET_PAYLOAD`.

Un créateur y gagne les deux choses que le pipeline donne, et qui manquaient toutes les deux :

- **remplacer le mauvais fichier s'annule** — les anciens octets voyageaient nulle part, donc
  ils étaient perdus ;
- le remplacement **traverse**, ce qui est le sujet de cet ADR.

Le `mime` et la charge utile partagent un `batch` : un seul `Ctrl Z`.

---

## 5. Ce que cela ne change pas

- Un aperçu ne peut toujours rien créer : il applique, il n'émet jamais (ADR-0042 §5).
- La scène reste tenue à jour par les opérations qui l'ont changée, jamais remplacée en bloc.
- Un `.px` continue de traverser entier, une fois par frame au plus (ADR-0044).
- `preview/` n'importe toujours rien d'`editor/`, et `tools/layers` le vérifie.

---

## 6. Ce que cet ADR ne décide pas

- **La collaboration multi-utilisateurs.** Deux éditeurs sur un projet, l'ordonnancement de
  leurs opérations, la résolution des conflits : rien de tout cela n'est décidé ici. Ce qui
  est acquis est plus modeste et suffit : le format qui traverse est celui qu'un serveur
  relaiera (ADR-0011).
- **Un aperçu qui répondrait à l'Editor.** Le fil reste à sens unique.
- **Le rechargement d'une scène ouverte dans un aperçu.** Une opération `Load Scene` reste ce
  qu'ADR-0063 en dit.
