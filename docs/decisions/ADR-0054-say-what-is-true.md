# ADR-0054 — Say what is true

- **Status:** **accepted** (2026-09-01)
- **Decides:** the name of the `Object` category; what an untouched picker displays; what the Preview's opening seam is allowed to assert
- **Depends on:** ADR-0042 §5 (the opener is deliberately unreachable), ADR-0043 (the Object namespace), ADR-0047 §1 (one question per picker), ADR-0053 (one path, one decoder)
- **Does not decide:** `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`, `On Collision`; node width; the live channel's transport

---

Three apparently unrelated defects, one statement: **an interface has no right to assert what it does
not observe.** A name describing the implementation rather than the question asked, an empty box above
a simulation that is already running, a failure message emitted on the success path — in all three
cases what was shown and what was true had diverged.

## 1. The category is called `Object`, not `References`

The catalogue filed `Self`, `Parent`, `Find By Tag`, `Get Object` and `Is Valid` under
**`References`** — the mechanism's name. But each of those nodes answers a single question, and it is
not "which reference":

> **Which Object?**

A beginner looking for "the object I touched" does not think in references; they think in objects. The
category's name is therefore that of the **question all its nodes answer**, never that of the
structure that implements it.

The catalogue now reads:

```
Events · Input · Flow · Object · Properties · Transform · Values · Math · Compare · Logic · Debug
```

`Object` also reuses the word the property namespace already employs (ADR-0043): one word for one
notion, in both places the user meets it.

## 2. An untouched picker shows what the runtime will read

A fresh `On Key` displayed **`None`** in its `Key` field. Its interpreter, meanwhile, already read
`params.key ?? 'Space'`. The card and the simulation therefore were not talking about the same key:
pressing Space triggered a node that claimed to be listening to nothing.

The cause is one expression, in `referenceChoice()`:

```
  chosen = node?.params?.[name] ?? ''        → the declared default is ignored
```

> **A param never touched displays the declared default value, not an empty box.**

**Only where a default is declared.** A picker whose default is `null` — any property, any Component,
any socket reference — keeps displaying its placeholder, because there *nothing* IS the answer and
saying so is exactly the point of the field.

It is the same defect `value.number` had already hit and that has already been fixed once: the box and
the simulation disagreeing about the same value.

## 3. `noopener` makes blocking undetectable, so we do not assert it

`defaultOpen()` read the return value of `window.open(url, '_blank', 'noopener')` as proof of an
opening:

```
  return globalThis.open?.(url, '_blank', 'noopener') ?? null;   → null = "blocked"
```

But `noopener` **specifies** that nothing is returned: a window opened with that option gives its
opener no handle. `null` is therefore what **success** looks like. The creator received "The browser
blocked the preview window" on every press, while the Preview opened in front of them — the notice had
been emitted 144 times in the console at the moment it was measured, one per preview never blocked,
and all of them false.

> **The seam answers whether the call was MADE, never whether a window appeared.**

Nothing here can know that, and the only way of getting proof would be to give `window.opener` back to
the game — exactly the coupling this seam exists to refuse (ADR-0042 §5). A creator whose pop-ups are
genuinely blocked keeps the URL: it is in the result either way.

The one case still detectable — a host with no `window.open` at all — is still reported, and is now
the only one the notice describes.

## 4. Observable contracts

| Contract | Verifiable by |
|---|---|
| The category's five nodes are filed under `Object` | `nodes.test.js`, `palette.test.js` |
| A fresh `On Key` displays `Space`, the value its interpreter reads | `inspector/node.test.js` |
| A picker with no declared default always shows its placeholder | the same |
| `noopener`'s `null` return is not read as a block | `preview.test.js` |
| A host with no `window.open` still warns the creator | the same |
| `Pressed` once, `Down` every step, `Released` once | **run in Preview** |
| Opening a Preview writes nothing to the console | **run in Chrome** |
