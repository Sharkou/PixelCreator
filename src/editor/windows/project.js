// <px-project> — the project's resources, as an asset browser.
//
// A GRID, NOT A SECOND HIERARCHY. `design/prototype.js` draws this window as tiles with a
// checkerboard thumbnail, and the difference is not decoration: a scene is ARRANGED, a
// project is BROWSED. A creator looking for an image recognises it, and a list of names
// with one glyph each makes them read where they could have looked.
//
// IT IS A VIEW OF THE MANIFEST, AND OWNS NO STATE THE MODEL COULD HOLD. Tiles come from
// `project.children(folder)`; which resource is selected lives in the Workspace, because
// the Inspector needs the same answer (ADR-0025). What belongs to this window and nowhere
// else is which folder is open and what is in the search box — facts about a panel, never
// about a project (ADR-0017).
//
// THE GESTURES ARE THE HIERARCHY'S, DELIBERATELY (ADR-0026 §2):
//
//   click                 select
//   click again, selected rename in place, after the same pause the Hierarchy waits
//   double-click          OPEN — a folder walks into it, anything else opens its editor
//   F2                    rename now
//   drag onto a folder    move into it
//   drag between tiles    reorder inside the folder (MOVE_RESOURCE, ADR-0026 §6)
//   drop files from disk  import, through the same rules any other drop uses
//
// Every mutation is an Operation on the Project's pipeline, so `Ctrl Z` here takes back a
// resource edit and never a scene edit (ADR-0024).

import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { emptyState } from '../ui/empty-state.js';
import { icon, iconForResource, IconSize } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { searchField } from '../ui/search-field.js';
import { observe } from '../../core/mod.js';
import { baseNameOf, canMove, isFolder, withExtension } from '../../project/mod.js';
import { createResourceOfKind, resourceKind, resourceMenuItems } from '../project/commands.js';
import { pickFile, readAsDataUrl } from '../ui/file.js';
import { DropZone, resourcePayload } from '../dnd/payload.js';
import { canDrop, performDrop } from '../dnd/rules.js';
import { carriesFiles, readDroppedFiles } from '../dnd/files.js';
import { DropPosition, dropPositionAt, insertionIndex } from './drop.js';
import '../ui/window.js';

/** How far a pointer travels before a press on a tile becomes a drag. */
const DRAG_THRESHOLD = 4;

/** How long a click on a selected name waits to see whether it was half of a double-click. */
const RENAME_DELAY = 400;

export class Project extends Element {

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }

        /* ── breadcrumb ─────────────────────────────────────────────────── */

        .crumbs {
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
            padding: 0 var(--px-space-1);
            height: var(--px-row);
            flex: 0 0 auto;
            border-bottom: 1px solid var(--px-border);
            overflow-x: auto;
            white-space: nowrap;
            -webkit-user-select: none;
            user-select: none;
        }

        .crumbs .crumb {
            display: inline-flex;
            align-items: center;
            gap: var(--px-space-0);
            padding: 0 var(--px-space-1);
            height: var(--px-control);
            border-radius: var(--px-radius-sm);
            color: var(--px-text-muted);
            background: none;
            border: none;
            font: inherit;
            cursor: default;
        }

        .crumbs .crumb:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
        .crumbs .crumb.here { color: var(--px-text-strong); }
        .crumbs .crumb.drop { background: var(--px-accent-muted); color: var(--px-text-strong); }
        .crumbs .sep { color: var(--px-border-subtle); }

        /* ── the grid ───────────────────────────────────────────────────── */

        /* Auto-filled tiles at the prototype's density: 62 px minimum, one gap step. The
           surface takes the whole window so a click below the last tile still lands on the
           panel — that empty space is what deselects. */
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
            gap: var(--px-space-1);
            padding: var(--px-space-2);
            align-content: start;
            min-height: 100%;
        }

        .tile {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: var(--px-space-1);
            padding: var(--px-space-1);
            border-radius: var(--px-radius-md);
            border: 1px solid transparent;
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        .tile:hover { background: var(--px-surface-raised); border-color: var(--px-border-subtle); }
        .tile.selected { background: var(--px-accent-muted); border-color: var(--px-accent); }

        /* The checkerboard says "this is where a picture goes" even when the picture is a
           glyph — it is the one place in the Editor that draws transparency. */
        .thumb {
            position: relative;
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--px-radius-sm);
            overflow: hidden;
            color: var(--px-text-dim);
            background-color: var(--px-surface-sunken);
            background-image:
                linear-gradient(45deg, var(--px-surface-raised) 25%, transparent 25%, transparent 75%, var(--px-surface-raised) 75%),
                linear-gradient(45deg, var(--px-surface-raised) 25%, transparent 25%, transparent 75%, var(--px-surface-raised) 75%);
            background-size: 8px 8px;
            background-position: 0 0, 4px 4px;
        }

        .tile.selected .thumb { color: var(--px-accent); }

        /* Pixel art, drawn as pixel art: a smoothed thumbnail misreports the asset. */
        .thumb img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            image-rendering: pixelated;
        }

        .tile .name {
            font-size: var(--px-text-xs);
            color: var(--px-text);
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            outline: none;
            border-radius: var(--px-radius-sm);
            padding: 0 var(--px-space-0);
        }

        .tile:hover .name, .tile.selected .name { color: var(--px-text-strong); }

        .tile .name.editing {
            background: var(--px-surface-input);
            box-shadow: 0 0 0 1px var(--px-accent);
            text-overflow: clip;
            cursor: text;
        }

        /* The unsaved dot, in the corner of the tile that is open. */
        .tile .dirty {
            position: absolute;
            top: var(--px-space-1);
            right: var(--px-space-1);
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--px-accent);
        }

        /* ── dragging ───────────────────────────────────────────────────── */

        .tile.dragging { opacity: 0.4; }
        .tile.into { box-shadow: inset 0 0 0 2px var(--px-accent); }

        /* Between two tiles: a rail down the edge the tile would land at. A grid has rows,
           so the mark is vertical — the horizontal line a list uses would point at the
           wrong neighbour. */
        .tile.before::after,
        .tile.after::after {
            content: '';
            position: absolute;
            top: var(--px-space-1);
            bottom: var(--px-space-1);
            width: 2px;
            background: var(--px-accent);
            pointer-events: none;
        }

        .tile.before::after { left: calc(var(--px-space-1) * -1); }
        .tile.after::after { right: calc(var(--px-space-1) * -1); }

        /* A file being dragged in from outside: the whole window says so, because the
           whole window accepts it. */
        :host(.importing) .grid {
            outline: 2px dashed var(--px-accent);
            outline-offset: -4px;
        }

        .none {
            padding: var(--px-space-2) var(--px-space-3);
            color: var(--px-text-dim);
        }
    `);

    #workspace = null;
    #grid = null;
    #crumbs = null;
    #search = null;
    #query = '';

    /** Which folder is open. View state: never serialized, never in the project. */
    #folder = null;

    /** Tiles survive a re-render, keyed by resource id, so an edit in progress survives. */
    #tiles = new globalThis.Map();
    #drag = null;
    /** Set for exactly one click: the one that ends a drag and must not also select. */
    #dragged = false;
    #rename = null;

    /**
     * Point the window at the workspace whose project it lists.
     * @param {object} context - Editor context
     * @param {object} context.workspace - The workspace
     * @param {object} [context.scene] - The open scene, for drops that instantiate
     * @param {object} [context.selection] - The Editor selection
     * @returns {Project} This element
     */
    bind({ workspace, scene = null, selection = null }) {
        this.#workspace = workspace;
        this.scene = scene;
        this.selection = selection;
        return this;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#build();
        if (!this.#workspace) return;

        this.track(this.#workspace.project.operations.on('operation', () => this.#render()));
        for (const event of ['opened', 'closed', 'saved', 'dirty']) {
            this.track(this.#workspace.on(event, () => this.#render()));
        }
        this.track(this.#workspace.on('selection', () => this.#applySelection()));

        const onKey = event => {
            if (event.key !== 'F2' || event.ctrlKey || event.metaKey || event.altKey) return;
            const resource = this.#workspace.selected;
            const tile = resource ? this.#tiles.get(resource.id) : null;
            if (!tile) return;
            event.preventDefault();
            this.#cancelRename();
            this.#beginRename(resource, tile.name);
        };
        globalThis.addEventListener('keydown', onKey);
        this.track(() => globalThis.removeEventListener('keydown', onKey));

        this.#render();
    }

    #build() {
        this.#grid = el('div', {
            class: 'grid',
            // The empty space between and below the tiles is a real target: clicking it
            // deselects, the same gesture the Hierarchy and the viewport answer to.
            onpointerdown: event => {
                if (event.target !== this.#grid) return;
                this.#cancelRename();
                this.#workspace?.select(null);
            },
            ondragover: event => this.#dragOver(event),
            ondragleave: () => this.classList.remove('importing'),
            ondrop: event => this.#dropFiles(event)
        });
        this.#crumbs = el('div', { class: 'crumbs' });

        this.#search = searchField({
            placeholder: 'Search resources',
            label: 'resources',
            onQuery: query => {
                this.#query = query;
                this.#render();
            }
        });

        const create = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'Create resource',
            'aria-label': 'Create resource',
            onclick: () => this.#openCreateMenu(create)
        }, icon('plus'));

        const more = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'More',
            'aria-label': 'More project actions',
            onclick: () => this.#openMoreMenu(more)
        }, icon('more'));

        this.shadowRoot.append(el('px-window', { label: 'Project', icon: 'folder' },
            el('div', { class: 'actions', slot: 'actions' }, this.#search.toggle, create, more),
            this.#search.bar,
            this.#crumbs,
            this.#grid
        ));
    }

    /**
     * The `+` menu: the same categorised, filterable dropdown the Hierarchy and the
     * Inspector open (ADR-0026 §4). The entries come from the kinds table, so a new kind
     * appears here by existing.
     */
    #openCreateMenu(anchor) {
        openMenu(anchor, resourceMenuItems(), kind => this.#create(kind), { label: 'resources' });
    }

    /**
     * The `…` menu.
     *
     * WHAT IS REALLY THERE, and nothing invented to fill a list: importing without dragging,
     * a way back to the top level, and the two facts about this panel a creator may want to
     * change. Anything else waits until it exists.
     */
    #openMoreMenu(anchor) {
        const items = [
            { heading: 'Project' },
            { id: 'import', label: 'Import files…', icon: 'image' },
            { id: 'top', label: 'Go to top level', icon: 'folder' },
            { heading: 'View' },
            { id: 'expand', label: 'Show every resource', icon: 'search' }
        ];

        openMenu(anchor, items, choice => {
            if (choice === 'import') this.#create('asset');
            if (choice === 'top') this.#openFolder(null);
            if (choice === 'expand') {
                // "Show every resource" is the search with an empty needle: one mechanism,
                // not a second flat mode nobody can leave.
                this.#search.show(true);
            }
        }, { label: 'actions' });
    }

    async #create(kind) {
        const entry = resourceKind(kind);
        if (!entry) return;

        // A kind that declares `pick` needs a file before it can be created. The panel
        // reads the flag; it never learns which kind that is.
        let file = null;
        let payload = null;
        if (entry.pick) {
            file = await pickFile(entry.pick);
            if (!file) return;
            payload = await readAsDataUrl(file);
        }

        const created = createResourceOfKind(this.#workspace.project, kind, {
            parent: this.#folder,
            file,
            payload
        });
        if (!created) return;

        this.#workspace.select(created.id);
        this.#render();

        const tile = this.#tiles.get(created.id);
        if (tile && !entry.pick) this.#beginRename(this.#workspace.project.get(created.id), tile.name);
    }

    #render() {
        if (!this.#workspace) {
            fill(this.#grid, emptyState('folder', 'No project',
                'This window lists the resources a project declares.'));
            return;
        }

        const project = this.#workspace.project;
        if (this.#folder && !project.has(this.#folder)) this.#folder = null;

        this.#renderCrumbs();

        const shown = this.#visible();
        if (shown.length === 0) {
            this.#discardTiles(new globalThis.Set());
            this.#grid.classList.remove('grid');
            fill(this.#grid, this.#query.trim() === ''
                ? emptyState('folder', this.#folder ? 'This folder is empty' : 'No resources yet',
                    'Use + to create a scene, a folder or a component — or drop files here.')
                : el('div', {
                    class: 'none',
                    textContent: `No resource matches “${this.#query.trim()}”.`
                }));
            return;
        }

        this.#grid.classList.add('grid');
        const nodes = shown.map(resource => this.#tile(resource));
        this.#discardTiles(new globalThis.Set(shown.map(resource => resource.id)));
        fill(this.#grid, nodes);
        this.#applySelection();
    }

    /** The open folder's contents, or everything that matches a search. */
    #visible() {
        const project = this.#workspace.project;
        const needle = this.#query.trim().toLowerCase();

        if (needle === '') return project.children(this.#folder);

        return project.resources()
            .filter(resource => (resource.name || 'Untitled').toLowerCase().includes(needle));
    }

    #renderCrumbs() {
        const project = this.#workspace.project;
        const chain = this.#folder ? [...ancestors(project, this.#folder), project.get(this.#folder)] : [];

        const crumb = (label, id, here) => el('button', {
            class: `crumb${here ? ' here' : ''}`,
            type: 'button',
            textContent: label,
            onclick: () => this.#openFolder(id),
            onpointerenter: event => this.#hoverCrumb(event.currentTarget, id),
            onpointerleave: event => event.currentTarget.classList.remove('drop')
        });

        const nodes = [crumb('Project', null, chain.length === 0)];
        chain.forEach((folder, index) => {
            nodes.push(el('span', { class: 'sep', textContent: '/' }));
            nodes.push(crumb(folder?.name || 'Untitled', folder?.id ?? null, index === chain.length - 1));
        });

        fill(this.#crumbs, nodes);
    }

    #openFolder(id) {
        if (this.#folder === id) return;
        this.#cancelRename();
        this.#folder = id;
        this.#render();
    }

    /** What a resource's thumbnail shows: its picture when it has one, its glyph otherwise. */
    #thumbnail(resource) {
        const payload = resource.kind === 'asset' ? this.#workspace.project.read(resource.id) : null;
        const drawable = typeof payload === 'string'
            && payload.startsWith('data:image/');

        return el('div', { class: 'thumb' }, drawable
            ? el('img', { src: payload, alt: resource.name || 'Preview', draggable: false })
            : icon(iconForResource(resource), IconSize.MD));
    }

    #tile(resource) {
        const existing = this.#tiles.get(resource.id);
        if (existing) {
            this.#syncTile(existing);
            return existing.tile;
        }

        // The extension is not editable, so it is not in the box a creator types into: the
        // tile shows the whole name, the edit shows the base (ADR-0026 §5).
        const name = el('span', { class: 'name', textContent: resource.name || 'Untitled' });

        let wasSelected = false;

        const tile = el('div', {
            class: 'tile',
            dataset: { id: resource.id },
            title: resource.name || 'Untitled',
            onpointerdown: event => {
                this.#cancelRename();
                wasSelected = this.#workspace.selectedId === resource.id;
                // SELECTION WAITS FOR THE CLICK. Selecting on the press would be a hair
                // quicker and would break the gesture this panel exists to feed: dragging
                // a resource onto a component property selects the resource, which swaps
                // the Inspector away from the object being dropped on before the drop
                // lands. A press that turns into a drag must leave the selection alone.
                this.#armDrag(event, resource, tile);
            },
            onpointermove: event => this.#dragMove(event),
            onpointerup: event => this.#dragDrop(event),
            onpointercancel: () => this.#cancelDrag(),
            onclick: () => {
                // A click that ended a drag is not a click on a tile.
                if (this.#dragged) {
                    this.#dragged = false;
                    return;
                }

                this.#workspace.select(resource.id);
                // SECOND CLICK ON A SELECTED TILE RENAMES, after the pause that tells a
                // second click from the first half of a double-click — the same rule, and
                // the same 400 ms, the Hierarchy lives by (ADR-0026).
                if (wasSelected) this.#scheduleRename(resource, name);
            },
            ondblclick: () => {
                this.#cancelRename();
                this.#open(resource);
            },
            ondragover: event => this.#dragOver(event),
            ondrop: event => this.#dropFiles(event)
        },
            this.#thumbnail(resource),
            name
        );

        const entry = { resource, tile, name };
        this.#tiles.set(resource.id, entry);

        // Renaming from anywhere — this panel, the Inspector, a collaborator, an undo —
        // retitles the tile on every keystroke, without rebuilding the grid.
        this.track(observe(this.#workspace.project.get(resource.id), 'name', change => {
            if (name.classList.contains('editing')) return;
            name.textContent = change.value || 'Untitled';
            tile.title = change.value || 'Untitled';
        }), `tile:${resource.id}`);

        // A payload that changed — a Replace, an import — redraws the thumbnail and nothing
        // else. `revision` is exactly the signal ADR-0020 keeps it for.
        this.track(observe(this.#workspace.project.get(resource.id), 'revision', () => {
            tile.replaceChild(this.#thumbnail(resource), tile.firstElementChild);
        }), `tile:${resource.id}`);

        return tile;
    }

    /**
     * Open a resource.
     *
     * A folder walks into it. Anything else needs an editor for its kind, and the only one
     * that exists is the scene's — which is already open, and cannot be swapped yet
     * (`Workspace.open()` exists, rebinding every window does not). So this says what it
     * cannot do rather than doing nothing at all.
     */
    #open(resource) {
        if (isFolder(resource)) {
            this.#openFolder(resource.id);
            return;
        }

        this.dispatchEvent(new CustomEvent('px-open-resource', {
            detail: { resource },
            bubbles: true,
            composed: true
        }));
    }

    #discardTiles(keep) {
        for (const id of [...this.#tiles.keys()]) {
            if (keep.has(id)) continue;
            this.release(`tile:${id}`);
            this.#tiles.delete(id);
        }
    }

    #applySelection() {
        const selected = this.#workspace?.selectedId ?? null;
        const open = this.#workspace?.resource?.id ?? null;

        for (const [id, entry] of this.#tiles) {
            entry.tile.classList.toggle('selected', id === selected);

            const dot = entry.tile.querySelector('.dirty');
            const wanted = id === open && this.#workspace.dirty;
            if (wanted && !dot) entry.tile.append(el('span', { class: 'dirty', title: 'Unsaved changes' }));
            if (!wanted && dot) dot.remove();
        }
    }

    #syncTile(entry) {
        entry.name.textContent = entry.resource.name || 'Untitled';
        entry.tile.title = entry.resource.name || 'Untitled';
    }

    // --- renaming -----------------------------------------------------------------

    #scheduleRename(resource, name) {
        if (name.classList.contains('editing')) return;
        this.#cancelRename();
        this.#rename = globalThis.setTimeout(() => {
            this.#rename = null;
            if (this.#workspace.selectedId === resource.id) this.#beginRename(resource, name);
        }, RENAME_DELAY);
    }

    #cancelRename() {
        if (this.#rename === null) return;
        globalThis.clearTimeout(this.#rename);
        this.#rename = null;
    }

    #beginRename(resource, name) {
        if (!resource || name.classList.contains('editing')) return;

        // What is edited is the BASE: the extension belongs to the kind and cannot be
        // typed away (ADR-0026 §5).
        const original = baseNameOf(resource);
        name.classList.add('editing');
        name.contentEditable = 'plaintext-only';
        if (!name.isContentEditable) name.contentEditable = 'true';
        name.textContent = original;
        name.focus();
        globalThis.getSelection()?.selectAllChildren(name);

        const stop = () => {
            if (!name.classList.contains('editing')) return false;
            name.classList.remove('editing');
            name.contentEditable = 'false';
            name.onblur = null;
            name.onkeydown = null;
            return true;
        };

        const settle = () => {
            const current = this.#workspace.project.get(resource.id);
            name.textContent = current?.name || 'Untitled';
        };

        const commit = () => {
            if (!stop()) return;
            const typed = name.textContent.trim();
            const current = this.#workspace.project.get(resource.id);
            if (!current || typed === '') return settle();

            const next = withExtension(typed, current);
            if (next !== current.name) this.#workspace.project.setProperty(resource.id, 'name', next);
            settle();
        };

        name.onblur = commit;
        name.onkeydown = event => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
                name.blur();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                stop();
                settle();
                name.blur();
            }
        };
    }

    // --- dragging a tile ----------------------------------------------------------

    #armDrag(event, resource, tile) {
        if (event.button > 0) return;
        if (tile.querySelector('.name.editing')) return;

        this.#drag = {
            resource,
            tile,
            pointerId: event.pointerId,
            from: { x: event.clientX, y: event.clientY },
            started: false
        };
    }

    #dragMove(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            const travelled = Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y);
            if (travelled < DRAG_THRESHOLD) return;
            drag.started = true;
            this.#cancelRename();
            capture(drag.tile, drag.pointerId);
            drag.tile.classList.add('dragging');
            // The Editor learns what is being carried, so the viewport and the Hierarchy
            // can accept it: one payload, one vocabulary (ADR-0026 §8).
            this.dispatchEvent(new CustomEvent('px-drag-start', {
                detail: { payload: resourcePayload(drag.resource) },
                bubbles: true,
                composed: true
            }));
        }

        event.preventDefault();
        this.#markDrop(this.#dropAt(event.clientX, event.clientY));
    }

    #dragDrop(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        const started = drag.started;
        const target = started ? this.#dropAt(event.clientX, event.clientY) : null;
        const resource = drag.resource;
        this.#dragged = started;
        this.#cancelDrag();

        if (started) {
            this.dispatchEvent(new CustomEvent('px-drag-end', {
                detail: { payload: resourcePayload(resource), clientX: event.clientX, clientY: event.clientY },
                bubbles: true,
                composed: true
            }));
        }

        if (!target) return;
        performDrop(resourcePayload(resource), target.drop, this.#context());
    }

    #cancelDrag() {
        const drag = this.#drag;
        this.#drag = null;
        if (!drag) return;

        if (drag.started) {
            release(drag.tile, drag.pointerId);
            drag.tile.classList.remove('dragging');
        }
        this.#markDrop(null);
        for (const crumb of this.#crumbs?.querySelectorAll('.crumb') ?? []) crumb.classList.remove('drop');
    }

    /**
     * What the pointer is over: a folder to go into, or a rank between two tiles.
     *
     * The middle of a folder tile nests; the left and right thirds of any tile insert
     * before or after it. The same geometry the Hierarchy uses, turned on its side because
     * a grid flows across (windows/drop.js).
     */
    #dropAt(clientX, clientY) {
        const drag = this.#drag;
        if (!drag) return null;

        const project = this.#workspace.project;

        for (const entry of this.#tiles.values()) {
            if (entry.resource.id === drag.resource.id) continue;

            const box = entry.tile.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;

            const position = dropPositionAt(clientX, { top: box.left, height: box.width }, {
                canNest: isFolder(entry.resource)
            });

            if (position === DropPosition.INTO) {
                if (!canMove(project, drag.resource.id, entry.resource.id)) return null;
                return { entry, position, drop: this.#target(entry.resource.id, null) };
            }

            const siblings = project.children(this.#folder);
            const rank = siblings.indexOf(entry.resource);
            if (rank === -1) return null;

            const displayed = position === DropPosition.AFTER ? rank + 1 : rank;
            const index = insertionIndex(project.indexOf(drag.resource.id), displayed);
            return { entry, position, drop: this.#target(this.#folder, index) };
        }

        // Past the tiles: the folder that is open, appended.
        return { entry: null, position: null, drop: this.#target(this.#folder, null) };
    }

    #target(parent, index) {
        return {
            zone: DropZone.PROJECT,
            parent: parent ?? null,
            index,
            project: this.#workspace.project
        };
    }

    #markDrop(target) {
        for (const entry of this.#tiles.values()) {
            entry.tile.classList.remove('before', 'after', 'into');
        }
        if (!target?.entry) return;

        entryClass(target).classList.add(target.position === DropPosition.INTO ? 'into' : target.position);
    }

    /** A drag held over a breadcrumb moves the resource there when it is released. */
    #hoverCrumb(button, id) {
        const drag = this.#drag;
        if (!drag?.started) return;
        if (!canMove(this.#workspace.project, drag.resource.id, id)) return;

        button.classList.add('drop');
        button.onpointerup = () => {
            const resource = drag.resource;
            this.#cancelDrag();
            performDrop(resourcePayload(resource), this.#target(id, null), this.#context());
        };
    }

    // --- files from outside the browser -------------------------------------------

    #dragOver(event) {
        if (!carriesFiles(event)) return;

        // `preventDefault` is what tells the browser this is a drop target at all; without
        // it the page navigates to the file and the Editor disappears.
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        this.classList.add('importing');
    }

    async #dropFiles(event) {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        this.classList.remove('importing');

        const payload = await readDroppedFiles(event);
        if (!payload) return;

        performDrop(payload, this.#target(this.#folder, null), this.#context());
    }

    /** What a rule needs to act: the model, never the DOM. */
    #context() {
        return {
            project: this.#workspace.project,
            workspace: this.#workspace,
            scene: this.scene,
            folder: this.#folder,
            select: object => this.selection?.set(object)
        };
    }

    /** Whether a drop would be accepted here — asked by the shell for the cursor. */
    accepts(payload) {
        return canDrop(payload, this.#target(this.#folder, null)).allowed;
    }
}

/** The tile element a drop marker goes on. */
function entryClass(target) {
    return target.entry.tile;
}

/** The folders above one, outermost first. Local, because the panel only draws them. */
function ancestors(project, id) {
    const chain = [];
    const seen = new globalThis.Set();

    let parent = project.get(id)?.parent ?? null;
    while (parent && !seen.has(parent)) {
        seen.add(parent);
        const folder = project.get(parent);
        if (!folder) break;
        chain.unshift(folder);
        parent = folder.parent ?? null;
    }
    return chain;
}

/**
 * Take pointer capture, tolerating a pointer that is already gone.
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

customElements.define('px-project', Project);
