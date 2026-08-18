# ADR-0020 — `Resource`, `ResourceId`, `ResourceStore`, et la couche `src/project/`

- **Statut :** **accepté** (2026-08-14)
- **Dépend de :** ADR-0010 (identité par ID), ADR-0011 (serveur autoritaire), ADR-0017 (l'état d'IDE n'entre pas dans le modèle)
- **Complété par :** ADR-0021 (identité d'une définition), ADR-0024 (Undo/Redo)

## Contexte observé

Legacy dérivait l'identité d'une ressource de son emplacement : `id = path + name`
(`ARCHITECTURE.md` §9). Renommer un fichier changeait donc **ce qu'il était**, et cassait
toute référence vers lui. Les payloads binaires voyageaient en base64 **à l'intérieur** du
JSON d'une scène, ce qui faisait transporter les images à chaque instantané répliqué.

v2 n'avait aucune notion de ressource : `Store` (IndexedDB) était écrit et inutilisé, et
rien ne chargeait un projet.

## Décision

### 1. Une seule unité : `Resource`

`kind ∈ { folder, scene, component, graph, asset }` — **`folder` ajouté par ADR-0025**.

| | |
|---|---|
| **Identité** | `ResourceId` opaque, **immuable**, indépendante du nom et du rangement |
| **Contient** | `id`, `kind`, `name` (affiché), `parent` (rangement), `revision`, `created`, `modified`, `mime` pour un asset |
| **Ne contient pas** | une référence par chemin ; de l'état d'exécution ; de l'état d'Editor |
| **Propriétaire** | la couche **Project** |

- `id` — identité. Jamais dérivée du nom ni du rangement, jamais réutilisée.
- `name` — affichage. Modifiable, non unique, **référencé par rien**.
- `parent` — rangement, **par identité**. Le déplacer ne casse rien.

> **Amendé le 2026-08-17 (ADR-0025).** Cette section écrivait `path` — une chaîne
> indicative. Une chaîne faisait de la hiérarchie une convention de nommage : renommer un
> dossier obligeait à réécrire chaque entrée qui le mentionnait, et rien ne disait qu'un
> dossier existait. `parent` nomme un `Resource` de `kind: 'folder'`, comme `Object.parent`
> nomme un objet ; le chemin affiché est **dérivé**. `MANIFEST_VERSION` passe à 2.

Déplacer un projet : les chemins changent, les ids non. Copier un projet : ids identiques,
cohérence interne préservée. Renommer : un champ d'affichage bouge, rien d'autre.

**Importer une ressource d'un autre projet** est le seul cas de collision concevable ; le
traitement honnête est une passe de remappage à l'import. **Il n'est pas construit.**

### 2. `Asset` n'existe pas comme concept

Une image est une `Resource` de `kind: 'asset'` dont le payload vit hors du JSON. En faire
un pair de `Resource` créerait deux schémas d'identité, deux formes de référence dans une
propriété, deux chemins de chargement et de réplication — et laisserait sans réponse :
pourquoi une image serait-elle un `Asset` et un `.px` une `Resource`, alors qu'une
propriété les référence de la même façon ?

« Asset » reste un mot d'interface. Pas un concept du modèle.

### 3. `Document` n'existe pas

| Ce que `Document` apporterait | Qui le détient déjà |
|---|---|
| identité | `Resource.id` |
| contenu | le payload |
| persistance | `ResourceStore` |
| état « modifié » | dérivable de l'événement `'operation'` du pipeline de la ressource |
| pile d'undo | l'historique, **par ressource**, donc déjà indexé par `ResourceId` |
| état de vue (scroll, zoom, repli) | **état d'Editor, qui n'entre jamais dans le projet** |

`Document` serait donc soit un alias de `Resource`, soit un mélange de modèle et d'état
d'IDE — l'erreur exacte que `scene.current` était dans Legacy, et que **ADR-0017** interdit.

**Ce qu'un onglet ouvre s'appelle un `OpenEditor`** : `{ resourceId, kind, viewState,
history }`, un objet de la couche Editor, **jamais sérialisé dans le projet**. Sa
persistance éventuelle (« quels onglets étaient ouverts ») appartient à un *workspace*, un
artefact jetable dont la perte ne coûte rien.

### 4. `ResourceStore` est le seul point de contact avec le stockage

```
list()            entrées du manifeste
read(id)          payload
write(res, data)  persiste
delete(id)
```

Une interface, plusieurs implémentations, aucune dans le Core : mémoire (tests, démarrage),
IndexedDB (local / hors ligne), HTTP (plus tard — l'implémentation seule change).

Le contrat est **asynchrone** : chaque méthode peut renvoyer une promesse, et les appelants
attendent. Un store qui parle à IndexedDB ou à un serveur ne peut pas être synchrone, et
prétendre le contraire imposerait de réécrire tous les appelants le jour où il arrive.

**Chargement paresseux et par identifiant :** ouvrir un projet lit le manifeste, pas les
payloads. **Un payload binaire n'est jamais en base64 dans le JSON d'une scène.**

### 5. Une nouvelle couche `src/project/`

```
editor/  ──►  project/  ──►  core/
runtime/ ──►  core/
core/    ──►  (rien)
```

`project/` n'importe ni le DOM, ni `runtime/`, ni `editor/`. Un serveur headless doit
pouvoir charger un projet — c'est ce qu'impose **ADR-0011**.

`runtime/ → project/` est interdit aussi : ce serait mettre le stockage derrière une API de
runtime, ce que `behaviors.bind(type, graph)` — qui prend un graphe **résolu** — existe
précisément pour éviter.

**Les règles sont déclarées dans `tools/layers/rules.js` et vérifiées à chaque exécution**,
pas seulement écrites ici.

### 6. Un second pipeline `Operations`, pas un second système

Le `resolve` d'un pipeline de Scene résout des identifiants d'`Object` ; il ne peut pas
résoudre une ressource. Le Project instancie donc son propre `Operations` : même classe,
même contrat, même anti-écho, `resolve` différent — exactement comme un `Object` détaché
instancie déjà le sien.

`ADD_RESOURCE` / `REMOVE_RESOURCE` en découlent, et sont inversibles comme les autres
(ADR-0019).

### 7. `revision` sert à deux choses, et à deux seulement

Dire à `Behaviors` qu'un graphe a changé, et dire à l'Editor qu'un panneau doit se
reconstruire. **Les instances ne stockent pas de `revision`** — c'est ce qui garde la
réconciliation structurelle simple (ADR-0021).

## Ce que cet ADR ne décide pas

| Point ouvert | Où il sera tranché |
|---|---|
| L'implémentation IndexedDB et la politique de cache HTTP | avec le mode hors ligne |
| Le remappage d'identifiants à l'import inter-projets | quand l'import existera |
| La portée d'undo d'une action qui touche deux ressources | quand la fenêtre `Graph` existera (voir ADR-0024) |
| Le format binaire des payloads d'assets | avec le pipeline d'assets |

## Conséquences

### Positives

- Renommer, déplacer et copier deviennent gratuits — le défaut de Legacy disparaît par
  construction.
- Une scène répliquée ne transporte plus d'images.
- Un serveur headless charge le même projet qu'un navigateur.
- Créer et supprimer une ressource est répliquable et annulable, sans code dédié.

### Négatives

- Une couche de plus, et une règle de dépendances de plus à faire respecter.
- Le contrat asynchrone du store se propage aux appelants (`loadComponentDefinitions` est
  `async`) même quand l'implémentation est synchrone.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **`Document` comme unité d'édition** | Soit un alias de `Resource`, soit un mélange de modèle et d'état d'IDE. C'est `scene.current` qui revient. |
| **`Asset` pair de `Resource`** | Deux identités, deux références, deux chargements, deux réplications, sans raison. |
| **Mettre le chargement dans `editor/`** | Un serveur ne peut pas dépendre d'un IDE (ADR-0011). |
| **Identité = chemin + nom** | C'est exactement le défaut de Legacy : renommer change ce qu'une chose est. |
| **Payload binaire en base64 dans la scène** | Fait voyager les images à chaque instantané. |
