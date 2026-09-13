# ADR-0053 — One path, one decoder

- **Status:** **accepted** (2026-08-31)
- **Decides:** what a property drop writes into a node
- **Depends on:** ADR-0040 §2 (a property of the current `.px` is stored with no type), ADR-0043 (the Object namespace), ADR-0047 §1 (one question, a composite value in the picker)
- **Does not decide:** the Component → bare canvas gesture; deleting a `.px` resource; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`, `On Collision`

---

## 1. The defect

Dropping `Active` — a property of the `Object` namespace — onto a `Get Property` left the node reading
**`/active`**: the left half of the path gone. The node then resolved against the current `.px`'s
fields, where no property of that name exists.

The cause is a collision between two writes that were each correct on their own:

```
  setNodeParams(node, { component: 'Object', property: 'active' })
        ↓ one write per entry, in a batch
  #writeParam(node, 'component', 'Object')      → written
  #writeParam(node, 'property',  'active')      → paramWrites() reads a PATH
        ↓ splitPropertyPath('active') → no '/'
  { component: null, property: 'active' }       → the Component is overwritten
```

`property-to-node` wrote the two halves separately, which worked — until the day one picker started
asking the whole question (ADR-0047 §1) and `paramWrites()` began reading every write on `property`
**as a path**.

## 2. The decision

> **A property drop writes a single param: the path.**

That is what the control writes. There is therefore **one encoding and one decoder**, and not two
producers one of which ignores the other's grammar.

An empty Component half is no longer a case to handle: `'/p_speed'` says "a property of this
Component" by construction, and replaces the one the node named before instead of leaving it lying
around.

## 3. Why the Object namespace revealed it

A property of a real Component also lost its left half, but the node often kept working: `null` means
"this Component" and a `.px` sometimes declares a property with the same identifier. `Object` does not
have that luck — no `.px` declares `active` — so the node broke visibly. The defect was general; it is
the namespace that made it readable.

## 4. Observable contracts

| Contract | Verifiable by |
|---|---|
| A drop on a node writes a single param, the path | `dnd.test.js` |
| A property of the current `.px` is written with an empty left half | the same |
| A property of the `Object` namespace keeps its namespace | the same |
| The four system properties produce correct nodes | **run in Chrome** |
