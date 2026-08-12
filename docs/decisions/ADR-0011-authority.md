# ADR-0011 — Le serveur est l'autorité, l'Editor émet des opérations autorisées

- **Statut :** **accepté** (2026-08-12)
- **Décide :** qui fait autorité sur l'état, et comment l'Editor peut modifier un jeu en cours
- **Lié à :** ADR-0003 (Property System), ADR-0008 (Operations)

---

## Contexte observé

Legacy n'a **aucune notion d'autorité**.

```
client → 'update' {id, prop, value} → serveur applique → rediffuse aux autres
```

Le serveur ne vérifie rien. Conséquences :

- n'importe quel client peut modifier n'importe quel objet ;
- l'Editor est **de fait** le client autoritaire, uniquement parce que `Network.sync()`
  n'est activé que si `inspector === true` — une convention, pas une garantie ;
- le serveur simule pourtant réellement (`obj.update()` à 60 Hz) et diffuse un heartbeat,
  ce qui crée deux prétendants à la vérité sans arbitrage.

C'est acceptable pour un prototype coopératif, **bloquant pour la cible affichée** du
produit : jeux .io, MOBA, MMO compétitifs.

---

## Décision

**Le serveur est l'autorité de simulation en multijoueur compétitif.**

Le créateur doit néanmoins pouvoir observer, modifier et synchroniser l'état du jeu en
temps réel depuis l'Editor, **lorsqu'il en a les permissions**.

### Deux natures de mutation

| Nature | Émetteur | Traitement |
|---|---|---|
| **Mutation joueur / client** | un joueur en jeu | intention soumise au serveur ; le client peut prédire, le serveur tranche |
| **Mutation éditeur autorisée** | le créateur, avec permissions | Operation autorisée → **validée côté serveur** → appliquée à l'état autoritaire → propagée à tous les clients |

Le chemin est identique dans les deux cas. Seules la **source** et la **vérification**
changent :

```
Operation
   │
   ▼
authority.check(op, actor)      ← accepté | rejeté | transformé
   │
   ▼
état autoritaire (serveur)
   │
   ▼
propagation aux clients
```

### Ce qui est implémenté maintenant

**Le point d'insertion, pas la politique.**

- Chaque Operation transporte un `actor` (qui) et un `origin` (`player` | `editor`).
- Le serveur possède un `authority` qui reçoit **toute** Operation avant application.
- L'implémentation initiale de `authority.check()` peut être permissive — mais elle
  **existe et est traversée**, sans exception.

### Ce qui n'est pas implémenté maintenant

Le système de permissions complet : rôles, propriété de projet, granularité par scène
ou par objet, invitations, révocation. L'architecture ne doit pas l'empêcher ; elle n'a
pas à l'anticiper en détail.

---

## Conséquences

### Positives

- Les jeux compétitifs deviennent possibles — ils ne l'étaient pas.
- Le rôle privilégié de l'Editor devient **explicite et vérifiable**, au lieu de reposer
  sur un booléen `inspector` côté client.
- Un point unique de journalisation, d'audit et, plus tard, de modération.
- Une IA agissant sur le projet passe par le même contrôle qu'un humain — elle n'a pas
  de chemin privilégié.

### Négatives

- **Latence sur l'édition en direct.** Aujourd'hui l'Editor applique localement puis
  informe. Avec validation serveur, une modification peut être rejetée après coup.
  → L'Editor applique en optimiste et **réconcilie** si le serveur refuse. La
  synchronisation lettre par lettre reste locale et immédiate ; seule la confirmation
  est asynchrone.
- **Le serveur devient un point de passage obligé**, donc un goulot et un point de
  panne. Le mode solo / hors ligne doit court-circuiter l'autorité par une
  implémentation locale qui accepte tout.
- Le serveur privé doit évoluer en même temps que le client (risque R4).

### Point d'attention

`authority.check()` ne doit pas devenir un second endroit où la logique métier se
duplique. Il **valide** (droit, cohérence, bornes), il ne **calcule** pas.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Statu quo — pas d'autorité** | Rend impossible la cible produit (jeux compétitifs), et laisse n'importe quel client modifier n'importe quoi. |
| **Autorité client (l'Editor décide seul)** | C'est le comportement actuel de fait ; non défendable dès qu'un joueur non fiable est présent. |
| **Autorité stricte sans mode optimiste** | Détruirait l'édition lettre par lettre, qui est un acquis explicitement conservé. |
| **Permissions complètes dès maintenant** | Hors périmètre v2 ; coûteux et prématuré tant que le modèle de compte n'existe pas. |
