# ADR-0039 — A target you designate is a parameter; a category says what a node IS; an identity enters according to its SCOPE

- **Status:** **accepted** (2026-08-27)
- **Amended by:** ADR-0040 (2026-08-28) — §5 becomes absolute: the dynamic-title mechanism disappears from the contract instead of merely going unused
- **Decides:** how a property node designates the Object it acts on; the node taxonomy and what it feeds; which identities a `.px` may hold; where a configured node is read
- **Depends on:** ADR-0020 (Resources), ADR-0023 (`PropertyType`), ADR-0027 (the graph model), ADR-0030 (§4, the palette), ADR-0033 (rows), ADR-0034 (Object references), ADR-0037 (a drop declares)
- **Amends:** ADR-0034 §7 (the "targeting mode as a parameter" is conditionally rehabilitated); ADR-0037 §2.4 (a drop produces a finished node) and §6 (the property handle is settled); ADR-0030 §4 (six hues become seven); ADR-0034 §3.7 and ADR-0037 §2.3 (the refusal to drop a **Resource** is lifted)
- **Does not decide:** a `component` or `property` port type, which stay refused — see §4

---

## 0. The main defect: the creator had to restate what the Editor already knew

To write "make the player rotate", you had to:

1. drag `Player` from the Hierarchy;
2. drag `Transform.rotation` from the Inspector;
3. pull a wire from the first node to the second's `Target` port.

Yet at step 2 the Inspector **was displaying Player**. The Object, the Component and the property
were all three known at the moment of the gesture, and the model asked for two more.

### 0.1 Decision — the mode does not exist; there is one question asked twice

> **A node never asks a creator whether its target is "static" or "from a wire". Those are words
> about the implementation, not about the game. It has an Object socket, always visible, and a
> picker on the same row: connect something and the connection is the target, leave it empty and the
> picker is.**

A first version exposed that choice — a `Target: [ Player | From Wire ]` menu — and it was a UX
mistake: a beginner does not know what "From Wire" means, and should not have to know a node's
internal model to use it. **The mode is inferred from the gesture.**

| What the creator does | What the node does |
|---|---|
| picks an Object in the picker | the node acts on it |
| connects something to the socket | the connection wins, the picker greys out and says why |
| removes the wire | the picker answers again, with what it was already naming |

**The socket never disappears.** A socket you cannot see is a socket you cannot connect — and
connecting is precisely the half of the gesture the param does not cover. The two share a row
because they answer one question.

**A connection wins by EXISTING, not by producing an Object.** A `Find By Tag` that finds nobody must
write on nobody, and not fall back on what the picker names: `io.wired(port)` answers the structural
question, so the fallback is a rule and not a guess.

`property.getOn` and `property.setOn` therefore gain a `target` param — the id of one of the `.px`'s
`objectref` sockets, or nothing. Absent, the socket answers: which is exactly what every graph
written before this param does, so **no migration**.

**The param never names an Object.** It names a **socket** — a property this `.px` declares — and
therefore a project-scoped identity (ADR-0027 §4). The `ObjectId` stays where ADR-0034 §3.5 puts it:
in the value each attached Object carries. A statically targeted `.px` stays reusable across fifty
scenes and says so in the Inspector.

**The resolution opens no door.** A socket is an instance value whose schema declares `objectref`:
that is exactly the provenance ADR-0036 §2 authorizes, resolved by the `portValueOf()` that
`property.get` already uses. No node converts an arbitrary string into an Object.

**Typing does not move.** `value`'s type comes from `(component, property)`, read in the node alone —
and therefore exact whether the target is designated or computed. That is why the target is a param
and not a "Property Reference" travelling on a wire: that model would make the type a function of
what is plugged in, and the first dynamic producer would drop it back to `any`. See §4.

### 0.2 Decision — a drop produces a FINISHED node

A property drop declares (or **reuses**) the socket of the Object the Inspector was showing, and
points the node at it — under one batch, and therefore one `Ctrl Z`.

Reusing, not uniquifying: dropping the Object itself IS the "declare an input" gesture and two drops
declare two (ADR-0037); dropping a property is the "target this property" gesture, where the socket
is a means. Asking for three of Player's properties must not leave three sockets to fill in three
times.

| Gesture | What the creator sees | What the `.px` gains |
|---|---|---|
| Hierarchy `Player` → canvas | a **`Get Object`** node with `Object: Player` | an `objectref` property named `Player` |
| Inspector `Transform` (handle) → canvas | a Get/Set menu, then a **targeted** node | the socket + `{ target, component }` |
| Hierarchy `Player` → **onto a node** | that node is pointed at Player | the socket, and a param |
| Inspector `Transform.rotation` (handle) → canvas | a Get/Set menu, then an already-filled **`Set Property On`** | the socket + `{ target, component, property }` |
| Project `hero.png` → canvas | a `Resource` node | `{ value: ResourceId }` |

**No `ObjectId` in any of those payloads.** The identity travels with the drag so that the rule can
name the socket; it stops there.

---

## 1. Three defects, and they came from two confusions

| Finding | The real cause |
|---|---|
| `Key` and `Pointer` read like `Branch` | `Input` had **no row** in the hue table and fell back on `any`'s grey, a hair away from `Flow`'s steel |
| `Self` and `Get Property On` carried the same purple | Everything leaving the Component was called `Scene`: **returning a reference** and **reaching a property** were one category |
| Dropping an image on the canvas was refused | ADR-0034's rule — "no identity in a `.px`" — was applied to a `ResourceId` when it speaks of an `ObjectId` |

The first two are the same confusion: **a node's category was not an answer to "what is it?"**, but
to "where does it come from?". The third is a confusion between the **kind** of an identity and its
**scope**.

---

## 2. Decision: a category answers "what this node IS"

`NODE_CATEGORIES` becomes:

```
Events · Input · References · Properties · Flow · Values · Math · Compare · Logic · Debug
```

`Scene` disappears, and what it held is filed by what the nodes **do**:

| Node | Before | After | Why |
|---|---|---|---|
| `Self`, `Parent`, `Find By Tag`, `Is Valid` | Scene | **References** | they return a handle and take part in no execution |
| `Get Property On`, `Set Property On` | Scene | **Properties** | they are `Get`/`Set Property` **targeted elsewhere**: same semantics, same plain write, same referencing by identity (ADR-0034 §3.3) |

**A category is presentation and is never serialized.** A node carries its `type`, its params and its
position; the family is read from the catalogue at load time. Renaming a category therefore costs
**no migration**, and no graph written before this line changes meaning.

### 2.1 The palette gains a seventh hue — amends ADR-0030 §4

ADR-0030 §4 argued for six hues against "one per category, which teaches nothing". The argument held
against twenty; it does not hold against **seven**, and six could not express the difference §1 has
just established:

| Family | Hue |
|---|---|
| Events **and** Input | `--px-accent` — the outside world arriving: an instant and a lasting state are one family to the eye, two groups in the menu |
| References | `--px-hue-reference` — **the purple of the `object` port itself**, so a `Self` and the socket it feeds are visibly the same thing |
| Properties | `--px-hue-property` — **new** |
| Flow | `--px-hue-flow` |
| Values | *none* — a literal carries the hue of what it holds (ADR-0033 §4) |

> **This is the last one.** Any further category takes a hue that already exists.

### 2.2 A missing table row becomes a test

`Input`'s defect was **silent**: the table lived in `windows/graph.js`, which defines a Custom Element
and cannot be loaded without a DOM — so nothing could check it. It is extracted into
`editor/graph/palette.js`, DOM-free, and `palette.test.js` requires that **every category declared by
the catalogue has a hue and a glyph**.

---

## 3. Decision: an identity enters a `.px` according to its SCOPE

> **What ADR-0034 forbids is not "an identity", it is a SCENE-scoped identity.**

A `.px` is **project**-scoped. An `ObjectId` names something in **one** scene, while a `.px` serves
several: it is that **scope mismatch** invariant 1 protects, and nothing else. A `ResourceId` names
something in the **project** — exactly the scope of the `.px` that would hold it (ADR-0020).

Applying to the second the reasoning written for the first was a misreading, and its price was
concrete: **swapping an object's sprite from a graph was impossible without JavaScript**, while a
`Text` node carrying an arbitrary string has never raised a question.

### 3.1 `value.resource`

One more literal, beside `Number`, `Boolean` and `Text`:

```
value.resource   params { value: ResourceId | null }   →  data('value', 'resource')
```

- it **resolves nothing**: the Core never reaches storage (ADR-0020), it carries the identity;
- its port outputs `resource`, so `typesCompatible('resource','resource')` links it to
  `Sprite.source` **without a single new rule** — `portTypeOf()` already typed that port from the
  property's declaration;
- it carries the hue of its type (the literal rule, ADR-0033 §4), that is, the purple of pointers: a
  resource IS a pointer.

### 3.2 The drop — amends ADR-0034 §3.7 and ADR-0037 §2.3

| Dropped | On bare canvas | On a node |
|---|---|---|
| **Resource** (non-folder) | creates an already-configured `value.resource` | configures the `value` param of a node that declares one |

**No menu**, unlike a property drop: `Get` or `Set` are two intentions (ADR-0037 §2.4), a resource has
only one — *this value*. A **folder** stays refused: it is not a value.

ADR-0037 §2.3's table therefore gains a row, and it is project-scoped like the other three:

| What is dropped | What enters the `.px` | Scope |
|---|---|---|
| Resource | its `ResourceId`, in a param | project |

---

## 4. What stays refused, and why that is not conservatism

A `property` port — and therefore `Property Reference → Set Property` over a wire — was re-examined
and **stays refused**, for a measurable reason and not out of respect for the previous ADR.

> **Correcting an earlier argument.** It had been written that this model would make the type "a
> function of the topology". That is inaccurate: the dependency would be **one hop**, through a
> declared type variable, which an `array<X>` already does in this grammar. What condemns it is
> elsewhere, and it is stronger.

`Set Property On` types its `value` port from `(component, property)`, read **in the node alone**. On
a wire, that type would become a function of the **topology**: you would have to walk back up the
connection, read the source node's params, and start again on every wire or param change — in the
Core, the validator and the renderer. And the first time a source were itself dynamic, the type would
fall back to `any`: **you would trade a typed, coloured port, refused at gesture time, for a port
with no shape.** That is exactly what the current model buys.

### The four models, compared

| | A — all dropdowns | B — references on wires | C — DnD creates reference nodes | **E + D+ — adopted** |
|---|---|---|---|---|
| Nodes to read `Player.Transform.rotation` | 2 + 1 wire | 2 + 1 wire | 3-4 + wires | **1, no wire** |
| Typing of `value` | exact | 1 hop, **degrades to `any`** as soon as a source is dynamic | exact | exact |
| Refusal at gesture time | yes | no | yes | yes |
| Dropdowns to fill by hand | **three** | none | none | **none, if you drop** |
| A computed target (`Find By Tag`) | yes | yes | yes | **yes — the socket is always there** |
| Complexity added to the Core | none | **high** (`portsOf` needs the graph) | none | none |
| A new concept for a beginner | no | **yes: a pointer** | yes | no |

**What condemns B is not the typing, it is the concept.** "A reference to a property is itself a
value travelling on a wire" is a pointer — the hardest idea in the model, in a visual language aimed
at people who do not program. Unreal Blueprints and Unity Visual Scripting both avoid it: a `Target`
pin, and the property baked into the node's identity. E does the same thing without even the pin,
when the target can be designated.

**D = the params carry the TYPING, drag and drop carries the AUTHORING.** The creator no longer fills
the dropdowns: they drop an Object, a Component or a property, and the node arrives configured
(ADR-0037). The dropdowns remain for the keyboard, for rereading and for correcting — they are no
longer the main path.

That is the model the repository already had; what was missing was **the gesture**, and it was
missing for a reason that had nothing architectural about it: the shell's target resolution queried a
**hidden** window, which claimed every drop. No rule was ever consulted.

---

## 5. Decision: a node's title is its type, always

A `Pointer Button` set to Middle was called `Middle Button` — a node you cannot find in
documentation, in a tutorial or in a search, and whose name no longer said what it did.

> **A node's header is the name of its TYPE, and nothing else. What it is configured with is read
> inside, on the rows where it is changed.**

An intermediate version allowed a configured title as long as "the words that name the node survive"
— `Set Player.Transform.rotation`. That was still wrong, for two reasons you see in use:

- **a value took the place of a type.** `Get Ground`, `Set Sprite.height`, `Middle Button`: the same
  node carried a different name in every graph, and a tutorial could no longer name it. "Add a Set
  Property" has to designate the same node an hour later, and a creator must be able to connect the
  header they read to the menu entry;
- **dotted syntax is code.** `Sprite.height` is a programming expression in a tool that is not one.
  Two fields — `Component: Sprite`, `Property: Height` — say the same thing without asking anything of
  anyone.

The catalogue therefore declares **no `title()` at all**, and a test holds all of its definitions.
`NodeDefinition.identity`, which existed to bound the exception, disappears with it: a rule with no
exception does not need bounding.

> **Amended by ADR-0040 §5 (2026-08-28).** `title` remained declarable in the `NodeDefinition`
> contract, to feed the node's `<title>`. An absolute rule held by discipline ends up being
> negotiated: the mechanism was removed from the contract, from `shapeDependsOnNode()` and from
> `describeNode()`. A node type has a `label` and no other way of saying what it is called, and a test
> walks the catalogue to hold that.

---

## 6. Observable contracts

| Contract | Verifiable by |
|---|---|
| Every declared category has a hue and a glyph | `palette.test.js`, on the real catalogue |
| `Self` and `Get Property On` do not carry the same colour | `categoryHue('References') !== categoryHue('Properties')` |
| `Input` does not carry `Flow`'s colour | the same, and `Input === Events` |
| A literal carries the hue of its type, not of its family | `Values` is absent from the category table |
| A `.px` contains no `ObjectId` | the serialized payload, after a real Object drop |
| A `.px` **may** contain a `ResourceId` | `value.resource`'s param after a drop |
| A resource connects to `Sprite.source` | `typesCompatible(output, portTypeOf(Sprite.schema.source))` |
| No node type can rename itself | the whole catalogue, `nodes.test.js` |
| A named import designates a real export | `tools/check-exports.js`, over `src/` and `tools/` |

---

## 7. Consequences

### Positive

- Colour answers "what is this node?" before the title is read.
- A missing palette row can no longer be silent.
- Swapping a sprite from a graph becomes possible without JavaScript.
- Drag and drop becomes the main path; the dropdowns become the fallback.
- A node keeps its name, so it can be documented and searched for.

### Negative

- Seven hues instead of six: one more to learn, and that is the price of a distinction six could not
  express.
- `value.resource` brings a `ResourceId` into a `.px`. A project that deletes the resource leaves a
  node pointing at nothing — shown in **red** by the control, never rewritten, which is the treatment
  ADR-0034 §3.4 already gives a dead reference.
- The `Scene` category disappears from the vocabulary; the ADRs that name it read with §2 beside
  them.

---

## 8. Rejected alternatives

| Alternative | Why not |
|---|---|
| Keeping `Input` with no hue | The original defect: grey, indistinguishable from `Flow` |
| Giving `Properties` an existing hue | Green is `Text`'s, amber is `boolean`'s: two ideas, one colour |
| A `property` port (model B) | Typing as a function of the topology, degrading to `any` — §4 |
| A separate `Object Reference` node | `property.get` on an `objectref` socket IS that read; a second node would be two mechanisms for one idea |
| Refusing the Resource "since nothing consumes it" | You do not design an architecture from what already exists; the node was what was missing |
| A Get/Set menu when dropping a resource | A resource has one intention; asking would be ceremony |
