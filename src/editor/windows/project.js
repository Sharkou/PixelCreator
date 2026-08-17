// <px-project> — the project's resources, under the Hierarchy.
//
// IT LISTS THE MANIFEST, AND THE MANIFEST ONLY. A resource is `{ id, kind, name, path,
// revision }`; its payload is read by identifier, on demand, and no panel needs it to draw
// a row (ADR-0020). So this window is a view of `project.resources()` and nothing else —
// no thumbnail cache, no preloaded asset grid, no parallel list to keep in step.
//
// WHAT A ROW CAN DO, and why it is these two:
//
//   rename   `SET_PROPERTY` on the manifest entry. `name` is a display field that nothing
//            references, so renaming breaks no reference — that is the whole point of
//            identity being an opaque id rather than a path (ADR-0020).
//   delete   `REMOVE_RESOURCE`, payload carried, therefore undoable (ADR-0019, ADR-0024).
//
// Both are Operations on the PROJECT pipeline, so `Ctrl Z` here takes back a resource
// edit and never a scene edit: that is exactly why the stacks are per resource (ADR-0024).
//
// THE OPEN SCENE CANNOT BE DELETED FROM HERE. Removing the resource the Editor is editing
// would leave every window bound to a scene the project no longer declares. Closing an
// editor is a gesture that does not exist yet, so the control that would need it is
// disabled with a reason, rather than drawn and dangerous.
//
// The rows come from the pipeline's own event: any operation on the manifest — mine, a
// collaborator's, an undo — rebuilds the list, because that event is the one place every
// mutation of a manifest passes through.

import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icons.js';
import { searchField } from '../ui/search-field.js';
import { observe } from '../../core/mod.js';
import '../ui/window.js';

/** The glyph for each kind. A scene is what the Hierarchy draws, so it shares its icon. */
const KIND_ICONS = {
    scene: 'hierarchy',
    component: 'component',
    graph: 'graph',
    asset: 'sprite'
};

/** The order kinds are grouped in: what a project is made of, most structural first. */
const KIND_ORDER = ['scene', 'component', 'graph', 'asset'];

const KIND_LABELS = {
    scene: 'Scenes',
    component: 'Components',
    graph: 'Graphs',
    asset: 'Assets'
};

export class Project extends Element {

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }

        .list { padding: var(--px-space-1) 0 var(--px-space-3); }

        .group {
            display: flex;
            align-items: center;
            height: var(--px-row);
            padding: 0 var(--px-space-2);
            color: var(--px-text-dim);
            font-size: var(--px-text-sm);
            -webkit-user-select: none;
            user-select: none;
        }

        /* The same anatomy as a Hierarchy row, because it is the same kind of line in the
           same column: glyph, name, tools (ui/styles.js owns .line). */
        .row {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            height: var(--px-row);
            padding: 0 var(--px-space-1) 0 var(--px-space-2);
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        .row .glyph {
            display: flex;
            width: var(--px-control);
            justify-content: center;
            color: var(--px-text-dim);
            flex: 0 0 auto;
        }

        .row .name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .row .name.editing {
            outline: 1px solid var(--px-accent);
            border-radius: var(--px-radius-sm);
            padding: 0 var(--px-space-1);
            background: var(--px-surface-sunken);
        }

        .row .path {
            color: var(--px-text-dim);
            font-size: var(--px-text-sm);
            white-space: nowrap;
            flex: 0 0 auto;
        }

        /* The one dot in the panel: this resource holds work the store does not. */
        .row .dirty {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--px-accent);
            flex: 0 0 auto;
        }

        .row .actions { display: flex; gap: var(--px-space-0); flex: 0 0 auto; }
        .row .actions .remove:hover:not(:disabled) { color: var(--px-danger); }

        .none {
            padding: var(--px-space-2) var(--px-space-3);
            color: var(--px-text-dim);
        }
    `);

    #workspace = null;
    #list = null;
    #search = null;
    #query = '';

    /**
     * Point the window at the workspace whose project it lists.
     * @param {object} context - Editor context
     * @param {object} context.workspace - The workspace
     * @returns {Project} This element
     */
    bind({ workspace }) {
        this.#workspace = workspace;
        return this;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#build();
        if (!this.#workspace) return;

        // Every mutation of a manifest passes through this event, whoever authored it.
        this.track(this.#workspace.project.operations.on('operation', () => this.#render()));
        for (const event of ['opened', 'closed', 'saved', 'dirty']) {
            this.track(this.#workspace.on(event, () => this.#render()));
        }

        this.#render();
    }

    #build() {
        this.#list = el('div', { class: 'list' });

        this.#search = searchField({
            placeholder: 'Search resources',
            label: 'resources',
            onQuery: query => {
                this.#query = query;
                this.#render();
            }
        });

        this.shadowRoot.append(el('px-window', { label: 'Project', icon: 'folder' },
            el('div', { class: 'actions', slot: 'actions' }, this.#search.toggle),
            this.#search.bar,
            this.#list
        ));
    }

    #render() {
        this.release('rows');

        if (!this.#workspace) {
            fill(this.#list, emptyState('folder', 'No project',
                'This window lists the resources a project declares.'));
            return;
        }

        const resources = this.#workspace.project.resources();
        if (resources.length === 0) {
            fill(this.#list, emptyState('folder', 'No resources yet',
                'Scenes, components, graphs and images appear here as the project declares them.'));
            return;
        }

        const needle = this.#query.trim().toLowerCase();
        const shown = needle === ''
            ? resources
            : resources.filter(resource => (resource.name || 'Untitled').toLowerCase().includes(needle));
        if (shown.length === 0) {
            fill(this.#list, el('div', {
                class: 'none',
                textContent: `No resource matches “${this.#query.trim()}”.`
            }));
            return;
        }

        const nodes = [];
        for (const kind of KIND_ORDER) {
            const group = shown.filter(resource => resource.kind === kind);
            if (group.length === 0) continue;

            nodes.push(el('div', { class: 'group', textContent: KIND_LABELS[kind] }));
            for (const resource of group) nodes.push(this.#row(resource));
        }

        fill(this.#list, nodes);
    }

    #row(resource) {
        const open = this.#workspace.resource?.id === resource.id;

        const name = el('span', {
            class: 'name',
            textContent: resource.name || 'Untitled',
            title: `${resource.path || ''}${resource.name || 'Untitled'}`,
            ondblclick: () => this.#rename(resource, name)
        });

        const remove = el('button', {
            class: 'ghost remove',
            type: 'button',
            disabled: open,
            title: open
                ? 'The open scene cannot be deleted while it is open'
                : `Delete ${resource.name || 'Untitled'}`,
            'aria-label': `Delete ${resource.name || 'Untitled'}`,
            onclick: () => this.#workspace.project.remove(resource.id)
        }, icon('trash'));

        const row = el('div', { class: 'row line', dataset: { id: resource.id } },
            el('span', { class: 'glyph' }, icon(KIND_ICONS[resource.kind] ?? 'component')),
            name,
            open && this.#workspace.dirty ? el('span', { class: 'dirty', title: 'Unsaved changes' }) : null,
            resource.path ? el('span', { class: 'path', textContent: resource.path }) : null,
            el('div', { class: 'actions' }, remove)
        );

        row.classList.toggle('selected', open);

        // Renaming from anywhere — this panel, a collaborator, an undo — retitles the row
        // without rebuilding the list, the same letter-by-letter rule the Hierarchy keeps.
        this.track(observe(this.#workspace.project.get(resource.id), 'name', change => {
            if (name.classList.contains('editing')) return;
            name.textContent = change.value || 'Untitled';
        }), 'rows');

        return row;
    }

    /**
     * Edit a resource's name in place.
     *
     * Written on every keystroke, through the project pipeline, exactly as a rename in the
     * Hierarchy goes through the scene's — one model, one path, one undo entry per stroke.
     *
     * @param {object} resource - The manifest entry
     * @param {HTMLElement} name - The row's name element
     */
    #rename(resource, name) {
        if (name.classList.contains('editing')) return;

        const original = resource.name;
        name.classList.add('editing');
        name.contentEditable = 'plaintext-only';
        if (!name.isContentEditable) name.contentEditable = 'true';
        name.textContent = original;
        name.focus();
        globalThis.getSelection()?.selectAllChildren(name);

        const finish = () => {
            if (!name.classList.contains('editing')) return;
            name.classList.remove('editing');
            name.contentEditable = 'false';
            name.textContent = this.#workspace.project.get(resource.id)?.name || 'Untitled';
        };

        name.oninput = () => this.#workspace.project.setProperty(resource.id, 'name', name.textContent.trim());
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
                this.#workspace.project.setProperty(resource.id, 'name', original);
                name.blur();
                finish();
            }
        };
    }
}

customElements.define('px-project', Project);
