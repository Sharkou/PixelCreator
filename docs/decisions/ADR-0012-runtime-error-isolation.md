# ADR-0012 — Le Runtime isole et rapporte les erreurs, il ne modifie pas le modèle

- **Statut :** **accepté** (2026-08-12)
- **Décide :** ce que le Runtime fait — et ne fait pas — quand un Component lève une exception
- **Lié à :** ADR-0004 (cycle de vie des Components), ADR-0003 (Property System), ADR-0011 (autorité)

---

## Contexte observé

### Legacy avale les erreurs

`Object.update()` entoure chaque appel de composant d'un `try/catch` qui **ne signale
rien**. C'est ce qui a rendu invisibles trois défauts documentés dans
`migration/LEGACY_ANALYSIS.md` :

| Défaut | Ce que le `try/catch` en a fait |
|---|---|
| `Tilemap.draw(ctx, camera)` reçoit un `Object` | `TypeError` à chaque frame, jamais affichée |
| `Collider.update()` référence `Scene.main` non importé | `ReferenceError` à chaque frame, jamais affichée |
| `Controller` → `Keyboard` → `Network.users` hors ligne | mode solo cassé, **et silencieux** |

L'isolation était bonne : une frame ne tombait pas. Le signalement était absent.

### La première v2 a corrigé le signalement et introduit un défaut plus grave

L'étape 2.8 a ajouté un `onError`, mais aussi un compteur d'échecs : après
`maxFailures` exceptions consécutives (3 par défaut), le Runtime exécutait

```js
component.active = false;
```

L'intention était raisonnable — ne pas rejouer soixante fois par seconde une erreur
systématique. Le mécanisme, lui, ne l'est pas.

**Un Component attaché est enveloppé dans un Proxy réactif** (`Object.addComponent()`
appelle `makeReactive()`). Cette écriture n'est donc pas un détail interne du Runtime :
elle traverse le trap `set` du Property System, **émet un `Change`**, est visible de
l'Inspector et est candidate à la réplication.

Autrement dit : **une exception dans un script utilisateur mutait l'état de simulation.**

Pour un moteur multijoueur autoritaire (ADR-0011), c'est exactement à l'envers. L'état
que le serveur arbitre se mettrait à dépendre du fait qu'un script a levé une exception,
sur cette machine-là, à cette frame-là. Deux clients exécutant la même simulation
divergeraient parce que l'un a rencontré une erreur et l'autre non. La désactivation
serait par surcroît répliquée comme une intention légitime, sans qu'aucune intention
n'ait jamais existé.

---

## Décision

**Le Runtime isole les erreurs d'exécution et les rapporte. Il ne modifie jamais
automatiquement l'état du modèle en réaction à une erreur.**

Quatre préoccupations étaient confondues ; elles sont désormais séparées :

| Préoccupation | À qui elle appartient |
|---|---|
| Isolation d'une exception | **Runtime** — `try/catch` autour de `update()` et `draw()` |
| Signalement | **Runtime** — un rapport structuré passé à `onError` |
| Politique (afficher, compter, mettre en pause, désactiver) | **couche supérieure** — Editor, serveur, hôte |
| État de simulation | **modèle seul** — jamais écrit par le Runtime |

### 1. Aucune auto-désactivation

`maxFailures`, le compteur d'échecs et l'écriture `component.active = false` sont
supprimés. Un Component qui lève une exception à chaque frame sera appelé à chaque
frame, et signalé à chaque frame. C'est à la couche supérieure de décider que cela
suffit.

**Invariant, couvert par un test :** une exception d'exécution ne produit aucun `Change`
du seul fait que le Runtime la traite.

### 2. `active` reste une propriété normale du Component

Aucun mécanisme spécial n'est créé pour `active`. C'est une propriété réactive
ordinaire, dont seule la **direction d'usage** est normative :

- **lue** par le Runtime et le SceneRenderer, pour décider d'exécuter `update()` /
  `draw()`. Une propriété absente vaut « actif » ;
- **écrite** par le code utilisateur, par un Component ou par l'Editor, via le Property
  System normal ;
- **jamais écrite par le Runtime.**

Une couche supérieure qui *choisit* de désactiver un script après N erreurs reste
parfaitement libre de le faire : elle écrira `active` elle-même, explicitement, et cette
écriture sera alors une intention réelle, attribuable et représentable en Operation
(ADR-0008).

### 3. Un rapport structuré, une seule voie

```js
new Runtime(scene, { onError: report => { /* politique */ } });
```

```js
{
    error,      // l'objet Error original, jamais modifié
    object,     // l'Object concerné
    component,  // le Component concerné
    type,       // nom de type du Component
    phase,      // 'update' | 'draw'
    time        // temps de simulation de l'échec, null si inconnu
}
```

Le consommateur **lit des champs, il ne parse jamais un message**. C'est ce qui permet à
l'Editor de regrouper par composant, d'ouvrir l'objet fautif, ou de distinguer un échec
de simulation d'un échec de rendu — rien de tout cela n'est récupérable depuis une chaîne.

La version précédente réécrivait `error.message` pour y injecter le contexte : elle
mutait un objet qui ne lui appartenait pas, et détruisait le message d'origine. **L'Error
originale n'est plus jamais touchée.**

**Une seule voie de signalement.** Pas d'émetteur `runtime.errors` en parallèle. Une API
minimale, sur laquelle l'Editor branchera sa propre politique le moment venu.

### 4. Sans `onError`, l'erreur reste bruyante

Le rapporteur par défaut diffère le lancement (`queueMicrotask`) pour que la frame
courante s'achève, puis lève une erreur de contexte dont `cause` est l'erreur
d'origine, intacte. Elle atterrit sur le chemin des erreurs non capturées de
l'environnement, où elle ne peut pas passer inaperçue.

**Le silence de Legacy n'est jamais reproduit.** Une erreur non consommée reste visible.

---

## Conséquences

### Positives

- Le Runtime n'a plus aucun chemin d'écriture vers le modèle. La règle se vérifie par
  lecture du fichier, et par un test.
- La simulation ne peut plus diverger entre deux machines à cause d'une exception.
- La politique d'erreur est décidée là où le contexte existe : l'Editor peut mettre en
  pause en développement, le serveur peut appliquer une règle plus stricte, sans que le
  Runtime ait à connaître l'un ou l'autre.
- Le rapport est directement exploitable par l'Editor, avant même qu'il existe.
- Le contrat est fixé **avant** l'arrivée du scripting, de la physique et des autres
  domaines runtime, qui le consommeront tous.

### Négatives

- Un Component systématiquement cassé est appelé et signalé à chaque frame. Sans
  consommateur `onError`, cela peut produire beaucoup de bruit. C'est délibéré : le bruit
  est un symptôme visible, le silence de Legacy ne l'était pas. La couche supérieure a
  tout ce qu'il faut pour throttler ou désactiver — explicitement.
- `onError` est appelé dans la boucle chaude. S'il lève une exception, la frame tombe :
  c'est un défaut de la couche de politique, pas du Runtime, et il doit être visible.

---

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **Conserver l'auto-désactivation** | Transforme une exception en mutation d'état répliquée. Incompatible avec ADR-0011. |
| **Désactiver via un drapeau interne au Runtime plutôt que `component.active`** | N'émettrait pas de `Change`, mais créerait un second état d'activation invisible du modèle et de l'Inspector — deux sources de vérité, et une désactivation que rien n'explique. |
| **Émetteur `runtime.errors` en plus de `onError`** | Deux voies pour un seul besoin. `onError` suffit ; un émetteur pourra être ajouté par la couche supérieure si elle en veut un. |
| **Enrichir `error.message` avec le contexte** | Mute un objet qui appartient à l'appelant et impose de parser une chaîne. C'est le rôle des champs du rapport. |
| **Avaler l'erreur en l'absence de consommateur** | C'est précisément le bug Legacy. |
| **Compter les erreurs dans le Runtime sans désactiver** | Un compteur est déjà une politique. La couche supérieure compte si elle en a besoin ; le Runtime n'a pas à décider ce qu'est « trop ». |

---

## Portée

Cette décision porte sur les erreurs d'exécution des Components pendant `update()` et
`draw()`. Elle ne traite pas :

- le chargement et l'exécution des scripts `.px` / `.js` — le scripting n'existe pas
  encore (ADR-0009) ;
- les erreurs de validation d'Operation, qui relèvent de l'autorité (ADR-0011) ;
- l'affichage des erreurs dans l'Editor, qui est une politique et sera conçue avec lui.
