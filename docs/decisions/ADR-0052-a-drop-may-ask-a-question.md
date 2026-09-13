# ADR-0052 — A drop may ask a question

- **Status:** **accepted** (2026-08-31)
- **Decides:** what a Component released on a node means; how a unit is displayed in a numeric field
- **Depends on:** ADR-0039 §0.2 (a drop makes a finished node), ADR-0047 §1 (one question), ADR-0048 (a property is named the way it is read), ADR-0051 (Rotation is a pair)
- **Amends:** ADR-0047 §2 and ADR-0048 §3 — the refusal of the Component → node gesture is **lifted**, the premise having changed
- **Does not decide:** `On Collision` and physics; deleting a `.px` resource that is still attached; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`

---

## 1. A unit is an annotation, not a column

`Position`, `Rotation` and `Scale` read as three rows of one shape. They did not: Rotation's `°`
suffix took ten pixels in the flex row, so its digits centred **five pixels to the left** of the other
two rows'.

> **The suffix leaves the flow and sits on the field's right edge.**

The number gets back its neighbours' exact box — 59 px, same centre — and the unit stays where it was.
It does not intercept clicks, so the field beneath stays as easy to hit as any other; a value long
enough to run under it is already truncated by the input.

The `X` and `Y` labels, for their part, were **already** inside the controls — the same prefix, the
same mechanism as Position and Scale. What gave the row away was the offset, not the placement.

---

## 2. A Component released on a node opens its picker

The gesture was refused **three times**, and each refusal was right at the moment it was taken
(ADR-0040 §4, ADR-0041 §6.1, ADR-0047 §2). The underlying reason never changed: what a Component names
is a **group** of properties, and a node wants **one**. Every version that **wrote** something wrote a
value the creator did not see and the next click overwrote.

**What changed is that the picker gained levels.** It walks `Component > Property` as of ADR-0047 §1.
There is therefore now a state between "nothing chosen" and "a property chosen" that is worth reaching:
**the list, already inside that Component**.

> **The release opens that list. It writes nothing.**

With nothing written, nothing can be overwritten — the three refusals' objection falls, without their
reasoning having been wrong. The creator's next click finishes the node.

```
  drag Transform onto a Get Property
      ↓
  its picker opens on TRANSFORM
      All categories        ← the way out, always there
      Position X
      Position Y
      Rotation X
      Rotation Y
      Scale X
      Scale Y
      ↓  one click
  Object: Self   Property: Rotation Y      ← a finished node
```

**The canvas opens the control it already draws.** Building a second menu here from the same options is
how two lists begin to diverge; the rule asks, the window opens (`pickProperty`), and `px-menu` knows
how to enter a group (`category`) as `→` does.

**Bare canvas stays refused.** Which property is precisely what a Component does not say, and a release
makes a finished node or does not happen (ADR-0039 §0.2). The refusal names the two routes that work.

---

## 3. Three roundings, not one

`Round` does not let you choose the direction. Snapping to a grid, counting whole numbers and clamping
to a tile each want a particular one, and writing either from `Round` requires an offset a creator
should not have to derive. `Floor` and `Ceil` therefore join `Round`.

---

## 4. Observable contracts

| Contract | Verifiable by |
|---|---|
| The Transform's three rows centre their value in the same place | measured in Chrome |
| A Component released on a property node opens its picker in that group | `dnd.test.js`, **and run in Chrome** |
| That release writes nothing | `dnd.test.js` |
| A Component on a node that asks for no property is refused | the same |
| A Component on bare canvas stays refused | the same |
| `Floor` and `Ceil` round in their direction, negatives included | `nodes.test.js` |
