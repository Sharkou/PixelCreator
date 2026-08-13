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
//
// NOTHING IS REVEALED BY HOVER. Lock, visibility and delete are always drawn; hover only
// strengthens them. A finger has no hover, and these are not decorations.

import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForObject } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { OBJECT_KINDS, createObject, deleteObject } from '../commands.js';
import { visibleObjects } from './search.js';
import '../ui/window.js';

export class Hierarchy extends Element {

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }

        .search {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 6px 10px;
            color: var(--px-text-dim);
        }

        .search input { background: var(--px-bg-0); }

        .search .clear { width: var(--px-hit); height: var(--px-hit); }

        .tree { padding: 3px 0 14px; }

        .row {
            display: flex;
            align-items: center;
            gap: 5px;
            height: var(--px-row);
            padding-right: 4px;
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        .row:hover { background: var(--px-bg-2); }
        .row.selected { background: var(--px-accent-soft); box-shadow: inset 2px 0 0 var(--px-accent); }
        .row.selected .name { color: var(--px-text-strong); }
        .row.hidden .name, .row.hidden .glyph { opacity: 0.4; }
        .row.locked .name { font-style: italic; }

        .twisty {
            display: flex;
            align-items: center;
            justify-content: center;
            width: var(--px-hit);
            height: var(--px-hit);
            flex: 0 0 auto;
            margin-left: -4px;
            border-radius: var(--px-radius-sm);
            color: var(--px-text-dim);
        }

        .twisty .icon { transition: transform 100ms ease; }
        .twisty.open .icon { transform: rotate(90deg); }
        .twisty.leaf { visibility: hidden; }
        .twisty:hover { background: var(--px-bg-3); color: var(--px-text-strong); }

        .glyph { color: var(--px-text-dim); display: flex; flex: 0 0 auto; }
        .row.selected .glyph { color: var(--px-accent); }

        .name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            outline: none;
            padding: 2px 3px;
            border-radius: 3px;
        }

        .row.selected .name:hover { background: rgba(255, 255, 255, 0.05); cursor: text; }

        .name.editing {
            background: var(--px-bg-0);
            box-shadow: 0 0 0 1px var(--px-accent);
            text-overflow: clip;
            cursor: text;
        }

        .actions { display: flex; flex: 0 0 auto; }

        .actions .ghost { width: var(--px-hit); height: var(--px-hit); opacity: 0.55; }
        .row:hover .actions .ghost { opacity: 0.9; }
        .actions .ghost:hover, .actions .ghost.on { opacity: 1; }
        .actions .ghost.on { color: var(--px-accent); }
        .actions .remove:hover { color: var(--px-danger); }

        .empty {
            padding: 16px 12px;
            color: var(--px-text-dim);
            line-height: 1.5;
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
                if (event.key === 'Escape') this.#clearSearch();
                event.stopPropagation();
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
            el('div', { class: 'actions', slot: 'actions' }, create),
            el('div', { class: 'search', slot: 'header' },
                icon('search', 13),
                this.#searchInput,
                el('button', {
                    class: 'ghost clear',
                    type: 'button',
                    title: 'Clear search',
                    'aria-label': 'Clear search',
                    onclick: () => this.#clearSearch()
                }, icon('close', 12))
            ),
            this.#tree
        ));
    }

    #clearSearch() {
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
            class: `twisty${hasChildren && !searching ? '' : ' leaf'}${open ? ' open' : ''}`,
            onpointerdown: event => event.stopPropagation(),
            onclick: () => this.#toggle(object)
        }, icon('chevron', 12));

        const name = el('span', { class: 'name', textContent: object.name || '(unnamed)' });
        const glyph = el('span', { class: 'glyph' }, icon(iconForObject(object), 13));

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
        }, icon('trash', 13));

        const row = el('div', {
            class: 'row',
            style: `padding-left: ${4 + depth * 13}px`,
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
        }, icon(glyph(), 13));

        const sync = () => {
            button.title = title();
            button.setAttribute('aria-label', title());
            button.classList.toggle('on', on());
            fill(button, icon(glyph(), 13));
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
