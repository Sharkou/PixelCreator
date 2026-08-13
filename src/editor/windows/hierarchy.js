// <px-hierarchy> — the scene's objects, as a tree.
//
// It reads the model and nothing else: rows come from `scene.roots()` and
// `object.children`, and there is no parallel tree to keep in step. The only state that
// belongs to this element is which branches are folded, because that is a fact about
// this panel and not about the project.
//
// Two levels of update, deliberately:
//
//   structure — the scene's five structural events rebuild the tree;
//   values    — each row subscribes to its object's `name` and `active`, so renaming in
//               the Inspector retitles the row on every keystroke without touching the
//               tree at all. That letter-by-letter behaviour is a requirement of the
//               product, not a side effect (docs/architecture/EDITOR.md).

import { PxElement, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForObject } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { OBJECT_KINDS, createObject, deleteObject } from '../commands.js';

export class PxHierarchy extends PxElement {

    static styles = sheet(`
        :host { display: block; height: 100%; }
        px-panel { height: 100%; }

        .actions { display: flex; gap: 2px; }

        .action {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 4px;
            color: var(--px-text-dim);
        }

        .action:hover { background: var(--px-bg-3); color: var(--px-text-strong); }
        .action[disabled] { opacity: 0.35; cursor: default; }
        .action[disabled]:hover { background: none; color: var(--px-text-dim); }

        .tree { padding: 4px 0 12px; }

        .row {
            display: flex;
            align-items: center;
            gap: 6px;
            height: var(--px-row);
            padding-right: 8px;
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        .row:hover { background: var(--px-bg-2); }
        .row.selected { background: var(--px-accent-soft); }
        .row.selected .name { color: var(--px-text-strong); }
        .row.dimmed .name, .row.dimmed .glyph { opacity: 0.4; }

        .twisty {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
            color: var(--px-text-dim);
            transition: transform 90ms ease;
        }

        .twisty.open { transform: rotate(90deg); }
        .twisty.leaf { visibility: hidden; }

        .glyph { color: var(--px-text-dim); }
        .row.selected .glyph { color: var(--px-accent); }

        .name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            outline: none;
        }

        .name[contenteditable='true'] {
            background: var(--px-bg-0);
            border-radius: 3px;
            padding: 0 3px;
            text-overflow: clip;
            cursor: text;
        }

        .visibility {
            display: flex;
            opacity: 0;
            color: var(--px-text-dim);
        }

        .row:hover .visibility, .visibility.off { opacity: 1; }
        .visibility:hover { color: var(--px-text-strong); }

        .empty {
            padding: 14px 12px;
            color: var(--px-text-dim);
            line-height: 1.5;
        }
    `);

    #scene = null;
    #selection = null;
    #collapsed = new globalThis.Set();
    #rows = new globalThis.Map();
    #tree = null;
    #deleteButton = null;

    /**
     * Point the panel at the scene it lists.
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene
     * @param {object} context.selection - The Editor selection
     * @returns {PxHierarchy} This element
     */
    bind({ scene, selection }) {
        this.#scene = scene;
        this.#selection = selection;
        return this;
    }

    connectedCallback() {
        this.#build();

        for (const event of ['added', 'removed', 'child:added', 'child:removed', 'component:added', 'component:removed']) {
            this.track(this.#scene.on(event, () => this.#renderTree()));
        }
        this.track(this.#selection.observe(() => this.#applySelection()));

        this.#renderTree();
    }

    #build() {
        this.#tree = el('div', { class: 'tree' });

        const create = el('button', {
            class: 'action',
            type: 'button',
            title: 'Create object',
            onclick: () => this.#openCreateMenu(create)
        }, icon('plus'));

        this.#deleteButton = el('button', {
            class: 'action',
            type: 'button',
            title: 'Delete selected object',
            onclick: () => this.#deleteSelected()
        }, icon('trash'));

        const panel = el('px-panel', { label: 'Hierarchy' },
            el('div', { class: 'actions', slot: 'actions' }, create, this.#deleteButton),
            this.#tree
        );

        this.shadowRoot.replaceChildren(panel);
    }

    #renderTree() {
        this.release('rows');
        this.#rows.clear();

        const roots = this.#scene.roots();
        fill(this.#tree,
            roots.length === 0
                ? el('div', { class: 'empty', textContent: 'No objects yet. Use + to create one.' })
                : roots.map(object => this.#renderBranch(object, 0))
        );

        this.#applySelection();
    }

    #renderBranch(object, depth) {
        const children = object.children;
        const open = !this.#collapsed.has(object.id);

        const nodes = [this.#renderRow(object, depth, children.length > 0, open)];
        if (open) {
            for (const child of children) nodes.push(...this.#renderBranch(child, depth + 1));
        }
        return nodes;
    }

    #renderRow(object, depth, hasChildren, open) {
        // The row selects on pointerdown, so a control inside it has to stop that event
        // and not merely the click: folding a branch or hiding an object is not a way of
        // saying "select this".
        const twisty = el('span', {
            class: `twisty${hasChildren ? '' : ' leaf'}${open ? ' open' : ''}`,
            onpointerdown: event => event.stopPropagation(),
            onclick: () => this.#toggle(object)
        }, icon('chevron', 12));

        const name = el('span', { class: 'name', textContent: object.name || '(unnamed)' });
        const glyph = el('span', { class: 'glyph' }, icon(iconForObject(object), 13));

        const visibility = el('button', {
            class: `visibility${object.visible ? '' : ' off'}`,
            type: 'button',
            title: 'Toggle visibility',
            onpointerdown: event => event.stopPropagation(),
            onclick: () => object.setProperty('visible', !object.visible)
        }, icon(object.visible ? 'eye' : 'eye-off', 13));

        const row = el('div', {
            class: 'row',
            style: `padding-left: ${6 + depth * 13}px`,
            onpointerdown: () => this.#selection.set(object),
            ondblclick: () => this.#beginRename(object, name)
        }, twisty, glyph, name, visibility);

        row.classList.toggle('dimmed', !object.active);

        // Values, watched one by one. A rename or a visibility toggle updates this row
        // and only this row, whoever made the change.
        this.track(object.observe('name', change => {
            if (name.isContentEditable) return;
            name.textContent = change.value || '(unnamed)';
        }), 'rows');
        this.track(object.observe('active', change => row.classList.toggle('dimmed', !change.value)), 'rows');
        this.track(object.observe('visible', change => {
            visibility.classList.toggle('off', !change.value);
            visibility.replaceChildren(icon(change.value ? 'eye' : 'eye-off', 13));
        }), 'rows');

        this.#rows.set(object, row);
        return row;
    }

    #beginRename(object, name) {
        name.contentEditable = 'plaintext-only';
        // Not every engine accepts plaintext-only; falling back keeps renaming working
        // rather than leaving a row that looks editable and is not.
        if (!name.isContentEditable) name.contentEditable = 'true';
        name.textContent = object.name;
        name.focus();
        globalThis.getSelection()?.selectAllChildren(name);

        const commit = () => {
            name.contentEditable = 'false';
            name.textContent = object.name || '(unnamed)';
        };

        // Written on every keystroke, like the Inspector: one model, one behaviour,
        // whichever view the creator happens to be typing into.
        name.oninput = () => object.setProperty('name', name.textContent.trim());
        name.onblur = commit;
        name.onkeydown = event => {
            if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                name.blur();
            }
            event.stopPropagation();
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
        this.#deleteButton.disabled = this.#selection.object === null;
    }

    #openCreateMenu(anchor) {
        const items = OBJECT_KINDS.map(kind => ({
            id: kind.id,
            label: kind.label,
            icon: kind.id === 'camera' ? 'camera' : kind.id === 'empty' ? 'object' : 'rectangle'
        }));

        openMenu(anchor, items, kind => {
            const created = createObject(this.#scene, { kind });
            this.#selection.set(created);
        });
    }

    #deleteSelected() {
        const object = this.#selection.object;
        if (!object) return;

        this.#selection.clear();
        deleteObject(this.#scene, object);
    }
}

customElements.define('px-hierarchy', PxHierarchy);
