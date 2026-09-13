# ADR-0066 — A game is a file before it is a URL

- **Status:** **accepted** (2026-09-12)
- **Decides:** what "publish" means today; what the game client accepts as an address; exactly what is missing for a Pixel Creator URL
- **Depends on:** ADR-0042 (Preview is a runtime client addressed by identifier), ADR-0044 §2 (a Preview is named by its project), ADR-0065 (a project persists)
- **Does not decide:** accounts, permissions, remote storage, a public slug, updating a published game — see §3

---

## 1. The audit

What already existed, and it is more than the word "nothing" suggested:

| Piece | State |
|---|---|
| `bundleProject()` / `openBundle()` | **done.** A bundle is the manifest, every payload and the opening scene — a JSON value, pure, with no DOM (ADR-0042 §2) |
| the game client (`preview/index.html`) | **done.** One page, one canvas, one Runtime, and nothing of the Editor: `tools/layers` holds the line |
| the addressing boundary | **done.** `resolvePreview(id)` was already the only place that knew a preview is local (ADR-0042 §3) |
| static hosting | **done, and already online.** `firebase.json` serves `public/engine/src`; `/preview/index.html` is therefore a public URL today |
| somewhere to PUT a bundle that is not this browser | **missing** |
| a published identity distinct from the project, allowed to write it | **missing** |

In other words: everything was there **except** the place to put the file, and the question of who
is allowed to put it there.

---

## 2. What ships: the file, and the address that plays it

> **Export game… writes the bundle. `#u/<url>` plays it.**

```
Editor ▸ Share ▸ Export game…      →  MyGame.pxgame.json
                                       (the very bundle a Preview reads)
dropped on any static host
                                   →  …/preview/index.html#u/<encoded url>
```

That is a playable game, on someone else's machine, with no Editor anywhere — and no backend. The
browser hands a file to a person without asking anyone's permission; everything that comes
afterwards — a URL, a name, a visibility, an update — needs a server that knows who is asking.

**Two forms of address, one boundary.** `requestFromHash()` recognises `#p/<id>` (a preview from
THIS browser) and `#u/<url>` (a bundle anyone can read); `resolveRequest()` answers both. The
client learns neither. The day a bundle comes from a Pixel Creator server, that is a third branch
**there**, and `client.js` does not move — which is what ADR-0042 §3's boundary promised.

**Two different refusals, because two different things went wrong.** "This preview is not here"
talks about a link opened on the wrong machine; "this game could not be fetched" talks about a
missing file or a read policy. One sentence for both would be wrong half the time (ADR-0054).

**A fragment, not a request.** A fragment never reaches a server, so a bundle's URL does not end up
in an access log — the reason ADR-0042 already gave for `#p/`.

---

## 3. What remains, named precisely

```
BLOCKED: publishing to a Pixel Creator URL
Reason: three decisions are missing, and none of them is technical.

  1. WHO publishes.     There is no account, no creator identity, no authenticated
                        session. `functions/` is empty and `/api/**` routes to nothing.
  2. WHERE the bundle lives. Firebase Storage and Firestore are both plausible; what
                        decides is size (a bundle carries its images as data URLs), read
                        cost and cache policy — a product trade-off.
  3. WHAT A URL NAMES.  `play.pixelcreator.io/<what>`: the project's ResourceId is opaque
                        and ugly; a slug is a name, therefore unique, therefore
                        reservable, therefore a registry and a conflict to settle
                        (ADR-0010 forbids deriving an identity from a name, not having an
                        alias — but who owns the alias is the question).

Without those three, a "Publish button" would be a button that lies. What ships is the half
that does not lie.
```

---

## 4. Counter-tests

| Verified | Where |
|---|---|
| `#p/<id>` and `#u/<url>` are recognised, and nothing else | `preview/publish.test.js` |
| A malformed URL is not an address | the same |
| A bundle is fetched and played; a failed `fetch` answers "nothing", never an exception | the same |
| The export is the very bundle a Preview reads | the same |
| The file name comes from the project and contains nothing illegal | the same |
| An empty project exports all the same, which is what it is | the same |

---

## 5. Consequences

### Positive

- A creator can let someone else play their game, today, with no account.
- ADR-0042 §3's boundary is used for real rather than described.
- What is missing is named in three lines rather than as "not done yet".

### Negative

- The creator has to find a host themselves, which in practice rules out beginners.
- A bundle carries its images as data URLs: a game of a few megabytes makes a file of a few
  megabytes, and nothing compresses it.
- An update is a new file dropped in the same place; there is no version, and nobody can tell a
  player that the game has changed.
