// <px-hierarchy> — the scene's objects, as a searchable tree.
//
// It reads the model and nothing else: rows come from `scene.roots()` and
// `object.children`, and there is no parallel tree to keep in step. The only state that
// belongs to this element is which branches are folded and what is in the search box —
// both facts about this window, not about the project.
//
// Two levels of update, deliberately:
//
//   structure — the scene's five structural events rebuild the tree;
//   values    — each row subscribes to its object's `name`, `active`, `visible` and
//               `lock`, so renaming in the Inspector retitles the row on every keystroke
//               without touching the tree at all. That letter-by-letter behaviour is a
//               requirement of the product, not a side effect.
//
// THE GESTURES, and why they are these ones (docs/architecture/EDITOR.md):
//
//   click a row        select — and only select, whatever part of the row was hit
//   double-click a row frame it in the viewport, INCLUDING on the name — a double-click
//                      means the same thing everywhere on the line
//   click the name of
//   a row that was
//   ALREADY selected
//   when the press
//   started            rename in place, after RENAME_DELAY — long enough that the second
//                      click of a double-click cancels it
//   F2                 rename the selected row, immediately and with no delay at all
//   click the magnifier open the search; click it again, Escape, or the cross closes it
//                      AND clears the query — a filter still applied behind a folded
//                      control is a tree that lies about what the scene holds
//
// WHY THE DELAY, AND WHY IT IS NOT A HACK. The previous version had the right rule — only
// a row already selected before the press can rename — and still put a caret in the way,
// because `click` fires on the FIRST click of a double-click too. So framing an object you
// had just selected opened its name for editing on the way past, and the name had to
// swallow `dblclick` to stop the frame, which cost the double-click its meaning on half
// the row. Both symptoms are the same missing fact: at the moment of the first click you
// do not yet know whether a second one is coming. The only way to know is to wait, so this
// waits — once, briefly, and only on a row that was already selected. Every other gesture
// is immediate. F2 is there so nobody who knows what they want has to wait at all.
//
// It is a timer and NOT a blur: a pending rename is cancelled by name, from the events
// that mean "something else happened" (a second click, another press, a new selection, the
// tree being rebuilt). Nothing here depends on focus leaving in the right order.
//
// NOTHING IS REVEALED BY HOVER. Lock, visibility and delete are always drawn; hover only
// strengthens them. A finger has no hover, and these are not decorations. The search is
// behind a control you press, which is not the same thing as behind a hover.
//
// AND HOVER NEVER RESTATES SELECTION. A selected row keeps exactly its selected
// background when you point at it — the shared `.line` primitive declares both states
// together so a second surface cannot be laid over the first (ui/styles.js). The name
// used to take an input well of its own on hover, advertising the click that renamed it;
// that click is a deliberate gesture now, so the well arrives with the edit instead of
// promising it under every pointer that crosses a selected row.

import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForObject } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { searchField } from '../ui/search-field.js';
import { createMenuItems, createObject, deleteObject, reparentObject } from '../commands.js';
import { DropPosition, canDrop, dropPositionAt, dropTarget } from './drop.js';
import { visibleObjects } from './search.js';
import '../ui/window.js';

/**
 * How long a click on a selected name waits to see whether it was half of a double-click.
 *
 * The platform double-click threshold is 500 ms on Windows and macOS both, and there is no
 * way to read it from a browser. Waiting the full 500 would make renaming feel broken;
 * waiting less than the threshold would let a slow double-click rename instead of frame.
 * 400 is the compromise every file explorer lands on, and the reason F2 exists next to it.
 */
const RENAME_DELAY = 400;

/** How far a pointer travels before a press on a row becomes a drag, in CSS pixels. */
const DRAG_THRESHOLD = 4;

export class Hierarchy extends Element {

    static styles = sheet(`
        :host {
            display: block;
            /* One step of the spacing scale per level. Everything the row draws — the
               padding, the guide line — is derived from it, so a change of depth ramp is
               a change of one value. */
            --indent: var(--px-space-3);
        }

        px-window { height: 100%; }

        .tree { padding: var(--px-space-1) 0 var(--px-space-3); }

        .row {
            position: relative;
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            height: var(--px-row);
            padding-left: calc(var(--px-space-1) + var(--depth) * var(--indent));
            padding-right: var(--px-space-1);
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        /* The guide line that says "these are children": one segment per row, drawn under
           the parent's twisty, so consecutive rows read as one continuous stem. */
        .row::before {
            content: '';
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            left: calc(var(--px-space-1) + (var(--depth) - 1) * var(--indent) + var(--px-control) / 2);
            background: var(--px-border-subtle);
        }

        .row[data-depth='0']::before { display: none; }

        /* The hover tint, the selected tint and the rule that the second never doubles the
           first all come from the shared line primitive, which the dropdowns adopt too:
           a row in a list is a row in a list (ui/styles.js). */
        .row.selected .name { color: var(--px-text-strong); }
        .row.hidden .name, .row.hidden .glyph { opacity: 0.4; }
        .row.locked .name { font-style: italic; }

        /* .twisty and .ghost both come from the shared base sheet: 22 wide, --px-hit to a
           finger, and the same quarter turn the Inspector's sections use. It used to be
           --px-hit tall inside a --px-row line, which is 28 in 26 and overflowed the row
           by a pixel at each end. */

        .glyph { color: var(--px-text-dim); }
        .row.selected .glyph { color: var(--px-accent); }

        .name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            outline: none;
            padding: var(--px-space-0) var(--px-space-1);
            border-radius: var(--px-radius-sm);
        }

        /* NO WELL ON HOVER. Renaming is a deliberate gesture now — a pause on the name of
           a selected row, or F2 — so drawing the input surface under every pointer that
           crosses a selected name would advertise something a click no longer does, and
           it laid a second, darker background over the selection tint while doing it. The
           well arrives with the edit, below. */
        .name.editing {
            background: var(--px-surface-input);
            box-shadow: 0 0 0 1px var(--px-accent);
            text-overflow: clip;
            cursor: text;
        }

        .actions { display: flex; flex: 0 0 auto; }

        /* Always drawn, never revealed: hover moves them up one step of emphasis, it does
           not bring them into existence. Emphasis is a text role rather than an opacity,
           so the quietest state is still a measured 4.6:1. */
        .actions .ghost { color: var(--px-text-dim); }
        .row:hover .actions .ghost { color: var(--px-text-muted); }
        .row.selected .actions .ghost { color: var(--px-text-muted); }
        .row .actions .ghost:hover { color: var(--px-text-strong); }
        /* Colour only: the accent pill a header tool gets would be four filled boxes per
           row here, which is noise rather than state. */
        .row .actions .ghost.on { color: var(--px-accent); background: none; }
        .row .actions .ghost.on:hover { background: var(--px-surface-hover); }
        .row .actions .remove:hover { color: var(--px-danger); }

        /* ── dragging ───────────────────────────────────────────────────── */

        /* The row being carried stays in place and goes quiet: a list that reflows under
           the pointer is a list you cannot aim at. */
        .row.dragging { opacity: 0.4; }

        /* Nesting tints the whole row, reordering draws a line at the edge it will land
           on. Two different answers, two different marks — an indicator that looked the
           same for both would make "into" and "after" a guess. */
        .row.into { box-shadow: inset 0 0 0 1px var(--px-accent); border-radius: var(--px-radius-sm); }

        .row.before::after,
        .row.after::after {
            content: '';
            position: absolute;
            left: calc(var(--px-space-1) + var(--depth) * var(--indent));
            right: var(--px-space-1);
            height: 2px;
            background: var(--px-accent);
            pointer-events: none;
        }

        .row.before::after { top: -1px; }
        .row.after::after { bottom: -1px; }

        /* Dropping past the last row appends to the top level, and says so. */
        .tree.append { box-shadow: inset 0 -2px 0 var(--px-accent); }

        .empty {
            padding: var(--px-space-4) var(--px-space-3);
            color: var(--px-text-dim);
            line-height: var(--px-leading);
        }
    `);

    #scene = null;
    #selection = null;
    #viewport = null;

    #collapsed = new globalThis.Set();
    // Rows survive a re-render, keyed by object id. That is not a cache for speed: a
    // twisty that is a NEW element every time can never animate, because there is no
    // previous state for the rotation to come from. Keeping the row means the class flip
    // is a transition, and it also means a rebuild no longer throws away an in-progress
    // rename or the row's subscriptions.
    #rows = new globalThis.Map();
    #query = '';
    #tree = null;
    #search = null;
    #rename = null;
    // The press that may become a drag, then the drag itself. One field, because a row is
    // either being pressed or being carried, never both.
    #drag = null;

    /**
     * Point the window at the scene it lists.
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene
     * @param {object} context.selection - The Editor selection
     * @param {object} context.viewport - The viewport, for framing on double-click
     * @returns {Hierarchy} This element
     */
    bind({ scene, selection, viewport }) {
        this.#scene = scene;
        this.#selection = selection;
        this.#viewport = viewport;
        return this;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#build();

        const structural = [
            'added', 'removed',
            'child:added', 'child:removed',
            'component:added', 'component:removed',
            // A root that changed rank changes this tree and nothing else's (ADR-0018).
            'roots:reordered'
        ];
        for (const event of structural) {
            this.track(this.#scene.on(event, () => this.#renderTree()));
        }
        this.track(this.#selection.observe(() => {
            // Selecting something else is one of the things that means "not a rename".
            this.#cancelRename();
            this.#applySelection();
        }));

        // F2 IS THE ESCAPE HATCH FROM THE DELAY. Everything the pause buys you, this gives
        // you at once — which is the deal every file explorer makes, and the reason the
        // pause is acceptable at all. It lives here rather than in editor.js because
        // renaming is the Hierarchy's gesture, not the shell's.
        const onKey = event => {
            if (event.key !== 'F2' || event.ctrlKey || event.metaKey || event.altKey) return;
            const object = this.#selection.object;
            const entry = object ? this.#rows.get(object.id) : null;
            if (!entry) return;
            event.preventDefault();
            this.#cancelRename();
            this.#beginRename(object, entry.name);
        };
        globalThis.addEventListener('keydown', onKey);
        this.track(() => globalThis.removeEventListener('keydown', onKey));

        this.#renderTree();
    }

    #build() {
        this.#tree = el('div', { class: 'tree' });

        this.#search = searchField({
            placeholder: 'Search objects',
            label: 'objects',
            onQuery: query => {
                this.#query = query;
                this.#renderTree();
            }
        });

        const create = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'Create object',
            'aria-label': 'Create object',
            onclick: () => this.#openCreateMenu(create)
        }, icon('plus'));

        this.shadowRoot.replaceChildren(el('px-window', { label: 'Hierarchy', icon: 'hierarchy' },
            el('div', { class: 'actions', slot: 'actions' }, this.#search.toggle, create),
            this.#search.bar,
            this.#tree
        ));
    }

    #renderTree() {
        this.#cancelRename();
        // A tree that changed shape underneath a drag — a collaborator's operation, an
        // undo — invalidates every rank the drag was aiming at.
        this.#cancelDrag();

        const roots = this.#scene.roots();
        const visible = visibleObjects(roots, this.#query);

        if (visible && visible.size === 0) {
            this.#discardRows(new globalThis.Set());
            fill(this.#tree, el('div', {
                class: 'empty',
                textContent: `No object matches “${this.#query.trim()}”.`
            }));
            return;
        }

        if (roots.length === 0) {
            this.#discardRows(new globalThis.Set());
            fill(this.#tree, el('div', {
                class: 'empty',
                textContent: 'No objects yet. Use +, or drag a tool in from the viewport.'
            }));
            return;
        }

        const nodes = [];
        for (const object of roots) this.#collect(nodes, object, 0, visible);

        this.#discardRows(new globalThis.Set(nodes.map(row => row.dataset.id)));
        reconcile(this.#tree, nodes);
        this.#applySelection();
    }

    #collect(nodes, object, depth, visible) {
        if (visible && !visible.has(object)) return;

        const children = visible
            ? object.children.filter(child => visible.has(child))
            : object.children;

        // While searching every surviving branch is open: a result the creator cannot see
        // because its parent happened to be folded is a result they will not believe in.
        const open = Boolean(visible) || !this.#collapsed.has(object.id);

        nodes.push(this.#row(object, depth, children.length > 0, open, Boolean(visible)));
        if (open) {
            for (const child of children) this.#collect(nodes, child, depth + 1, visible);
        }
    }

    /** The row for an object: the one that already exists, or a new one. */
    #row(object, depth, hasChildren, open, searching) {
        const existing = this.#rows.get(object.id);
        const entry = existing?.object === object ? existing : this.#buildRow(object);

        // Depth is a custom property rather than a computed padding, so the row's own
        // rules derive both the indent and the guide line from it and no arithmetic
        // leaks into JavaScript.
        entry.row.style.setProperty('--depth', globalThis.String(depth));
        entry.row.dataset.depth = globalThis.String(depth);

        entry.twisty.classList.toggle('leaf', !hasChildren || searching);
        entry.twisty.classList.toggle('open', open);

        this.#rows.set(object.id, entry);
        return entry.row;
    }

    #buildRow(object) {
        // The row selects on pointerdown, so a control inside it has to stop that event
        // and not merely the click: folding a branch or hiding an object is not a way of
        // saying "select this".
        const twisty = el('span', {
            class: 'ghost twisty',
            onpointerdown: event => event.stopPropagation(),
            onclick: () => this.#toggle(object)
        }, icon('chevron'));

        const name = el('span', { class: 'name', textContent: object.name || '(unnamed)' });
        const glyph = el('span', { class: 'glyph' }, icon(iconForObject(object)));

        const lock = this.#stateButton(object, 'lock', {
            on: () => object.lock,
            title: () => (object.lock ? 'Unlock' : 'Lock — ignored by the viewport'),
            glyph: () => (object.lock ? 'lock' : 'unlock')
        });

        const visibility = this.#stateButton(object, 'visible', {
            on: () => !object.visible,
            title: () => (object.visible ? 'Hide' : 'Show'),
            glyph: () => (object.visible ? 'eye' : 'eye-off')
        });

        const remove = el('button', {
            class: 'ghost remove',
            type: 'button',
            title: 'Delete',
            'aria-label': `Delete ${object.name}`,
            onpointerdown: event => event.stopPropagation(),
            onclick: () => this.#delete(object)
        }, icon('trash'));

        // WAS THIS ROW ALREADY SELECTED WHEN THE PRESS STARTED? That single bit is half of
        // the rename gesture, and it has to be read here: `pointerdown` selects, and
        // `click` fires afterwards, so asking the selection at click time always answers
        // "yes" and the first click on a name dropped a caret nobody asked for. The other
        // half is the delay — see the header.
        let wasSelected = false;

        const row = el('div', {
            class: 'row line',
            dataset: { id: object.id },
            onpointerdown: event => {
                this.#cancelRename();
                wasSelected = this.#selection.has(object);
                this.#selection.set(object);
                this.#armDrag(event, object, row);
            },
            onpointermove: event => this.#dragMove(event),
            onpointerup: event => this.#dragDrop(event),
            onpointercancel: () => this.#cancelDrag(),
            ondblclick: () => {
                // Cancels the pending rename the first click of this very double-click
                // armed, then does what a double-click means everywhere on the row.
                this.#cancelRename();
                this.#viewport?.focusOn(object);
            }
        }, twisty, glyph, name, el('div', { class: 'actions' }, lock, visibility, remove));

        name.addEventListener('click', () => {
            if (wasSelected) this.#scheduleRename(object, name);
        });

        // Only while editing: a double-click in a name being typed into selects a word,
        // and must not also frame the object. Outside an edit the event belongs to the row.
        name.addEventListener('dblclick', event => {
            if (name.classList.contains('editing')) event.stopPropagation();
        });

        const group = `row:${object.id}`;
        this.track(object.observe('name', change => {
            if (name.classList.contains('editing')) return;
            name.textContent = change.value || '(unnamed)';
        }), group);

        const entry = { object, row, twisty, name };
        this.#applyState(entry);

        for (const prop of ['active', 'visible', 'lock']) {
            this.track(object.observe(prop, () => this.#applyState(entry)), group);
        }

        return entry;
    }

    /** Let go of every row whose object is no longer on screen. */
    #discardRows(keep) {
        for (const id of [...this.#rows.keys()]) {
            if (keep.has(id)) continue;
            this.release(`row:${id}`);
            this.#rows.delete(id);
        }
    }

    #stateButton(object, prop, { on, title, glyph }) {
        const button = el('button', {
            class: 'ghost',
            type: 'button',
            onpointerdown: event => event.stopPropagation(),
            onclick: () => object.setProperty(prop, !object[prop])
        }, icon(glyph()));

        const sync = () => {
            button.title = title();
            button.setAttribute('aria-label', title());
            button.classList.toggle('on', on());
            fill(button, icon(glyph()));
        };
        sync();
        this.track(object.observe(prop, sync), `row:${object.id}`);
        return button;
    }

    #applyState({ object, row }) {
        row.classList.toggle('hidden', !object.visible || !object.active);
        row.classList.toggle('locked', object.lock);
    }

    /**
     * Arm a rename, unless a second click arrives first.
     *
     * The whole of the delay is here, and it is a timer with a name rather than a state
     * machine: something either cancels it before it fires, or it renames.
     *
     * @param {object} object - The object whose name was clicked
     * @param {HTMLElement} name - The row's name element
     */
    #scheduleRename(object, name) {
        if (name.classList.contains('editing')) return;
        this.#cancelRename();
        this.#rename = globalThis.setTimeout(() => {
            this.#rename = null;
            // Still the selected object by the time the pause is over, or the click that
            // armed this has been overtaken by something else.
            if (this.#selection.has(object)) this.#beginRename(object, name);
        }, RENAME_DELAY);
    }

    /** Drop a rename that has not started yet. Never touches an edit already open. */
    #cancelRename() {
        if (this.#rename === null) return;
        globalThis.clearTimeout(this.#rename);
        this.#rename = null;
    }

    #beginRename(object, name) {
        if (name.classList.contains('editing')) return;

        const original = object.name;
        name.classList.add('editing');
        name.contentEditable = 'plaintext-only';
        // Not every engine accepts plaintext-only; falling back keeps renaming working
        // rather than leaving a row that looks editable and is not.
        if (!name.isContentEditable) name.contentEditable = 'true';
        name.textContent = original;
        name.focus();
        globalThis.getSelection()?.selectAllChildren(name);

        // Leaving edit mode is its own step, called directly by whatever ended the edit —
        // not a side effect of blur. blur() only fires when the element actually held
        // focus, and a row that keeps `editing` because focus went somewhere unexpected is
        // a row that has stopped answering to the model.
        const finish = () => {
            if (!name.classList.contains('editing')) return;
            name.classList.remove('editing');
            name.contentEditable = 'false';
            name.textContent = object.name || '(unnamed)';
        };

        // Written on every keystroke, like the Inspector: one model, one behaviour,
        // whichever view the creator happens to be typing into.
        name.oninput = () => object.setProperty('name', name.textContent.trim());
        name.onblur = finish;
        name.onkeydown = event => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                name.blur();
                finish();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                object.setProperty('name', original);
                name.blur();
                finish();
            }
        };
    }

    #toggle(object) {
        if (this.#collapsed.has(object.id)) this.#collapsed.delete(object.id);
        else this.#collapsed.add(object.id);
        // The row — and with it the twisty — is reused by the render below, so flipping
        // `open` is a class change on a live element and the chevron turns. Nothing else
        // animates: the rows that appear and disappear do so at once, because a list that
        // slides is a list you wait for (ui/styles.js).
        this.#renderTree();
    }

    #applySelection() {
        for (const { object, row } of this.#rows.values()) {
            row.classList.toggle('selected', this.#selection.has(object));
        }
    }

    #openCreateMenu(anchor) {
        // No filter field on three entries: the search is what makes a long, categorised
        // list usable, and on a short one it is a control to skip past.
        openMenu(anchor, createMenuItems(), kind => {
            const centre = this.#viewport?.worldCentre() ?? { x: 0, y: 0 };
            this.#selection.set(createObject(this.#scene, {
                kind,
                x: Math.round(centre.x),
                y: Math.round(centre.y)
            }));
        }, { label: 'objects' });
    }

    #delete(object) {
        if (this.#selection.has(object)) this.#selection.clear();
        deleteObject(this.#scene, object);
    }

    // --- dragging a row -----------------------------------------------------------
    //
    // A drop is `REPARENT { parent, index }` and nothing else: reordering, nesting and
    // unnesting are the same mutation, so they are the same operation (ADR-0019). The
    // geometry — which row, which third of it, what rank that is — lives in drop.js and is
    // tested there; what is left here is the pointer, the indicator, and the submit.
    //
    // Pointer events with capture, like the toolbar's drag and the splitter's: the row
    // keeps receiving moves even when the pointer leaves it, which is the whole point,
    // and the rows under it are found by their boxes rather than by hit testing through a
    // shadow root.

    #armDrag(event, object, row) {
        if (event.button > 0) return;
        if (this.#query.trim() !== '') return;      // the tree is filtered, so ranks are not what they look like
        if (row.querySelector('.name.editing')) return;

        this.#drag = {
            object,
            row,
            pointerId: event.pointerId,
            from: { x: event.clientX, y: event.clientY },
            started: false,
            drop: null
        };
    }

    #dragMove(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            const travelled = Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y);
            if (travelled < DRAG_THRESHOLD) return;

            drag.started = true;
            capture(drag.row, drag.pointerId);
            drag.row.classList.add('dragging');
        }

        // Selecting text while carrying a row is never what was meant.
        event.preventDefault();
        this.#markDrop(this.#resolveDrop(event.clientY));
    }

    #dragDrop(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        const drop = drag.started ? this.#resolveDrop(event.clientY) : null;
        const object = drag.object;
        this.#cancelDrag();

        if (!drop) return;

        reparentObject(this.#scene, object, drop.parent, drop.index, {
            // A parent that shears cannot hold the object's world placement in a
            // position/rotation/scale triple. The system says so instead of deforming it
            // quietly (ADR-0012, ADR-0022).
            onReport: report => console.warn(`[editor] ${report.message}`)
        });
    }

    #cancelDrag() {
        const drag = this.#drag;
        this.#drag = null;
        if (!drag) return;

        if (drag.started) {
            release(drag.row, drag.pointerId);
            drag.row.classList.remove('dragging');
        }
        this.#markDrop(null);
    }

    /**
     * What the pointer is currently over, as a drop.
     * @param {number} clientY - The pointer's vertical position
     * @returns {object|null} `{ parent, index, target, position }`, or null when refused
     */
    #resolveDrop(clientY) {
        const drag = this.#drag;
        if (!drag) return null;

        const entry = this.#rowAt(clientY);
        // Past the last row: the empty space below the tree is the top level, which is the
        // only way to unnest an object with a single gesture.
        const target = entry?.object ?? null;
        const position = entry
            ? dropPositionAt(clientY, entry.row.getBoundingClientRect())
            : DropPosition.INTO;

        if (!canDrop(drag.object, target)) return null;

        const drop = dropTarget(this.#scene, drag.object, target, position);
        return drop ? { ...drop, target, position } : null;
    }

    /** The row whose box holds a vertical position, or null. */
    #rowAt(clientY) {
        for (const entry of this.#rows.values()) {
            const box = entry.row.getBoundingClientRect();
            if (clientY >= box.top && clientY < box.bottom) return entry;
        }
        return null;
    }

    /** Draw where the drop would land, and nowhere else. */
    #markDrop(drop) {
        for (const { row } of this.#rows.values()) {
            row.classList.remove('before', 'after', 'into');
        }
        this.#tree?.classList.toggle('append', Boolean(drop) && drop.target === null);

        if (!drop || !drop.target) return;
        this.#rows.get(drop.target.id)?.row.classList.add(drop.position);
    }
}

/**
 * Bring a parent's children into line with a list, moving what is already there.
 *
 * `replaceChildren` would be shorter and would defeat the point: it detaches every row,
 * and a detached element's transition does not survive being put back. Here a row that is
 * already in the right place is not touched at all, which is what lets the twisty of the
 * branch you just folded keep its transition while its children come and go around it.
 *
 * @param {HTMLElement} parent - The container
 * @param {HTMLElement[]} nodes - The children it should end up with, in order
 */
function reconcile(parent, nodes) {
    for (let index = 0; index < nodes.length; index++) {
        const current = parent.childNodes[index];
        if (current !== nodes[index]) parent.insertBefore(nodes[index], current ?? null);
    }
    while (parent.childNodes.length > nodes.length) parent.lastChild.remove();
}

customElements.define('px-hierarchy', Hierarchy);

/**
 * Take pointer capture, tolerating a pointer that is already gone.
 *
 * Capture is a convenience: it keeps the moves coming when the pointer leaves the element
 * it started on. It is not what makes the gesture work, so a pointer the platform no
 * longer knows about must not throw its way out of the handler and abandon the drop.
 *
 * @param {HTMLElement} element - The element to capture on
 * @param {number} pointerId - The pointer
 */
function capture(element, pointerId) {
    try {
        element.setPointerCapture(pointerId);
    } catch {
        // Nothing to capture. The drag still resolves from the events it does receive.
    }
}

/**
 * Give pointer capture back, if it was ever taken.
 * @param {HTMLElement} element - The element that captured
 * @param {number} pointerId - The pointer
 */
function release(element, pointerId) {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
}
