# ADR-0010 — L'identité d'un jeu est un ID, pas son nom

- **Statut :** proposé

## Contexte observé

Legacy n'a **aucune notion de `Project`**. Le serveur instancie un singleton :

```js
let scene = new Scene();   // pas de nom, pas d'id, pas de projet
```

Le client envoie `send('init', scene.name)` — le serveur **ignore** ce paramètre et
renvoie l'unique scène qu'il détient. Un serveur = un jeu.

Les ressources sont identifiées par `id = path + name` (`Loader`), donc **renommer un
fichier change son identité** et casse toutes les références qui pointaient dessus.

Tout est donc à construire, sans contrainte de compatibilité.

## Décision

```
play.pixelcreator.io/7f3a91c2
```

```json
{
  "id": "7f3a91c2",
  "name": "Medieval Arena",
  "slug": "medieval-arena"
}
```

- **`id`** — opaque, stable, généré, jamais réutilisé. C'est **la** identité.
- **`name`** — libre, modifiable, **non unique**. Deux jeux peuvent s'appeler
  « Medieval Arena ».
- **`slug`** — optionnel, esthétique, ajouté plus tard, résolu comme **alias** vers l'id.
  Jamais comme identité.

La même règle s'applique en interne : `Object.id`, `Component`, `Resource.id`.
**Aucune identité ne dérive d'un nom modifiable par l'utilisateur.**

### Application aux ressources

`Resource.id` cesse d'être `path + name`. Renommer ou déplacer un fichier conserve son
id, donc toutes les références (une `Texture` qui pointe vers une image, un `Animator`
qui pointe vers un graphe) survivent au renommage.

## Justification

- Un nom est un attribut d'affichage. En faire une clé crée des collisions et casse le
  renommage.
- Les URLs partagées doivent rester valides quand le créateur renomme son jeu.
- Le partage (`SHARE`) exige une URL stable, courte et non devinable.

## Conséquences

### Positives

- Renommer un jeu, une scène ou un fichier ne casse rien.
- Les collisions de noms disparaissent structurellement.
- Un slug peut être ajouté plus tard sans migration de données.

### Négatives

- Les URLs sont moins lisibles tant qu'il n'y a pas de slug.
- L'Editor doit afficher des noms tout en manipulant des ids partout : toute vue qui
  montre une ressource doit résoudre `id → name`.
- Un id court (8 caractères) doit être vérifié comme non déjà attribué. Legacy génère
  9 caractères via `Math.random().toString(36)` — insuffisant pour des identifiants
  publics et non devinables. Longueur et source d'aléa à revoir.

## Question ouverte

Portée des ids : globale à la plateforme, ou par utilisateur ? Détermine la longueur
requise et la stratégie anti-collision.
