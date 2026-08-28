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
import { openMenu, pointAnchor } from '../ui/menu.js';
import { capturePointer as capture, releasePointer as release } from '../ui/gesture.js';
import { searchField } from '../ui/search-field.js';
import { createId, observe } from '../../core/mod.js';
import { baseNameOf, canMove, isFolder, withExtension } from '../../project/mod.js';
import { createResourceOfKind, resourceKind, resourceMenuItems } from '../project/commands.js';
import { pickFile, readAsDataUrl } from '../ui/file.js';
import { DropZone, resourcePayload } from '../dnd/payload.js';
import { canDrop, performDrop } from '../dnd/rules.js';
import { carriesFiles, readDroppedFiles } from '../dnd/files.js';
import { DropPosition, dropPositionAt } from './drop.js';
import { previewSlots, rankAtPoint } from '../dnd/reflow.js';
import { foldTrail } from '../ui/trail.js';
import { isEditing } from '../ui/focus.js';
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

        /* IT COLLAPSES, IT DOES NOT SCROLL. A horizontal scrollbar inside a 26 px strip is
           a control nobody finds, and hiding the overflow instead would put the folders
           the creator is actually in beyond reach. So the trail keeps its ends — the root
           and the folder being looked at, plus its parent — and folds the middle into one
           button that lists what it swallowed (see renderCrumbs). Nothing becomes
           unreachable: everything the fold hides is one click away inside it. */
        .crumbs {
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
            padding: 0 var(--px-space-1);
            height: var(--px-row);
            flex: 0 0 auto;
            border-bottom: 1px solid var(--px-border);
            overflow: hidden;
            white-space: nowrap;
            -webkit-user-select: none;
            user-select: none;
        }

        /* The last crumb is the one that may be squeezed: a long folder name should
           shorten rather than push the trail off the edge. */
        .crumbs .crumb.here { min-width: 0; }
        .crumbs .crumb.here span:last-child { overflow: hidden; text-overflow: ellipsis; }

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
        /* A CRUMB IS A DROP TARGET, and it wears the same mark every other one does: a
           dashed outline in the accent (ADR-0028 §3). It is the only way OUT of a folder,
           so it cannot be the one target with feedback of its own invention. */
        .crumbs .crumb.drop {
            background: var(--px-accent-muted);
            color: var(--px-text-strong);
            outline: 1px dashed var(--px-accent);
            outline-offset: -1px;
        }

        /* A chevron rather than a slash: the trail points somewhere, and a slash reads as
           a path a creator could type — which this is not, because the model has no paths
           (ADR-0025). */
        /* The fold: a quiet ellipsis that opens the folders it swallowed. */
        .crumbs .crumb.folded {
            padding: 0 var(--px-space-1);
            font-weight: var(--px-weight-bold);
            letter-spacing: 1px;
        }

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

        /* THE CHECKERBOARD IS FOR TRANSPARENCY, AND ONLY FOR IT. It is the one place in the
           Editor that draws what is see-through, so it belongs under a picture and nowhere
           else — a folder, a scene or a .px file has no transparency to report, and squares
           behind their glyph said something untrue about them while making the glyph itself
           harder to read. The .picture class is what carries it now. */
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
        }

        .thumb.picture {
            background-image:
                linear-gradient(45deg, var(--px-surface-raised) 25%, transparent 25%, transparent 75%, var(--px-surface-raised) 75%),
                linear-gradient(45deg, var(--px-surface-raised) 25%, transparent 25%, transparent 75%, var(--px-surface-raised) 75%);
            background-size: 8px 8px;
            background-position: 0 0, 4px 4px;
        }

        /* A GLYPH IS THE SUBJECT OF ITS TILE, not a placeholder in the corner of one. On a
           ground with nothing behind it, it can be drawn at the size the tile deserves. */
        .thumb > .glyph {
            display: flex;
            transform: scale(1.7);
            color: var(--px-text-dim);
        }

        .tile:hover .thumb > .glyph { color: var(--px-text); }
        .tile.selected .thumb > .glyph { color: var(--px-accent); }

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
        /* Dashed, like every other drop mark in the Editor: the outline and the badge on
           the cursor are one statement (ADR-0028 §3). */
        .tile.into { outline: 2px dashed var(--px-accent); outline-offset: -2px; }

        /* A file being dragged in from outside: the WHOLE window says so, because the
           whole window accepts it. The outline used to sit on the grid, which was also
           the only element listening — so a file held over the breadcrumb, over the
           search bar, or over an empty project's message was over nothing at all. Both
           the listener and the mark are now the window itself. */
        :host(.importing) { outline: 2px dashed var(--px-accent); outline-offset: -3px; }

        /* Something carried from another panel, hovering here. The shell decides which
           window is the target and marks it; every window styles that one class, so the
           answer cannot differ between them (ADR-0028 §3). */
        :host(.dnd-over) { outline: 2px dashed var(--px-accent); outline-offset: -3px; }
        :host(.dnd-refused) { outline: 2px dashed var(--px-danger); outline-offset: -3px; }

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
     * @param {object} [context.subject] - Where a selection INTENT is announced (ADR-0032)
     * @returns {Project} This element
     */
    bind({ workspace, scene = null, selection = null, subject = null }) {
        this.#workspace = workspace;
        this.scene = scene;
        this.selection = selection;
        this.subject = subject;
        return this;
    }

    /**
     * Announce that the creator is working on a resource, or on nothing.
     *
     * ONE CALL, AND THE OBJECT SELECTION FOLLOWS (ADR-0032). This panel used to clear the
     * object holder itself, next to every `workspace.select()`.
     *
     * @param {string|null} id - The ResourceId, or null for nothing
     */
    #announce(id) {
        if (this.subject) this.subject.resource(id);
        else this.#workspace?.select(id);
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
                // ONE INTENTION. Clearing one holder announces nothing when it was already
                // empty, so the other panel used to keep a selection this click was meant
                // to drop — the reason now lives in `subject.js`, once (ADR-0032).
                this.#announce(null);
            },
            // RIGHT-CLICK CREATES WHERE YOU CLICKED. The `+` button has always opened this
            // menu; a creator looking for "new folder here" reaches for the pointer, not
            // for a toolbar at the other end of the panel. Same list, same primitive, and
            // the folder it creates in is the one the panel is showing (ADR-0026 §10).
            oncontextmenu: event => {
                event.preventDefault();
                this.#cancelRename();
                this.#openCreateMenu(pointAnchor(event.clientX, event.clientY));
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

        this.#announce(created.id);
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

    /**
     * The trail, folded when it is longer than the strip can hold.
     *
     * WHAT A DEEP TRAIL MUST NOT DO: scroll sideways, or hide its far end. `ui/trail.js`
     * says which steps survive; this draws them. Nothing becomes unreachable — the fold
     * lists what it swallowed, in the same dropdown every other menu opens.
     */
    #renderCrumbs() {
        const project = this.#workspace.project;
        const chain = this.#folder ? [...ancestors(project, this.#folder), project.get(this.#folder)] : [];

        this.release('crumbs');

        const nodes = [this.#crumb('Project', null, chain.length === 0)];
        for (const step of foldTrail(chain)) {
            nodes.push(el('span', { class: 'sep' }, icon('chevron', 16)));
            nodes.push(step.folded
                ? this.#foldedCrumb(step.hidden)
                : this.#crumb(step.folder?.name || 'Untitled', step.folder?.id ?? null, step.here));
        }

        fill(this.#crumbs, nodes);
    }

    /**
     * One step of the trail.
     *
     * IT IS ALSO A DROP TARGET, and that is what makes a resource able to leave a folder:
     * the grid below only ever holds the folder being looked at, so the way OUT has to be
     * the trail. `#dropAt()` resolves it like any other target, which is why the mark, the
     * ghost and the cursor are the same here as anywhere else (ADR-0028 §3).
     *
     * @param {string} label - What it is called
     * @param {string|null} id - The folder it walks to; null for the top level
     * @param {boolean} here - Whether it is the folder being looked at
     * @returns {HTMLElement} The crumb
     */
    #crumb(label, id, here) {
        const button = el('button', {
            class: `crumb${here ? ' here' : ''}`,
            type: 'button',
            title: here ? label : `Go to ${label}`,
            dataset: { crumb: id ?? '' },
            onclick: () => this.#openFolder(id)
        },
            el('span', { class: 'glyph' }, icon('folder', 16)),
            el('span', { textContent: label })
        );

        // A crumb NAMES A FOLDER, so a folder renamed anywhere retitles it on the
        // keystroke — the same rule the tiles and the Inspector live by (ADR-0026 §3).
        const record = id ? this.#workspace.project.get(id) : null;
        if (record) {
            this.track(observe(record, 'name', change => {
                button.lastElementChild.textContent = change.value || 'Untitled';
            }), 'crumbs');
        }

        return button;
    }

    /** The button standing in for the folders the trail could not show. */
    #foldedCrumb(hidden) {
        const button = el('button', {
            class: 'crumb folded',
            type: 'button',
            title: `${hidden.length} more folder${hidden.length === 1 ? '' : 's'}`,
            'aria-label': 'Show the folders in between',
            onclick: () => openMenu(
                button,
                hidden.map(folder => ({
                    id: folder?.id ?? '',
                    label: folder?.name || 'Untitled',
                    icon: 'folder'
                })),
                id => this.#openFolder(id || null),
                { label: 'folders' }
            )
        }, el('span', { textContent: '…' }));

        return button;
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

        // THE CHECKERBOARD ONLY UNDER A PICTURE (see the sheet): it reports transparency,
        // and a folder has none to report. Everything else shows its own glyph, larger,
        // on the plain ground — the same glyph the rest of the Editor gives that kind
        // (`iconForResource`), never a second set.
        return drawable
            ? el('div', { class: 'thumb picture' },
                el('img', { src: payload, alt: resource.name || 'Preview', draggable: false }))
            : el('div', { class: 'thumb' },
                el('span', { class: 'glyph' }, icon(iconForResource(resource), IconSize.MD)));
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

                this.#announce(resource.id);
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
        // NEVER OVERWRITE WHAT IS BEING TYPED INTO. A rename writes on every keystroke, and
        // every write is an Operation that redraws this panel — so setting `textContent`
        // here put the caret back at the start of the box after each character. The rule is
        // the one the Hierarchy and `px-field` already live by: the view that has the edit
        // owns its own text until the edit ends.
        if (!entry.name.classList.contains('editing')) {
            entry.name.textContent = entry.resource.name || 'Untitled';
        }
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

    /**
     * Edit a name in place.
     *
     * IT WRITES ON EVERY KEYSTROKE, and that is the fix rather than a preference. Renaming
     * from the Inspector moved every other view on each letter; renaming from HERE waited
     * for blur, so the Project panel was the one place in the Editor where a name did not
     * propagate as it was typed — which read as "Project to Inspector is broken" when what
     * was broken was this window's idea of when a rename happens. One model, one behaviour,
     * whichever view the creator is typing into (ADR-0026 §3).
     *
     * ELEVEN KEYSTROKES ARE STILL ONE UNDO. The typing session mints a `batch` on entry and
     * drops it on exit, which is the mechanism the operation format already carries
     * (ADR-0024 §4) — no debounce, no second history.
     *
     * WHAT IS EDITED IS THE BASE: the extension belongs to the kind and cannot be typed
     * away (ADR-0026 §4), so every write goes through `withExtension()`.
     *
     * @param {object} resource - The manifest entry being renamed
     * @param {HTMLElement} name - The tile's name element
     */
    #beginRename(resource, name) {
        if (!resource || name.classList.contains('editing')) return;

        const project = this.#workspace.project;
        const original = project.get(resource.id)?.name ?? '';
        const base = baseNameOf(resource);
        const batch = createId();

        name.classList.add('editing');
        name.contentEditable = 'plaintext-only';
        if (!name.isContentEditable) name.contentEditable = 'true';
        name.textContent = base;
        name.focus();
        globalThis.getSelection()?.selectAllChildren(name);

        // Leaving edit mode is its own step, called directly by whatever ended the edit —
        // not a side effect of blur. `blur()` only fires when the element actually held
        // focus, and a tile that keeps `editing` because focus went somewhere unexpected is
        // a tile that has stopped answering to the model. The Hierarchy learned this first.
        const finish = () => {
            if (!name.classList.contains('editing')) return;
            name.classList.remove('editing');
            name.contentEditable = 'false';
            name.oninput = null;
            name.onblur = null;
            name.onkeydown = null;

            const current = project.get(resource.id);
            name.textContent = current?.name || 'Untitled';
        };

        const write = typed => {
            const current = project.get(resource.id);
            if (!current) return;

            // An empty box is a name being cleared, not a name of nothing: the model keeps
            // what it had until there is something to put there.
            if (typed === '') return;

            const next = withExtension(typed, current);
            if (next !== current.name) project.setProperty(resource.id, 'name', next, { batch });
        };

        name.oninput = () => write(name.textContent.trim());
        name.onblur = finish;
        name.onkeydown = event => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                write(name.textContent.trim());
                name.blur();
                finish();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                // As it was when the edit began — through the model, so every view follows
                // and the whole session still collapses into one history entry.
                if (project.get(resource.id)?.name !== original) {
                    project.setProperty(resource.id, 'name', original, { batch });
                }
                name.blur();
                finish();
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

        // THREE THINGS, AND THEY ARE NOT THE SAME THING. `#markDrop` says what is under the
        // pointer, `#preview` reflows the grid behind it, and this moves what the creator is
        // HOLDING. They used to be two: the follow lived at the end of `#preview`, so over a
        // folder — where the grid deliberately holds still — the carried tile stopped
        // following and hung at the position it had when the pointer arrived.
        this.#carry(event.clientX, event.clientY);

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

    }

    /**
     * Move the tile the creator is holding to where the pointer is.
     *
     * Apart from the grid's own reflow, because the two answer different questions and only
     * one of them ever stops: what is carried follows the pointer for the whole gesture.
     *
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     */
    #carry(clientX, clientY) {
        const drag = this.#drag;
        if (!drag?.tile) return;

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
            // THE CLASS STAYS WHILE THE GESTURE DOES. Taking `sliding` off in the same
            // frame as the transform makes the tiles SNAP back the instant the pointer
            // crosses a folder — which is what read as the grid getting stuck. They are
            // going home either way; they may as well travel.
            if (!drag) entry.tile.classList.remove('sliding');
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
            drag.tile.classList.remove('dragging');
            drag.tile.style.transform = '';
        }
        // Now that the gesture is over, the transitions come off too — a re-render must
        // not animate tiles into the places the model has just put them.
        for (const entry of this.#tiles.values()) entry.tile.classList.remove('sliding');
        this.#markDrop(null);
    }

    /**
     * What the pointer is over: a folder to go into, a crumb to come out to, or a rank.
     *
     * THE WAY OUT IS THE TRAIL, and it is resolved here rather than by a handler bolted to
     * a button. The grid only ever shows one folder's children, so "move this up a level"
     * has no target among the tiles — it has to be the breadcrumb. It used to be, through
     * an `onpointerup` the hover handler attached to the crumb, which meant the crumb was
     * the one drop target in the Editor with no ghost, no cursor and no shared mark. Now
     * it is a row in the same resolution as everything else (ADR-0028 §3).
     *
     * The order is the rule: crumbs first — they sit above the grid and never overlap it —
     * then folders, which answer "into what?", then a rank among the tiles.
     */
    #dropAt(clientX, clientY) {
        const drag = this.#drag;
        if (!drag) return null;

        const project = this.#workspace.project;

        // --- out of this folder, through the trail --------------------------------------
        for (const crumb of this.#crumbs?.querySelectorAll('.crumb[data-crumb]') ?? []) {
            const box = crumb.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;

            const parent = crumb.dataset.crumb || null;
            // The folder already being looked at is not a move; it is where the resource is.
            if (parent === (this.#folder ?? null)) return null;
            if (!canMove(project, drag.resource.id, parent)) return null;

            return { crumb, position: null, drop: this.#target(parent, null) };
        }

        // --- into a folder ---------------------------------------------------------------
        //
        // A FOLDER IS THE ONE TARGET THAT IS NOT A RANK. Over the middle of a folder tile
        // the question is "into what?", and its answer changes where the resource lives
        // rather than where it sits — so it is resolved separately.
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

        // --- a rank in the open folder -----------------------------------------------------
        //
        // NO insertionIndex() HERE, AND THAT IS THE SUBTLE PART. That helper converts a
        // rank counted in the list WITH the carried tile still in it. `rankAtPoint()`
        // counts ranks in the RESULTING order — dnd/reflow.js is splice-out-then-splice-in,
        // which is exactly what `Project.#place()` does with the rank it is given — so the
        // number is already the one the model wants. Adjusting it again turned every
        // forward move into a no-op.
        if (!drag.boxes || drag.index === -1) return null;

        // The tiles on screen are the open folder's children, in model order — unless a
        // search is showing everything, in which case a rank on screen means nothing.
        if (this.#query.trim() !== '') return null;

        const rank = rankAtPoint({ x: clientX, y: clientY }, drag.boxes);
        if (rank === drag.index) return null;

        return { entry: null, position: null, drop: this.#target(this.#folder, rank) };
    }

    /**
     * The target a drop at this point would use, for a drag this window does not own.
     *
     * The shell asks while a payload from ANOTHER window is overhead, so it cannot go
     * through the reorder path — that one needs a resource of its own to move. A crumb
     * still answers, because importing a file into the folder above is as reasonable a
     * gesture as importing into this one.
     *
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object|null} A target for the rules, or null without a project
     */
    dropTargetAt(clientX, clientY) {
        if (!this.#workspace) return null;

        for (const crumb of this.#crumbs?.querySelectorAll('.crumb[data-crumb]') ?? []) {
            const box = crumb.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;
            return this.#target(crumb.dataset.crumb || null, null);
        }

        for (const entry of this.#tiles.values()) {
            if (!isFolder(entry.resource)) continue;

            const box = entry.tile.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;
            return this.#target(entry.resource.id, null);
        }

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
        for (const crumb of this.#crumbs?.querySelectorAll('.crumb') ?? []) {
            crumb.classList.remove('drop');
        }

        if (target?.crumb) {
            target.crumb.classList.add('drop');
            return;
        }
        if (!target?.entry) return;

        target.entry.tile.classList.add(target.position === DropPosition.INTO ? 'into' : target.position);
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

customElements.define('px-project', Project);
