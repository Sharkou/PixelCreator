# Network et Serveur

> Le serveur historique est **privé**. Il n'est jamais commité dans le dépôt public.
> Cette analyse a été faite depuis une copie externe (`PixelCreator-private/`).
> Aucun extrait de code serveur n'est reproduit ici au-delà de ce qui est nécessaire
> à la compréhension du protocole.

---

## OBSERVÉ — topologie

```
Editor (inspector = true)              Joueur (inspector = false)
  update / add / remove                  mousemove / mousedown / mouseup
  addComponent / removeComponent         keydown / keyup
  addChild / removeChild
  upload_file / delete_file / save / pause
          │                                        │
          └────────────────┬───────────────────────┘
                           ▼
              ┌──────────────────────────────┐
              │  Serveur Deno (privé)        │
              │  import du mod.js du client  │
              │  scene = new Scene()         │
              │  loop      : 60 Hz  → update │
              │  heartbeat : 4 s    → scène  │
              └──────────────────────────────┘
```

### Le fait le plus important

Le serveur importe **littéralement le même module que le client**, servi en HTTPS :

```js
import * as components from 'https://editor.pixelcreator.io/src/core/mod.js';
```

Puis :

```js
const Scene = components.Scene;
let scene = new Scene();
// boucle : for (obj of scene.objects) obj.update();     ← jamais draw()
```

**Il n'existe pas de `ServerObject` ni de `ClientObject`.** C'est la preuve, en
production, que le Core est partageable. C'est l'acquis architectural le plus précieux
du projet et il doit être préservé sans compromis.

Le serveur sépare d'ailleurs proprement update et rendu — ce que le client ne fait pas
(voir `RUNTIME.md`).

---

## OBSERVÉ — messages et besoins fonctionnels

Il ne faut pas figer cette liste comme protocole v2, mais identifier le besoin derrière.

| Message | Sens | Besoin |
|---|---|---|
| `init` | le client demande la scène ; le serveur renvoie `scene.objects` | **bootstrap d'état** |
| `getUID` / `getUsers` / `connection` / `disconnection` | identité et présence | **présence** |
| `heartbeat` / `beat` | scène complète toutes les 4 s | **réconciliation** |
| `update` | `{id, type, component, prop, value}` | **mutation de propriété** |
| `add` / `remove` | objet stringifié / id | **cycle de vie d'objet** |
| `addComponent` / `removeComponent` | | **composition** |
| `addChild` / `removeChild` | | **hiérarchie** |
| `upload_file` / `update_file` / `delete_file` | | **cycle de vie de ressource** |
| `mousemove` / `mousedown` / `mouseup` / `keydown` / `keyup` | par utilisateur | **entrées joueur** |
| `pause` | démarre/arrête la boucle serveur | **contrôle du runtime** |
| `save` | **corps vide côté serveur** | persistance — non implémentée |
| `message` | broadcast texte | chat / debug |

**`update` est déjà un `SET_PROPERTY`.** `add`, `remove`, `addComponent`, `addChild`
sont déjà des opérations nommées (ADR-0008).

---

## OBSERVÉ — comportements structurants

### Prévention de l'écho

Deux mécanismes se combinent :

1. Le serveur utilise `client.broadcast(...)`, qui **exclut l'émetteur**.
2. À la réception, le client applique la valeur par un chemin qui n'émet **pas**
   `syncProperty` — donc rien ne repart.

C'est correct, et c'est ce que `origin: 'network'` remplacera en v2, de façon explicite.

### Seul l'Editor pousse des mutations

`Network.sync()` n'est appelé que si `inspector === true`. Les joueurs n'envoient que
des entrées. L'Editor est donc, de fait, **le client autoritaire** — sans que cela soit
formalisé ni vérifié.

### Aucune autorité serveur

Le serveur applique ce qu'on lui envoie, puis rediffuse. N'importe quel client peut
modifier n'importe quel objet. Acceptable pour un prototype coopératif, **bloquant pour
un jeu compétitif** (.io, MOBA) — qui est pourtant la cible affichée du produit.

### Les entrées sont routées par utilisateur

```js
Network.users[uid].keys      // état clavier par joueur
Controller.update(self) → Keyboard.keys(self.uid)
```

Un objet n'est contrôlable que si son `uid` correspond à un utilisateur connecté.
**Le modèle multijoueur est dans le moteur, pas à côté** — c'est une force.

Mais `Input` importe `Network`, ce qui **casse le mode solo hors ligne** :
`Network.users` est `undefined` hors ligne, `Keyboard.keys()` lève une `TypeError`
absorbée par le `try/catch` de `Object.update()`, et l'objet ne bouge jamais.
(vérifié — `MIGRATION.md` §4.1)

### Le heartbeat écrase

Toutes les 4 s, `broadcast('heartbeat', scene.objects)` → côté client
`obj.copy(data[id])` sur chaque objet. Conséquences :

- une valeur en cours de saisie dans l'Inspector peut être écrasée par un heartbeat ;
- `copy()` porte toutes ses limites (voir `OBJECT.md`) ;
- la charge utile n'est **pas** filtrée : elle contient les doublons `_x`, `_name`,
  `_components`… et sérialise chaque enfant deux fois. **Facteur 3,09 mesuré.**

### Pas d'interpolation

`// TODO: Interpolate the movement` dans `Network.update`. Les positions distantes
sautent d'une valeur à l'autre.

### Throttle neutralisé

`Network.sync()` implémente un throttle avec `const delay = 0` : **chaque frappe clavier
produit un message**. `syncInputs()` utilise un vrai `delay = 50` pour la souris.

---

## PROPOSITION V2

### Operations

Voir ADR-0008. Formalisation de ce qui existe déjà, sans changement d'ergonomie :

```
object.x = 100  →  Change  →  Operation SET_PROPERTY  →  transport
```

Ajouts : `previous` (undo), `seq` (ordre, perte), `author` (collaboration),
`batch` (un drag = une opération, au lieu de centaines).

### Réplication d'état

Le heartbeat complet est remplacé par des **snapshots delta** : seules les propriétés
modifiées depuis le dernier accusé de réception sont transmises. La réconciliation
complète reste disponible à la connexion et à la demande.

Combiné à la suppression des doublons `_prop` et de la duplication des enfants, la
réduction de charge utile est substantielle.

### Découplage des entrées

```
runtime/input   état des entrées par owner ; un owner « local » existe toujours
network/        alimente les owners distants
```

Le Core ne dépend plus du réseau. **Le mode solo fonctionne.**

### Client / Serveur

```
                  core/  (identique)
                        │
          ┌─────────────┴─────────────┐
       Client                      Serveur
   runtime + renderer          runtime sans rendu
   editor (optionnel)          network + persistance
```

`mod.js` est scindé en `core/mod.js` (partagé) et `runtime/mod.js` (client), pour que le
serveur cesse d'importer transitivement le rendu et le DOM.

---

### Autorité — VALIDÉ (ADR-0011)

**Le serveur est l'autorité de simulation en multijoueur compétitif.**

Le modèle distingue deux natures de mutation :

| Nature | Émetteur | Traitement |
|---|---|---|
| **Mutation joueur / client** | un joueur en jeu | intention soumise au serveur ; le client prédit, le serveur tranche |
| **Mutation éditeur autorisée** | le créateur, avec permissions | Operation autorisée → **validée côté serveur** → appliquée à l'état autoritaire → propagée |

Chemin commun :

```
Operation → authority.check(op, actor) → état autoritaire → propagation
```

Le **système de permissions n'est pas implémenté maintenant**. Ce qui est implémenté :
le point de passage. Chaque Operation transporte un `actor` et un `origin`, et traverse
`authority.check()` sans exception — même si la politique initiale accepte tout.

L'Editor applique en **optimiste** et réconcilie si le serveur refuse : la
synchronisation lettre par lettre reste locale et immédiate, seule la confirmation est
asynchrone.

En solo / hors ligne, l'autorité est une implémentation locale permissive — aucun
aller-retour réseau.

---

## Questions restantes

| Question | Enjeu |
|---|---|
| Le serveur reste-t-il en Deno ? | Il utilise `std@0.117` `ws`, API obsolète ; toute évolution du protocole impose une migration simultanée des deux côtés (risque R4) |
| Persistance : `save` a un corps vide. Où et comment stocker un projet ? | Prérequis de CREATE/PLAY/SHARE |
| Un serveur par jeu, ou un serveur multi-projets ? | Legacy : un serveur = une scène singleton (ADR-0010) |

Ces questions concernent l'infrastructure, pas le modèle. Elles ne bloquent pas les
étapes 1 à 4 de `../MIGRATION.md` §5.
