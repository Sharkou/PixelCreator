# ADR-0010 — A game's identity is an ID, not its name

- **Status:** **accepted** (2026-08-12)

## Observed context

Legacy has **no notion of a `Project`**. The server instantiates a singleton:

```js
let scene = new Scene();   // no name, no id, no project
```

The client sends `send('init', scene.name)` — the server **ignores** that parameter and returns
the one scene it holds. One server = one game.

Resources are identified by `id = path + name` (`Loader`), so **renaming a file changes its
identity** and breaks every reference pointing at it.

Everything is therefore still to be built, with no compatibility constraint.

## Decision

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

- **`id`** — opaque, stable, generated, never reused. It is **the** identity.
- **`name`** — free, editable, **non-unique**. Two games may be called "Medieval Arena".
- **`slug`** — optional, cosmetic, added later, resolved as an **alias** to the id. Never as an
  identity.

The same rule applies internally: `Object.id`, `Component`, `Resource.id`. **No identity derives
from a name the user can change.**

### Applying it to resources

`Resource.id` stops being `path + name`. Renaming or moving a file keeps its id, so every
reference (a `Texture` pointing at an image, an `Animator` pointing at a graph) survives the
rename.

## Rationale

- A name is a display attribute. Making it a key creates collisions and breaks renaming.
- Shared URLs must stay valid when the creator renames their game.
- Sharing (`SHARE`) requires a stable, short, non-guessable URL.

## Consequences

### Positive

- Renaming a game, a scene or a file breaks nothing.
- Name collisions disappear structurally.
- A slug can be added later with no data migration.

### Negative

- URLs are less readable until there is a slug.
- The Editor has to display names while handling ids everywhere: any view showing a resource must
  resolve `id → name`.
- A short id (8 characters) has to be checked for collisions. Legacy generates 9 characters
  through `Math.random().toString(36)` — not enough for public, non-guessable identifiers. The
  length and the source of randomness need revisiting.

## Open question

The scope of ids: global to the platform, or per user? It determines the required length and the
anti-collision strategy.
