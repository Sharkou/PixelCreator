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
//   click a row        select
//   double-click a row frame it in the viewport — never rename, which is what Legacy
//                      already got right by stopping the event on the name
//   click the name of
//   an already selected
//   row                rename in place, Enter to keep, Escape to put it back
//   click the magnifier open the search; click it again, Escape, or the cross closes it
//                      AND clears the query — a filter still applied behind a folded
//                      control is a tree that lies about what the scene holds
//
// NOTHING IS REVEALED BY HOVER. Lock, visibility and delete are always drawn; hover only
// strengthens them. A finger has no hover, and these are not decorations. The search is
// behind a control you press, which is not the same thing as behind a hover.

import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForObject } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { OBJECT_KINDS, createObject, deleteObject } from '../commands.js';
import { visibleObjects } from './search.js';
import '../ui/window.js';

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

        /* The search is behind the magnifier, and collapses to nothing rather than
           sliding: a grid row animating from 0fr to 1fr changes the panel's height
           without ever moving what is already on screen. */
        .searchbar {
            display: grid;
            grid-template-rows: 0fr;
            /* Width, not colour: a transparent 1px border would still cost a pixel of
               layout while the field is closed. */
            border-bottom: 0 solid var(--px-border);
            transition: grid-template-rows var(--px-duration) var(--px-ease),
                        border-bottom-width var(--px-duration) var(--px-ease);
        }

        .searchbar > .inner { overflow: hidden; min-height: 0; }
        .searchbar.open { grid-template-rows: 1fr; border-bottom-width: 1px; }

        .searchbar .field {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            padding: var(--px-space-1) var(--px-space-1) var(--px-space-1) var(--px-space-2);
            color: var(--px-text-dim);
        }

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

        .row:hover { background: var(--px-surface-hover); }
        .row.selected { background: var(--px-accent-muted); box-shadow: inset 2px 0 0 var(--px-accent); }
        .row.selected .name { color: var(--px-text-strong); }
        .row.hidden .name, .row.hidden .glyph { opacity: 0.4; }
        .row.locked .name { font-style: italic; }

        /* A ghost, so the twisty is 22 wide and 28 to the finger like every other icon
           control. It used to be --px-hit tall inside a --px-row line, which is 28 in 26
           and overflowed the row by a pixel at each end. */
        .twisty {
            color: var(--px-text-dim);
            cursor: pointer;
        }

        .twisty .icon { transition: transform var(--px-duration) var(--px-ease); }
        .twisty.open .icon { transform: rotate(90deg); }
        .twisty.leaf { visibility: hidden; }

        .glyph { color: var(--px-text-dim); display: flex; flex: 0 0 auto; }
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

        /* The well a value is typed into — the same surface the name takes once it is
           actually being edited, so the hover is a promise the click keeps. */
        .row.selected .name:hover { background: var(--px-surface-input); cursor: text; }

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
    #rows = new globalThis.Map();
    #query = '';
    #tree = null;
    #searchInput = null;
    #searchbar = null;
    #magnifier = null;

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

        for (const event of ['added', 'removed', 'child:added', 'child:removed', 'component:added', 'component:removed']) {
            this.track(this.#scene.on(event, () => this.#renderTree()));
        }
        this.track(this.#selection.observe(() => this.#applySelection()));

        this.#renderTree();
    }

    #build() {
        this.#tree = el('div', { class: 'tree' });

        this.#searchInput = el('input', {
            type: 'search',
            placeholder: 'Search objects',
            spellcheck: false,
            autocomplete: 'off',
            // Reactive to the keystroke, like every other field in the Editor.
            oninput: event => {
                this.#query = event.target.value;
                this.#renderTree();
            },
            onkeydown: event => {
                if (event.key === 'Escape') this.#showSearch(false);
                event.stopPropagation();
            }
        });

        this.#searchbar = el('div', { class: 'searchbar', slot: 'header' },
            el('div', { class: 'inner' },
                el('div', { class: 'field' },
                    icon('search'),
                    this.#searchInput,
                    el('button', {
                        class: 'ghost',
                        type: 'button',
                        title: 'Clear and close',
                        'aria-label': 'Clear and close search',
                        onclick: () => this.#showSearch(false)
                    }, icon('close'))
                )
            )
        );

        this.#magnifier = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'Search objects',
            'aria-label': 'Search objects',
            'aria-expanded': 'false',
            onclick: () => this.#showSearch(!this.#searchbar.classList.contains('open'))
        }, icon('search'));

        const create = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'Create object',
            'aria-label': 'Create object',
            onclick: () => this.#openCreateMenu(create)
        }, icon('plus'));

        this.shadowRoot.replaceChildren(el('px-window', { label: 'Hierarchy', icon: 'hierarchy' },
            el('div', { class: 'actions', slot: 'actions' }, this.#magnifier, create),
            this.#searchbar,
            this.#tree
        ));
    }

    /**
     * Open or close the search.
     *
     * Closing clears the query as well as hiding the field: a filter still applied behind
     * a folded control is a tree that lies about what the scene holds.
     *
     * @param {boolean} open - Whether the field is shown
     */
    #showSearch(open) {
        this.#searchbar.classList.toggle('open', open);
        this.#magnifier.classList.toggle('on', open);
        this.#magnifier.setAttribute('aria-expanded', globalThis.String(open));

        if (open) {
            this.#searchInput.focus();
            this.#searchInput.select();
            return;
        }

        if (this.#query === '' && this.#searchInput.value === '') return;
        this.#searchInput.value = '';
        this.#query = '';
        this.#renderTree();
    }

    #renderTree() {
        this.release('rows');
        this.#rows.clear();

        const roots = this.#scene.roots();
        const visible = visibleObjects(roots, this.#query);

        if (visible && visible.size === 0) {
            fill(this.#tree, el('div', {
                class: 'empty',
                textContent: `No object matches “${this.#query.trim()}”.`
            }));
            return;
        }

        fill(this.#tree,
            roots.length === 0
                ? el('div', { class: 'empty', textContent: 'No objects yet. Drag one in from the toolbar, or use +.' })
                : roots.map(object => this.#renderBranch(object, 0, visible))
        );

        this.#applySelection();
    }

    #renderBranch(object, depth, visible) {
        if (visible && !visible.has(object)) return [];

        const children = visible
            ? object.children.filter(child => visible.has(child))
            : object.children;

        // While searching every surviving branch is open: a result the creator cannot see
        // because its parent happened to be folded is a result they will not believe in.
        const open = Boolean(visible) || !this.#collapsed.has(object.id);

        const nodes = [this.#renderRow(object, depth, children.length > 0, open, Boolean(visible))];
        if (open) {
            for (const child of children) nodes.push(...this.#renderBranch(child, depth + 1, visible));
        }
        return nodes;
    }

    #renderRow(object, depth, hasChildren, open, searching) {
        // The row selects on pointerdown, so a control inside it has to stop that event
        // and not merely the click: folding a branch or hiding an object is not a way of
        // saying "select this".
        const twisty = el('span', {
            class: `ghost twisty${hasChildren && !searching ? '' : ' leaf'}${open ? ' open' : ''}`,
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

        // Depth is a custom property rather than a computed padding, so the row's own
        // rules derive both the indent and the guide line from it and no arithmetic
        // leaks into JavaScript.
        const row = el('div', {
            class: 'row',
            style: `--depth: ${depth}`,
            dataset: { depth: globalThis.String(depth) },
            onpointerdown: () => this.#selection.set(object),
            ondblclick: () => this.#viewport?.focusOn(object)
        }, twisty, glyph, name, el('div', { class: 'actions' }, lock, visibility, remove));

        name.addEventListener('click', () => {
            // Only once the row is the selected one, so the first click on a row still
            // just selects it instead of dropping a caret the creator did not ask for.
            if (this.#selection.has(object)) this.#beginRename(object, name);
        });
        name.addEventListener('dblclick', event => event.stopPropagation());

        this.#applyState(row, object);

        this.track(object.observe('name', change => {
            if (name.classList.contains('editing')) return;
            name.textContent = change.value || '(unnamed)';
        }), 'rows');

        for (const prop of ['active', 'visible', 'lock']) {
            this.track(object.observe(prop, () => this.#applyState(row, object)), 'rows');
        }

        this.#rows.set(object, row);
        return row;
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
        this.track(object.observe(prop, sync), 'rows');
        return button;
    }

    #applyState(row, object) {
        row.classList.toggle('hidden', !object.visible || !object.active);
        row.classList.toggle('locked', object.lock);
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

        const finish = () => {
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
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                object.setProperty('name', original);
                name.blur();
            }
        };
    }

    #toggle(object) {
        if (this.#collapsed.has(object.id)) this.#collapsed.delete(object.id);
        else this.#collapsed.add(object.id);
        this.#renderTree();
    }

    #applySelection() {
        for (const [object, row] of this.#rows) {
            row.classList.toggle('selected', this.#selection.has(object));
        }
    }

    #openCreateMenu(anchor) {
        const items = OBJECT_KINDS.map(kind => ({
            id: kind.id,
            label: kind.label,
            icon: kind.id === 'camera' ? 'camera' : kind.id === 'empty' ? 'object' : 'rectangle'
        }));

        openMenu(anchor, items, kind => {
            const centre = this.#viewport?.worldCentre() ?? { x: 0, y: 0 };
            this.#selection.set(createObject(this.#scene, {
                kind,
                x: Math.round(centre.x),
                y: Math.round(centre.y)
            }));
        });
    }

    #delete(object) {
        if (this.#selection.has(object)) this.#selection.clear();
        deleteObject(this.#scene, object);
    }
}

customElements.define('px-hierarchy', Hierarchy);
