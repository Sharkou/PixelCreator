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
import { DropPosition, dropPositionAt } from './drop.js';
import { previewSlots, rankAtPoint } from '../dnd/reflow.js';
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
            gap: var(--px-space-1);
            padding: 0 var(--px-space-1);
            height: var(--px-control);
            border-radius: var(--px-radius-sm);
            color: var(--px-text-muted);
            background: none;
            border: none;
            font: inherit;
            font-size: var(--px-text-xs);
            /* A crumb IS a button — it walks somewhere — so it says so. The panel used
               to draw every one of them with a default cursor, which is the mark of a
               label, on a control that navigates. */
            cursor: pointer;
        }

        .crumbs .crumb:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }

        /* The folder being looked at is not a place to go, so it is not a button: it is
           the title of the view, and it reads as one. */
        .crumbs .crumb.here {
            color: var(--px-text-strong);
            font-weight: var(--px-weight-medium);
            cursor: default;
        }

        .crumbs .crumb.here:hover { background: none; }
        .crumbs .crumb .glyph { display: flex; color: var(--px-text-dim); }
        .crumbs .crumb.here .glyph { color: var(--px-accent); }
        .crumbs .crumb.drop { background: var(--px-accent-muted); color: var(--px-text-strong); }

        /* A chevron rather than a slash: the trail points somewhere, and a slash reads as
           a path a creator could type — which this is not, because the model has no paths
           (ADR-0025). */
        .crumbs .sep {
            display: flex;
            align-items: center;
            color: var(--px-border-subtle);
            flex: 0 0 auto;
        }

        /* ── the grid ───────────────────────────────────────────────────── */

        /* Auto-filled tiles at the prototype's density: 62 px minimum, one gap step. The
           surface takes the whole window so a click below the last tile still lands on the
           panel — that empty space is what deselects. */
        /* THE SURFACE IS ALWAYS THE WHOLE CONTENT AREA. It used to be the grid that
           carried the height, and the empty branch takes the grid class off — so an
           empty project accepted a file only on the words telling it to drop one.
           Height belongs to the container, layout belongs to the class. */
        /* At least the height of the body, never less, and growing with its content. */
        .content {
            display: flex;
            flex-direction: column;
            min-height: 100%;
        }

        /* It GROWS with its tiles and SHRINKS to the panel when it has none. With the
           old flex-shrink of zero an empty folder's message set the height and the body
           scrolled past it — a scrollbar shown for nothing. */
        .surface {
            box-sizing: border-box;
            flex: 1 1 auto;
            min-height: 0;
            padding: var(--px-space-2);
        }

        /* Nothing to list: the message takes the whole surface and centres in it, rather
           than being a block the surface has to be tall enough to hold. */
        .surface:not(.grid) { display: flex; flex-direction: column; padding: 0; }

        .surface.grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
            gap: var(--px-space-1);
            align-content: start;
        }

        .tile {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: var(--px-space-1);
            padding: var(--px-space-1);
            border-radius: var(--px-radius-md);
            border: 1px solid transparent;
            /* A tile opens, selects, renames and drags. The default cursor is that of a
               label; this is a card a creator acts on. */
            cursor: pointer;
            -webkit-user-select: none;
            user-select: none;
        }

        .tile:hover { background: var(--px-surface-raised); border-color: var(--px-border-subtle); }
        .tile.selected { background: var(--px-accent-muted); border-color: var(--px-accent); }

        /* THE CHECKERBOARD IS PART OF THE ASSET, NOT PART OF THE TILE. It says which
           pixels are transparent, so covering it with the hover or selection tint would
           answer a question about the picture with a fact about the pointer. The thumb
           paints its own ground, and these two rules keep it doing that in both states. */
        .tile:hover .thumb, .tile.selected .thumb { background-color: var(--px-surface-sunken); }

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

        /* THE GRID REORGANISES UNDER THE POINTER (ADR-0028 §1). Tiles are a flat list, so
           they ask one question — at what rank? — and a flat list may answer it in place:
           the carried tile follows the hand and the others slide into the slots they would
           hold, so the drop CONFIRMS something already visible instead of revealing it.
           Nothing here writes: the offsets come from dnd/reflow.js and die with the
           gesture. The Hierarchy does the opposite, and says why in windows/hierarchy.js. */
        .tile.dragging {
            z-index: 2;
            opacity: 0.9;
            border-color: var(--px-accent);
            pointer-events: none;
        }

        /* Only the tiles that step aside animate. The carried one tracks the pointer and
           must not lag a frame behind the hand holding it. */
        .tile.sliding { transition: transform var(--px-duration) var(--px-ease); }

        /* Dropping INTO a folder is the other answer, and it is not a rank — so it is not
           drawn as one. */
        .tile.into { box-shadow: inset 0 0 0 2px var(--px-accent); }

        /* A file being dragged in from outside: the WHOLE window says so, because the
           whole window accepts it. The outline used to sit on the grid, which was also
           the only element listening — so a file held over the breadcrumb, over the
           search bar, or over an empty project's message was over nothing at all. Both
           the listener and the mark are now the window itself. */
        :host(.importing) { outline: 2px dashed var(--px-accent); outline-offset: -3px; }

        /* Something carried from another panel, hovering here. The shell decides which
           window is the target and marks it; every window styles that one class, so the
           answer cannot differ between them (ADR-0028 §3). */
        :host(.dnd-over) { outline: 2px solid var(--px-accent); outline-offset: -3px; }
        :host(.dnd-refused) { outline: 2px solid var(--px-danger); outline-offset: -3px; }

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

        // ONE LISTENER, ON THE WINDOW ITSELF. A file from the desktop may be released on
        // a tile, on the gap between two, on the padding below the last one, on the
        // breadcrumb, on the search bar, or on the words an empty project shows — and all
        // of those are "the Project panel" to the person holding the file. Events from a
        // shadow root retarget to the host, so the host is the one place that hears every
        // one of them (ADR-0026 §6).
        this.addEventListener('dragover', event => this.#dragOver(event));
        this.addEventListener('dragleave', event => this.#dragLeave(event));
        this.addEventListener('drop', event => this.#dropFiles(event));

        if (!this.#workspace) return;

        this.track(this.#workspace.project.operations.on('operation', () => this.#render()));
        for (const event of ['opened', 'closed', 'saved', 'dirty']) {
            this.track(this.#workspace.on(event, () => this.#render()));
        }
        this.track(this.#workspace.on('selection', () => this.#applySelection()));

        // TWO KEYS, AND THEY ARE THE TWO GESTURES THIS PANEL HAS. `F2` renames now — the
        // shortcut the Hierarchy already answers to — and `Enter` OPENS, which is what a
        // creator who has walked a list with the keyboard expects: a folder is walked
        // into, anything else opens its editor. They are the keyboard's spelling of the
        // second click and of the double-click, so there is no third gesture to learn.
        const onKey = event => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key !== 'F2' && event.key !== 'Enter') return;
            // A field being typed into owns its own Enter, including the rename box.
            if (isEditing()) return;

            const resource = this.#workspace.selected;
            const tile = resource ? this.#tiles.get(resource.id) : null;
            if (!tile) return;

            event.preventDefault();
            this.#cancelRename();
            if (event.key === 'Enter') this.#open(resource);
            else this.#beginRename(resource, tile.name);
        };
        globalThis.addEventListener('keydown', onKey);
        this.track(() => globalThis.removeEventListener('keydown', onKey));

        this.#render();
    }

    #build() {
        this.#grid = el('div', {
            class: 'surface grid',
            // The empty space between and below the tiles is a real target: clicking it
            // deselects, the same gesture the Hierarchy and the viewport answer to.
            onpointerdown: event => {
                if (event.target !== this.#grid) return;
                this.#cancelRename();
                this.#workspace?.select(null);
            },
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
            el('div', { class: 'content' }, this.#search.bar, this.#crumbs, this.#grid)
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

        const crumb = (label, id, here, glyph) => {
            const button = el('button', {
                class: `crumb${here ? ' here' : ''}`,
                type: 'button',
                title: here ? label : `Go to ${label}`,
                onclick: () => this.#openFolder(id),
                onpointerenter: event => this.#hoverCrumb(event.currentTarget, id),
                onpointerleave: event => event.currentTarget.classList.remove('drop')
            },
                el('span', { class: 'glyph' }, icon(glyph, 16)),
                el('span', { textContent: label })
            );

            // A crumb NAMES A FOLDER, so a folder renamed anywhere retitles it on the
            // keystroke — the same rule the tiles and the Inspector live by (ADR-0026 §3).
            if (id) {
                const entry = project.get(id);
                if (entry) {
                    this.track(observe(entry, 'name', change => {
                        button.lastElementChild.textContent = change.value || 'Untitled';
                    }), 'crumbs');
                }
            }
            return button;
        };

        this.release('crumbs');
        const nodes = [crumb('Project', null, chain.length === 0, 'folder')];
        chain.forEach((folder, index) => {
            nodes.push(el('span', { class: 'sep' }, icon('chevron', 16)));
            nodes.push(crumb(folder?.name || 'Untitled', folder?.id ?? null,
                index === chain.length - 1, 'folder'));
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

            // The layout as it is BEFORE anything slides. Measuring live would read a tile
            // mid-transition, so the rank would depend on how far the previous answer had
            // got to drawing itself.
            // FROM THE DOM, NOT FROM THE MAP. Tiles survive a re-render keyed by id, so
            // the Map keeps the order they were FIRST seen in — which stops matching the
            // grid the moment a resource is moved. What the creator is aiming at is what
            // is on screen.
            drag.tiles = [...this.#grid.querySelectorAll('.tile')];
            drag.boxes = drag.tiles.map(tile => {
                const box = tile.getBoundingClientRect();
                return { x: box.left, y: box.top, width: box.width, height: box.height };
            });
            drag.index = drag.tiles.indexOf(drag.tile);
            drag.shown = null;

            drag.tile.classList.add('dragging');
            // The Editor learns what is being carried, so the viewport and the Hierarchy
            // can accept it: one payload, one vocabulary (ADR-0026 §8).
            this.dispatchEvent(new CustomEvent('px-drag-start', {
                detail: {
                    payload: resourcePayload(drag.resource),
                    clientX: event.clientX,
                    clientY: event.clientY
                },
                bubbles: true,
                composed: true
            }));
        }

        event.preventDefault();

        const target = this.#dropAt(event.clientX, event.clientY);
        this.#markDrop(target);
        // NESTING AND REORDERING ARE TWO ANSWERS, AND ONLY ONE OF THEM IS A RANK. Over the
        // middle of a folder the question is "into what?", so the grid holds still and the
        // folder is outlined; anywhere else it is "at what rank?", and the grid answers by
        // showing it.
        if (target?.position === DropPosition.INTO) this.#clearPreview({ keepCarried: true });
        else this.#preview(event.clientX, event.clientY);

        // The shell follows the pointer with the ghost and asks the rules what a drop
        // here would mean. It cannot read this window pointer events, so the drag says
        // where it is — the same way it said that it started.
        this.dispatchEvent(new CustomEvent('px-drag-move', {
            detail: { clientX: event.clientX, clientY: event.clientY },
            bubbles: true,
            composed: true
        }));
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

    /**
     * Show the grid as it would be, without changing it (ADR-0028 §§1-2).
     *
     * Nothing here writes: the offsets come from dnd/reflow.js, they live on the tiles as
     * transforms, and the gesture ending removes them. A cancelled drag is therefore not
     * an undo, because there was never anything to undo.
     *
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     */
    #preview(clientX, clientY) {
        const drag = this.#drag;
        if (!drag?.boxes || drag.index === -1) return;

        const to = rankAtPoint({ x: clientX, y: clientY }, drag.boxes);
        if (to !== drag.shown) {
            drag.shown = to;
            const offsets = previewSlots(drag.boxes, drag.index, to);

            drag.tiles.forEach((tile, i) => {
                // The carried tile follows the pointer instead of its computed slot: it is
                // the one thing the creator is actually holding.
                if (i === drag.index) return;
                tile.classList.add('sliding');
                tile.style.transform = offsets[i].dx === 0 && offsets[i].dy === 0
                    ? ''
                    : `translate(${offsets[i].dx}px, ${offsets[i].dy}px)`;
            });
        }

        drag.tile.style.transform =
            `translate(${clientX - drag.from.x}px, ${clientY - drag.from.y}px)`;
    }

    /**
     * Put every tile back where the model says it is.
     * @param {object} [options] - Options
     * @param {boolean} [options.keepCarried] - Leave the carried tile under the pointer
     */
    #clearPreview({ keepCarried = false } = {}) {
        const drag = this.#drag;
        for (const entry of this.#tiles.values()) {
            if (keepCarried && entry.tile === drag?.tile) continue;
            entry.tile.classList.remove('sliding');
            entry.tile.style.transform = '';
        }
        if (drag) drag.shown = null;
    }

    #cancelDrag() {
        const drag = this.#drag;
        this.#clearPreview();
        this.#drag = null;
        if (!drag) return;

        if (drag.started) {
            release(drag.tile, drag.pointerId);
            drag.tile.classList.remove('dragging', 'sliding');
            drag.tile.style.transform = '';
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

        // A FOLDER IS THE ONE TARGET THAT IS NOT A RANK. Over the middle of a folder tile
        // the question is "into what?", and its answer changes where the resource lives
        // rather than where it sits — so it is resolved first, and separately.
        for (const entry of this.#tiles.values()) {
            if (entry.resource.id === drag.resource.id) continue;
            if (!isFolder(entry.resource)) continue;

            const box = entry.tile.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;

            const position = dropPositionAt(clientX, { top: box.left, height: box.width }, { canNest: true });
            if (position !== DropPosition.INTO) continue;
            if (!canMove(project, drag.resource.id, entry.resource.id)) return null;
            return { entry, position, drop: this.#target(entry.resource.id, null) };
        }

        // Anywhere else in the open folder: a rank, read the way the preview reads it.
        //
        // NO insertionIndex() HERE, AND THAT IS THE SUBTLE PART. That helper converts a
        // rank counted in the list WITH the carried tile still in it. `rankAtPoint()`
        // counts ranks in the RESULTING order — dnd/reflow.js is splice-out-then-splice-in,
        // which is exactly what `Project.#place()` does with the rank it is given — so the
        // number is already the one the model wants. Adjusting it again turned every
        // forward move into a no-op.
        if (!drag.boxes || drag.index === -1) return null;

        const rank = rankAtPoint({ x: clientX, y: clientY }, drag.boxes);
        if (rank === drag.index) return null;

        // The tiles on screen are the open folder's children, in model order — unless a
        // search is showing everything, in which case a rank on screen means nothing.
        if (this.#query.trim() !== '') return null;

        return { entry: null, position: null, drop: this.#target(this.#folder, rank) };
    }

    /**
     * The target a drop at this point would use, for a drag this window does not own.
     *
     * The shell asks while a payload from ANOTHER window is overhead, so it cannot go
     * through the reorder path — that one needs a resource of its own to move. The
     * open folder, appended, is what any foreign payload would land in.
     *
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object|null} A target for the rules, or null without a project
     */
    dropTargetAt(clientX, clientY) {
        if (!this.#workspace) return null;
        return this.#target(this.#folder, null);
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

    /**
     * Drop the import mark, but only when the pointer really left the window.
     *
     * `dragleave` fires on every boundary INSIDE the window too — crossing from the
     * breadcrumb onto a tile is a leave and an enter — so a naive handler makes the
     * outline flicker its way across the panel. `relatedTarget` is where the pointer went;
     * anything still inside is not a departure.
     */
    #dragLeave(event) {
        if (event.relatedTarget && this.contains(event.relatedTarget)) return;
        this.classList.remove('importing');
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
 * Whether the creator is typing, in which case a key belongs to the field.
 *
 * Walks into shadow roots, because the box being typed into is inside one and
 * `document.activeElement` alone only ever reports the window — the same guard
 * `editor.js` and `windows/graph.js` use, for the same reason.
 *
 * @returns {boolean} True when a text control has focus
 */
function isEditing() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;

    if (!element) return false;
    if (element.isContentEditable) return true;
    return element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA';
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
