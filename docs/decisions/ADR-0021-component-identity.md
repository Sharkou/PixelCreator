# ADR-0021 — L'identité d'une définition de Component est distincte de son nom affiché

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0004 (clé de `object.components`), ADR-0010 (identité par ID), ADR-0016 (définition), ADR-0020 (`ResourceId`)
- **Amende :** ADR-0004, § « la clé de `object.components` reste le nom du type »

## Contexte observé

ADR-0016 montrait une définition clefée par un nom lisible :

```json
{ "type": "Controller", "properties": { … } }
```

Conséquence : **renommer un Component créé par un créateur cassait toutes ses instances.**
Chaque `Object` porte son type comme clé, chaque scène l'écrit dans son JSON. Un renommage
aurait exigé de réécrire toutes les scènes du projet — ou d'interdire le renommage.

Deux autres défauts étaient mesurés :

- `registry.create()` **jetait** sur un type inconnu, donc l'absence d'un seul fichier de
  définition faisait perdre **la scène entière** au chargement ;
- une définition modifiée laissait les instances déjà sauvegardées porter des clés que le
  schéma ne déclarait plus (valeurs fantômes), et sans les clés nouvellement ajoutées.

## Décision

### 1. `type` est l'identité, `label` est le nom affiché

| | Component livré | Component d'un créateur |
|---|---|---|
| `static type` | `'Transform'` — c'est du **code**, donc stable par nature | le `ResourceId` de sa définition — c'est de la **donnée**, donc instable par nature |
| `static label` | absent ; le type est lu tel quel | `'Controller'` — librement modifiable |

**L'asymétrie est assumée** et c'est elle qui rend le choix bon marché : le nom d'un
composant livré ne peut pas changer sous les pieds d'un projet, celui d'un composant
utilisateur si.

**Renommer devient un `SET_PROPERTY` sur le `label` de la définition.** Aucune instance
n'est touchée, aucune scène réécrite, aucun projet cassé.

> **Amendement à ADR-0004.** La lettre est respectée : la clé de `object.components` reste
> `componentType(component)`. Ce qui est précisé, c'est que ce type est une **identité
> opaque** pour un Component utilisateur, et non son nom d'affichage — l'intention
> « comme dans Legacy » supposait un nom lisible et ne tient plus pour ce cas.

### 2. Ce que cela coûte, consommateur par consommateur

| Consommateur | Effet |
|---|---|
| Sérialisation | clefe par `componentType()` → **inchangé**. Le JSON porte l'identifiant |
| `describeType()` (`editor/registry.js`) | lisait déjà `ComponentClass?.label ?? SHIPPED[type]?.label ?? type` → **la couture existait** |
| Icônes | `iconForComponent()` lit `ComponentClass.icon` **avant** la table par nom → inchangé |
| Recherche Inspector | filtrait sur `humanise(type)` → **corrigé**, filtre sur le label |
| Titres de section | affichaient le type → **corrigés**, affichent le label ; l'état replié reste indexé par le **type**, pour qu'un renommage ne déplie pas un panneau |
| Runtime | le type n'est qu'une clé → **inchangé** |
| Registre | clefe par une chaîne opaque → **inchangé** |

### 3. Réconciliation structurelle au chargement (stratégie S1)

Les valeurs stockées sont filtrées par le schéma courant : **clé inconnue jetée, clé
manquante remplie par le défaut du constructeur.**

C'est ADR-0016 §4 — « une instance neuve a exactement les propriétés déclarées » — appliqué
au **chargement** et non seulement à la construction. Ajouter une propriété la fait
apparaître avec son défaut ; en retirer une jette la valeur fantôme. Aucun script de
migration n'est écrit, et le résultat est déterministe sur toutes les machines.

Un composant **sans schéma** garde tout ce qu'on lui donne : le repli réflexif est une
exigence, pas une tolérance (ADR-0007).

`active` n'est jamais filtré : il appartient au contrat du Component, pas au schéma
(ADR-0004).

**Le seul cas non couvert est le renommage d'une propriété.** Le remède honnête, le jour où
le besoin se présente, est un `previousNames: [...]` sur le descripteur. **Non construit.**

### 4. Un type introuvable ne fait plus perdre la scène

La désérialisation d'un Component de type inconnu produit un **`MissingComponent`** qui :

- conserve son nom de type, donc la place qu'il occupe ;
- conserve **intégralement** ses valeurs sérialisées, octet pour octet ;
- conserve son rang dans la collection ordonnée (ADR-0018) ;
- ne s'exécute pas — ni `update`, ni `draw` ;
- se signale dans l'Inspector, avec les valeurs qu'il détient.

Perdre une scène parce qu'un fichier manque est le pire comportement possible pour un
éditeur. Un placeholder qui préserve les données permet de restaurer la définition et de
retrouver le projet intact.

`registry.create(type)` **continue de jeter** sur un type inconnu : demander au registre un
type qu'il n'a pas reste une erreur de programmation. Ce qui change, c'est le chargement.

### 5. `revision` sert à l'invalidation, pas à la migration

Elle dit à `Behaviors` qu'un graphe a changé et à l'Editor qu'un panneau doit se
reconstruire. **Les instances ne la stockent pas** — c'est ce qui garde S1 simple.

## Ce que cet ADR ne décide pas

| Point ouvert | Où il sera tranché |
|---|---|
| Le renommage d'une **propriété** d'une définition | quand le besoin se présentera (`previousNames`) |
| Ce qu'un **serveur autoritaire** fait d'une scène incomplète : la refuser, ou la charger avec des placeholders | politique serveur, hors périmètre |
| L'UI de création et d'édition d'une définition | Editor |

## Conséquences

### Positives

- Renommer un Component est gratuit et sans risque.
- Une collision de noms entre deux projets importés est impossible.
- Une définition peut évoluer sans script de migration.
- Un fichier manquant coûte un placeholder, plus une scène.

### Négatives

- Le JSON d'une scène est moins lisible : `"type": "res_c3"` au lieu de `"type": "Controller"`.
  Le manifeste donne la correspondance, et c'est le prix d'une identité stable.
- Deux notions à ne pas confondre en lisant le code — mais elles sont maintenant nommées
  différemment, ce qui est précisément le remède.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **`type` toujours lisible** | Renommer casse toutes les instances. C'est le défaut qu'on corrige. |
| **Slug lisible figé à la création** | Renommer reste gratuit, mais slug et label divergent avec le temps, et une collision inter-projets redevient possible. Toute la complexité d'un identifiant sans son bénéfice. |
| **S2 — versions + scripts de migration** | Complexité élevée, déterminisme réseau dépendant des scripts, pour un besoin qu'S1 couvre. |
| **S3 — ne rien faire** | Valeurs fantômes sérialisées, propriétés ajoutées absentes. Incorrect. |
| **Jeter au chargement sur un type inconnu** | Fait perdre la scène entière parce qu'un fichier manque. |
