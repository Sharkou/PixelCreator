# ADR-0031 — An authored value lives on the instance, a declaration lives on the type, and changing the type does not destroy what a creator wrote

- **Status:** **accepted** (2026-08-18)
- **Depends on:** ADR-0003 (Property System), ADR-0007 (Inspector schema), ADR-0008 (Operations), ADR-0011 (authority), ADR-0016 (Component definition), ADR-0021 (Component identity), ADR-0023 (property types), ADR-0024 (Undo/Redo), ADR-0026 (`.px` = one resource), ADR-0027 (the graph model), ADR-0030 (references and ranks)
- **Amends:** ADR-0023 (`enum` and `array` had no configuration), ADR-0027 (a port had no instance value)

## Observed context

A headless audit of the lifecycles the Editor claims to support (resources, `.px`, descriptors)
passed on **everything** but three points — and those three are not bugs, they are the three places
where **a decision is missing**:

| Measured finding | What is missing |
|---|---|
| `fieldFor('x', { type: 'enum' })` → `readonly` | an `enum` declared by a creator has **nowhere** to put its options |
| `fieldFor('x', { type: 'array' })` → `readonly` | the same for a list's elements |
| `graph.addNode({ type: 'math.add' }).params` → `{}`, `ports.inputs[].default` → `0` | a port carries the **type's** default, and the instance has nowhere to write another one |
| a property added to an already-attached `.px`: `instance.speed` → `undefined` | nothing says what a schema change does to live instances |

All three ask **one** question, and that is why they are in one ADR:

> **Where does a value a creator wrote live, when what it configures belongs to a type — and the type
> can change?**

## The constraint that decides: multiplayer

`docs/PROJECT.md` §3.2: the server runs the same `Scene` and the same Core. That is not a distant
intention, it is what **eliminates** half the possible answers:

- an authored value must be **serializable** — otherwise it does not cross the network;
- it must change through an **Operation** — otherwise it does not replicate and does not undo
  (ADR-0008, ADR-0024);
- its resolution must be **deterministic and pure** — the same graph, the same inputs, the same
  state, on client and server alike (ADR-0011);
- none of that may require a DOM (ADR-0006).

Any solution that keeps a value "in the control" or "in the panel" is therefore dead before it is
written. That is the filter applied to the three sections below.

## Decision

### 1. A port has an instance value, beside the params — amends ADR-0027

**SETTLED.** A node gains **one** field, symmetric with `params`:

```js
{ id, type, x, y, params: {…}, inputs: { a: 3 } }
```

`inputs` maps an **input port identifier** to the value that port takes **when nothing is wired to
it**.

**The priority, in this order, and there is no other:**

```
a connection  >  node.inputs[port]  >  the port.default declared by the type
```

It is the order from most specific to most general, and it is the only one that makes all three
useful: a connection is an explicit, immediate choice; an instance value is an explicit, lasting
choice; a type default is what the catalogue promises a node nobody has touched.

**Resolved in ONE place**, `defaultOf()` in `runtime/scripting/interpreter.js` — the function that
already answers "what is an unconnected input worth". It consults `node.inputs` before the port.
There is no second path, and therefore no way for the Editor and the Runtime to answer differently.

**Why not inside `params`.** `params` is what the TYPE declares (`definition.params`); the inputs are
what the type declares as PORTS. Mixing them would mean that a type gaining a param named like a port
would silently overwrite a value, and that a `Set Property` — which has a `property` param **and** a
`value` port — would no longer have two namespaces.

**Why not a "Number" node wired in instead.** That is what had to be done until now, and it is the
reason for this decision: three literal nodes to add two constants is a graph describing its own
plumbing.

**What it costs:** nothing new. `setInput()` submits a `SET_PROPERTY` on `inputs`, exactly as
`setParam()` does on `params` — so replication, inversion and history are already written.
Serialization writes `inputs` only when it is non-empty, so an existing graph does not change by a
byte.

**An instance value on a CONNECTED port is kept, not erased.** Unplugging a wire gives back the
value that was there before — which is what a creator expects, and what makes plugging and
unplugging non-destructive. The Editor shows it greyed while a connection masks it.

### 2. `Choice`: the options live in the descriptor — amends ADR-0023

**SETTLED.** An `enum` property declared by a creator carries its options **in its own descriptor**,
under `values` — the field ADR-0007 already reads for components written in JavaScript:

```js
properties: {
  color: { id: 'p_1', type: 'enum', values: ['red', 'green', 'blue'], default: 'red' }
}
```

**No resource, no dedicated structure, and that is the part worth defending.** A shareable "Enum
resource" is seductive and wrong here: it adds an identity, a lifecycle, a resolution, a possible
broken reference and a question of ownership — for a list of three words belonging to one property of
one Component. The day two Components have to share an enumeration, it will be a resource, and this
decision does not prevent it: `values` will become a reference, which is exactly the move ADR-0030
§1 made for `resource`.

| Question | Answer |
|---|---|
| **An option's identity** | **None.** An option IS its value. It is what is stored on the instance, what is serialized and what a node compares. Adding an id would require a mapping table and a migration on every rename, for no gain: renaming an option **is** changing the value, and §4 says what that does to instances |
| **Add / remove / reorder** | `setPropertyField(id, 'values', [...])` — a `SET_PROPERTY` on the reactive descriptor, therefore replicable, invertible, one history entry per typing session (ADR-0027 §renaming) |
| **Default value** | The first option, when the chosen one disappears. An `enum` whose default is not among its options is an invalid value in ADR-0023's sense |
| **Serialization** | `values` is an array of strings in the `.px` payload. Already JSON |
| **Zero options** | Stays `readonly`, **and that is correct**: a choice with no choices is not a control. The Inspector says so instead of drawing an empty list |

### 3. `List`: homogeneous, typed by declaration — amends ADR-0023

**SETTLED.** An `array` declares **the type of its elements**:

```js
properties: { waypoints: { id: 'p_2', type: 'array', of: 'number', default: [] } }
```

**Homogeneous, and refusing the heterogeneous is the decision.** A heterogeneous list has no possible
control (which field do you draw?), no possible validation, and no possible port in a graph —
`typesCompatible()` would have nothing to compare. A creator who wants different things together
wants a Component, not a list.

`of` takes any `PropertyType` **except `array`**: a list of lists is a structure, and a structure is
the question ADR-0023 leaves open, not this one.

| Question | Answer |
|---|---|
| **Default** | `[]`. Never `null`: an empty list is a list, and the absence of a list is not a state a creator can want |
| **Add / remove / reorder** | On the value, through a `setProperty` of the whole array — a list is **a value**, not a structural collection. The structural Operations (ADR-0019) are for things that have an identity; a list element has none |
| **Editing** | One row per element, with `of`'s control — the same derivation as everywhere else, so nothing new to write per type |
| **Serialization** | A JSON array of already-serializable values, since `of` is a `PropertyType` |
| **`of` absent** | `any`, and the list is read-only: you can see what it holds, not edit it. Honest rather than guessed |

### 4. Changing a `.px`'s schema: instances **reconcile**, they are not replaced

**SETTLED.** It is the heaviest of the four decisions.

What used to happen: `definitions.install()` re-registered the class, and already-attached instances
kept the old one — so an added property was invisible until the scene was reloaded. What must NOT
happen: recreating the components, which would erase every value a creator had set.

**The reconciliation, property by property:**

| Case | What happens to the instance | Why |
|---|---|---|
| **A property is added** | it takes the declared default value | that is what a fresh instance would have; there is no other candidate value |
| **A property is removed** | the value is **removed** from the instance | keeping it would make data nothing reads, that serialization would write and no panel would show |
| **A property is renamed** | the value **follows the name**, because the identity follows | a descriptor carries a stable `id` (ADR-0027): renaming is not delete-then-add, and the model already knows it |
| **The type changes** | the value is reset to the new type's default | `setPropertyType()` already does exactly that on the descriptor (ADR-0027); the instance follows the same rule rather than a second one |
| **A kept property's local value** | **untouched** | that is the whole point: changing a declaration must not cost the settings of thirty objects |

**It is AUTOMATIC, and not versioned.** A `.px`'s schema has no version because it has no published
history: it is a file of the open project, edited by the person using it, in the same session. A
versioned migration exists to carry data you no longer control across a format; here both sides are
at hand. What would be wrong is asking for a click: "your Component has changed, do you want to
update the objects?" is a question whose answer is always yes.

**It goes through Operations.** Every value added or removed is a `SET_PROPERTY` on the component,
`origin: EDITOR`, grouped under **one** `batch` — so one `Ctrl Z` undoes the entire reconciliation,
it replicates, and a server replaying the session reaches the same state. That is what makes it
compatible with ADR-0011 rather than a wild write.

**A `.px` type is ONE class for the whole session, updated in place.**

This is the part the first draft of this ADR skipped, and the implementation found it: reconciling
the *values* is not enough. An instance carries its class, and `componentSchema(instance)` reads
`instance.constructor.schema` — so re-registering a **new** class left every instance declaring the
old schema. The Inspector showed no row, even though the value had just been written.

The two possible outcomes, and why only one holds:

| Outcome | Verdict |
|---|---|
| Replace the instance with a fresh one and copy the values across | It changes the component's identity, its rank in the collection (ADR-0018) and breaks any reference held elsewhere |
| **Keep the class, update its schema in place** | A type's identity IS its ResourceId (ADR-0021): two classes for one type were already the anomaly |

So the installer holds **one live schema record per type**, and a reinstall **mutates** it instead of
replacing it. The constructor generated by `defineComponent()` iterates that record on every
construction, and `static schema` points at it — the same reference, so old and new instances read
the same thing, by construction rather than by synchronization.

**The Core does not change by a line.** It is the Project layer that decides a type has one class for
the session, which is exactly the kind of decision ADR-0016 leaves to it.

**Nodes referencing a deleted property are not rewritten**, and ADR-0027 already settled that:
`validateGraph()` returns `MISSING_PROPERTY`, the window marks the node, the interpreter throws a
structured `GraphError`. A reconciliation that unplugged nodes would mean undoing a property deletion
would not give the graph back.

### 5. What all this preserves for multiplayer

Each of the four decisions produces **JSON data changed by Operations**:

- `node.inputs`: serialized with the node, written by `SET_PROPERTY`;
- `values` and `of`: in the `.px` payload, written by `SET_PROPERTY`;
- the reconciliation: a series of `SET_PROPERTY`s under one batch.

Nothing introduces live state outside the model, nothing depends on the order in which a window was
opened, and nothing requires a browser. The server that will run `advance()` on the same `Scene` will
read the same values through the same `defaultOf()`.

## What this ADR does not decide

- **Structures** (an `object` type with named fields): ADR-0023 leaves them open and §3 deliberately
  stops short of them.
- **Sharing an enumeration between two Components** (§2): it will be a resource, the day two
  Components ask for it.
- **The network protocol itself**: nothing here writes a line of it, and that is deliberate.
- **Migrating a saved project to a future format**: §4 handles a live session, not a file from
  another version.

## Consequences

### Positive

- An `Add` adds without three literal nodes around it.
- `Choice` and `List` stop being menu entries that lead nowhere.
- Declaring a property on a `.px` makes it appear on the objects that already carry it, without
  losing a single setting.
- All four go through the same path as everything else: Operation, history, replication.

### Negative

- The node format gains a field. Bounded: omitted when empty, and therefore invisible to a graph that
  has none.
- The reconciliation writes into the scene when a `.px` changes, and therefore marks the project as
  modified. Correct — it is — but it is an effect a creator will see without having asked for it
  explicitly.
- A homogeneous list refuses a case someone will eventually want. Accepted (§3).

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A port value inside `params`** | A type gaining a param named like a port silently overwrites a value |
| **A port default modified on the TYPE** | The catalogue is shared: setting `a = 3` on one `Add` would change them all |
| **Enum options in a resource** | An identity, a lifecycle and a breakable reference for three words |
| **Enum options with an id per option** | A mapping table and a migration per rename, for no gain |
| **A heterogeneous list** | No control, no validation, no possible port |
| **A versioned migration of the `.px` schema** | A format to carry data across, when you control both sides |
| **Recreating the components on a schema change** | It erases every value that was set, which is exactly what the migration exists to avoid |
| **A new class per reinstall** | Existing instances then declare the old schema: the value is written and no panel shows it |
| **Asking for confirmation before reconciling** | A question whose answer is always yes |
