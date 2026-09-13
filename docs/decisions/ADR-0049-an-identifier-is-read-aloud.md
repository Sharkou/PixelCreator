# ADR-0049 — An identifier is read aloud

- **Status:** **accepted** (2026-08-31)
- **Decides:** what an identifier is made of; which unit the trigonometric nodes speak in
- **Depends on:** ADR-0010 (identity is an ID, not a name), ADR-0045 §11.3 (a port is named for its unit)
- **Amends:** ADR-0010 in its **implementation** only — the rule "no identity derives from an editable name" is intact
- **Does not decide:** the existence of a readable slug beside the identity; `Rotation X / Y`; physics

---

## 1. Letters, and only letters

An identifier is read aloud, copied from a screenshot and pasted into a URL. A digit next to a letter
is exactly where that fails: `0` against `O`, `1` against `l`. An identifier made only of letters also
looks like a **word** rather than a fingerprint, which is what a creator sharing a link expects to
see.

> **The alphabet loses its ten digits. It keeps its twenty-two unambiguous letters.**

`i`, `l` and `o` stay out — the classic misreadings — and so does `u`, because leaving it in is how a
random string ends up spelling something nobody intended.

**ADR-0010 IS NOT TOUCHED.** That ADR forbids an identity that **derives** from a name the creator can
change. Nothing here reads a name: the value is still **drawn** from the CSPRNG. What changes is the
alphabet, not the provenance — so renaming a project still breaks nothing, and a shared URL still
survives a rename.

### 1.1 Fourteen characters, and a rejection

Twenty-two symbols are worth less than thirty-two: the old alphabet gave exactly 5 bits per character,
this one gives log₂(22) ≈ 4.46. Twelve characters would now be only 53 bits where the guarantee was
60; **fourteen** restore it (62 bits) at the cost of two characters nobody reads.

And 22 does not divide 256. Masking or taking a remainder would make the alphabet's first letters more
likely than its last — a bias that **shrinks the real value space** and that no "does it use every
letter?" test would see, since all of them would still appear. The largest exact multiple of 22 below
256 is 242: a byte beyond that is thrown away and redrawn, which happens for 14 values out of 256,
about 5 % of the time.

### 1.2 What the migration costs: nothing

Nowhere in the engine validates an identifier's shape — not the generation, not the storage, not
`idFromHash()`, which takes everything after `#p/`, not the store's keys. Identifiers already written,
digits included, therefore keep resolving exactly as before. Only **new** identifiers change shape.

### 1.3 What this does not decide

A **readable slug** — `my-game` in the URL, beside the identity — remains an open and separate
question. It arises the day a URL has to be pretty AND stable, and it requires deciding what happens
to the old URL after a rename.

---

## 2. `Sin` and `Cos` speak in degrees

A creator who has just typed `90` into a Rotation field expects to type `90` here. The conversion
lives **in the node**, exactly as in `Rotate` (ADR-0045 §11.3): the Core keeps thinking in radians and
nothing in the property model moves.

The port is therefore called `Degrees` and not `Angle` — one word to remove a question that would
otherwise have two answers.

`Distance` takes **two Objects** and not four coordinates, because that is the question a creator
asks: "is the enemy close enough". Four ports would force them to assemble the question before being
able to ask it. An Object with no Transform has no position, and therefore no distance: the answer is
zero, not an error — the rule ADR-0034 §3.4 already sets.

---

## 3. Observable contracts

| Contract | Verifiable by |
|---|---|
| A new identifier holds only unambiguous letters | `id.test.js`, and the Inspector |
| Every letter is drawn as often as the others | `id.test.js` (flatness > 0.9) |
| An old identifier, digits included, still resolves | nothing validates the shape |
| A Preview's URL carries the identifier as it is | on screen |
| `Sin(90)` is 1 and the port is called `Degrees` | `nodes.test.js` |
| `Distance` between two Objects, 0 with no Transform | the same |
