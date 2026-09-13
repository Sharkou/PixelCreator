# ADR-0006 — A modular Editor built on native Web Components

- **Status:** **accepted** (2026-08-12)
- **Decides:** how to make the Editor's UI modular without a framework

---

## Observed context

### What works today and must survive

The Editor's real-time synchronization rests on three simple mechanisms:

1. **Binding by CSS class** — each field carries `class="<objectId>-<prop>"` (or
   `<objectId>-<Component>.<prop>`).
2. **Global resolution** — `document.getElementsByClassName(obj.id + '-' + prop)` returns every
   view of that property, wherever it is.
3. **A focus guard** — `if (el[i] !== document.activeElement)`: the field being typed into is
   never rewritten.

Verified: typing `P`, `l`, `a`, `y` in the Inspector updates the Inspector field and the
Hierarchy's `contenteditable` at the same time, letter by letter.

**There is a single source of truth — the `Object`.** The DOM is only a projection. That is
simple and correct. **A separate store must not be introduced.**

### The real problem

It is not the use of the DOM, it is the **structure of the UI project**:

- `index.html` is 700 lines and holds the IDE's entire skeleton;
- the modules latch onto fixed `id`s at load time:
  `document.getElementById('play').addEventListener(...)`;
- `sync.js` targets `#sync`, commented out in the HTML — the module would throw; it simply is not
  imported;
- the windows (`Hierarchy`, `Properties`, `Project`) receive a container id and assume all their
  markup already exists;
- 30 CSS files in a global namespace;
- **`editor/windows/window.js` contains only `// TODO: Implement base window class`.**

The consequence: **adding a window requires editing `index.html`, `app.js`, a CSS file and the
module.** That is the modularity defect.

---

## Decision

**Native Web Components** as Editor primitives. No React, Vue, Angular or Svelte.

### Primitives

```
<px-window>    <px-panel>   <px-split>   <px-tabs>
<px-toolbar>   <px-tree>    <px-list>    <px-property>
<px-viewport>  <px-modal>   <px-menu>
```

### Windows built on them

```
<px-hierarchy>  <px-inspector>  <px-assets>   <px-scene>
<px-graph>      <px-players>    <px-console>
```

Each window is **one file** carrying its markup, its styles (Shadow DOM) and its lifecycle.
Adding a window = writing that file and registering it with the layout. `index.html` shrinks to a
mount point.

### Binding becomes scoped

This is the delicate point. **The Shadow DOM breaks `document.getElementsByClassName`**: an
encapsulated field becomes invisible to the global query, and real-time synchronization would
disappear — silently.

The replacement, with identical observable behaviour:

```js
// <px-property> subscribes to the Change of the property it displays
connectedCallback() {
    this.unsubscribe = properties.observe(this.target, this.prop, change => {
        if (this.input !== this.shadowRoot.activeElement) {   // the guard is kept
            this.input.value = change.value;
        }
    });
}
disconnectedCallback() { this.unsubscribe(); }
```

What it preserves: letter-by-letter editing, the single source of truth, the focus guard. What it
adds: unsubscription (nonexistent today — listeners accumulate), and an end to global DOM queries
on every keystroke.

**A mandatory migration order:** migrate the binding **before** encapsulating in Shadow DOM. The
other way round breaks synchronization with no visible error (risk R2).

---

## Why Web Components and not a framework

| Criterion | Web Components | A UI framework |
|---|---|---|
| Runtime dependencies | 0 | 1 + its ecosystem |
| A build required | no | yes, in practice |
| Style encapsulation | native Shadow DOM | by convention/tooling |
| Reactive model | **the one that already exists** (Property System) | a second, competing model |
| Continuity with Legacy | direct (it is DOM) | a rewrite |
| Mixing Canvas + DOM | natural | friction |

The decisive point: Pixel Creator **already has a reactive system that works** — the Property
System. A framework would bring a second one, and the two would have to coexist. That is a net
cost with no benefit.

---

## Consequences

### Positive

- One window = one file, openable on its own in a test page.
- Styles stop leaking between panels.
- Unsubscription becomes possible (the current memory leak is fixed).
- No dependency added, no build imposed.

### Negative

- **The Shadow DOM complicates debugging** and rules out global selectors — including the
  convenient ones used today.
- Drag and drop between panels crosses Shadow DOM boundaries: to be checked early (the Hierarchy,
  the Inspector and the Graph all exchange by drag and drop).
- Font Awesome and the fonts are loaded globally: their styles do not enter the Shadow DOM. We
  will have to either adopt adopted stylesheets (`adoptedStyleSheets`) or give up the Shadow DOM
  on some components.
- Risk R10: 700 lines of HTML can become 30 equally coupled components. The safeguard: **every
  component must open on its own in a test page.**

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keep the monolithic HTML** | It is the problem to solve. |
| **Templates + JS classes, without Custom Elements** | It helps a little, but it solves neither the lifecycle, nor style encapsulation, nor declarative registration. |
| **React / Vue / Svelte** | A heavy dependency, a mandatory build, a second reactive system competing with the Property System. Ruled out by the vision. |
| **Lit / Stencil** (thin layers) | More reasonable, but it adds a dependency for a marginal benefit over ~10 primitives. To reconsider if native Custom Elements prove too verbose. |
| **A centralized store (Redux-like)** | It would introduce a second source of truth alongside the `Object`. Exactly what Legacy rightly avoids. |
