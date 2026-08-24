// <px-inspector> — the selected object, and everything on it.
//
// ZERO KNOWLEDGE OF CONCRETE COMPONENTS. There is no `if (type === 'Transform')` here and
// there must never be one: what to show comes from `componentSchema()`, and from
// reflection when a component declares none (ADR-0007). A component a creator writes
// tomorrow — including one built from a definition, which always has a schema
// (ADR-0016) — inspects correctly without this file changing. Even the paired Position
// and Size rows come from a table of property names, not from a table of component types.
//
// Rebuilt on selection and on the scene's component events; individual values are not
// rebuilt at all, because each `<px-field>` is bound to its own property and updates
// itself. Editing `x` does not re-render the panel, which is what keeps focus and caret
// where the creator put them.
//
// ONE ROW PRIMITIVE, AND IT LIVES HERE. Every property is `.row > .label + .fields`,
// whether the value is one number, two, a colour or a switch. `<px-field>` is the cell
// that goes in the second column and nothing more — it used to draw its own label and its
// own copy of this grid, which meant the same layout was declared twice, in two shadow
// roots, kept in step by a shared token. `.fields` is flexible by default, two equal
// cells for a pair, and two equal cells with the second held open and empty for a lone
// number — which is what makes Rotation end exactly where the X of Position ends.
//
// THE SECTION TITLE IS THE MENU HEADING. `Rendering` in the Add Component dropdown and
// `Rectangle Renderer` over a section are set in the same type, deliberately: the
// dropdown is the piece of this Editor whose hierarchy already reads correctly, so it is
// the reference rather than a second opinion.
//
// WHAT IS DELIBERATELY NOT HERE. The object's `visible` and `lock` live in the Hierarchy
// row, where every object has them at once; repeating them would be two controls for one
// value and twice the panel to read. The object's id is not shown at all — a creator does
// not need it, and a panel that opens with a random string looks like a debugger.

import { isMissingComponent, makeReactive, observe } from '../../core/mod.js';
import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForComponent, iconForObject, iconForPropertyType, iconForResource } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { searchField } from '../ui/search-field.js';
import { addComponent, availableComponents, moveComponent, removeComponent } from '../commands.js';
import { previewOffsets, rankAt } from '../dnd/reflow.js';
import { describeResource } from '../inspector/resource.js';
import { PROPERTY_TYPE_LABELS, describeDefinition } from '../inspector/definition.js';
import { ResourceKind, baseNameOf, extensionOf, hasPayload, withExtension } from '../../project/mod.js';
import { pickFile, readAsDataUrl } from '../ui/file.js';
import { DropZone, componentPayload, propertyPayload } from '../dnd/payload.js';
import { canDrop, performDrop } from '../dnd/rules.js';
import { carriesFiles, readDroppedFiles } from '../dnd/files.js';
import { describeType, groupTypes } from '../registry.js';
import { FieldKind, describeComponent, isNumeric, objectFields, rows } from '../inspector/schema.js';
import '../ui/window.js';
import '../ui/field.js';
import '../ui/resource-field.js';
import '../ui/list-field.js';
import '../ui/object-field.js';

/**
 * A resource's payload, when reading one makes sense and costs nothing.
 *
 * Synchronous on purpose: the in-memory store answers at once, and a store that returns a
 * promise answers with one — which this treats as "not read yet" rather than blocking a
 * panel on storage. What the panel shows then is the facts it has, and no content preview:
 * an asynchronous read belongs to the pass that adds an asynchronous store (ADR-0020).
 *
 * @param {object} project - The project
 * @param {object} resource - The manifest entry
 * @returns {any} The payload, or null
 */
function readable(project, resource) {
    if (!hasPayload(resource)) return null;

    const payload = project.read(resource.id);
    return payload && typeof payload.then === 'function' ? null : payload;
}

/** How far a pointer travels before a press on a section header becomes a reorder. */
const DRAG_THRESHOLD = 4;

/** Where a gesture the platform cancelled ended: outside every window, so nothing takes it. */
const NOWHERE = { clientX: -1, clientY: -1 };

/** Prefix letters for a paired row, by the property the pair starts on. */
const PAIR_PREFIXES = {
    x: ['X', 'Y'],
    width: ['W', 'H'],
    scaleX: ['X', 'Y']
};

export class Inspector extends Element {

    static styles = sheet(`
        :host { display: block; }

        /* The window the shell has decided a drop would land in (ADR-0028 §3). One class,
           styled by every window, so the answer cannot differ between them. */
        :host(.dnd-over) { outline: 2px dashed var(--px-accent); outline-offset: -3px; }
        :host(.dnd-refused) { outline: 2px dashed var(--px-danger); outline-offset: -3px; }

        /* A Component about to be attached. The panel is not a row, so it is tinted as a
           whole rather than outlining one line of itself. */
        :host(.dnd-attach) { background: var(--px-accent-muted); }
        px-window { height: 100%; }

        /* ── identity ───────────────────────────────────────────────────── */

        .identity {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            padding: var(--px-space-2) var(--px-space-2) var(--px-space-2) var(--px-space-3);
            border-bottom: 1px solid var(--px-border);
        }

        .identity .glyph { color: var(--px-accent); }
        .identity .who { flex: 1; min-width: 0; }

        .identity .title {
            display: block;
            font-size: var(--px-text-md);
            font-weight: var(--px-weight-bold);
            color: var(--px-text-strong);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .identity .kind {
            display: block;
            font-size: var(--px-text-2xs);
            color: var(--px-text-dim);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ── sections ───────────────────────────────────────────────────── */

        section { border-bottom: 1px solid var(--px-border); }

        /* The same anatomy as a Hierarchy row, and for the same reason: twisty, glyph,
           label, tools. --px-hit tall because it is a click target rather than a line of
           a list, and padded by one space unit so the chevron starts at the panel edge
           exactly where a root row's chevron does — measured, not eyeballed.
           There is still no 12 px grip before the caret: the order IS editable now
           (MOVE_COMPONENT, ADR-0018/0019), and the whole header is what carries it, so a
           separate handle would reserve a column to duplicate a target the creator
           already has — and it was what pushed every caret in this panel away from the
           edge. The cursor and the drop line say the header is draggable. */
        section > header {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            height: var(--px-hit);
            padding: 0 var(--px-space-1);
            color: var(--px-text-muted);
            /* EVERY HEADER HERE FOLDS, so every one of them is a button. Only the
               component sections used to say so, which made the Object, Resource and
               Details headers look like labels that happened to react. */
            cursor: pointer;
            -webkit-user-select: none;
            user-select: none;
        }

        section > header:hover { background: var(--px-surface-raised); }

        header .glyph { color: var(--px-text-dim); }

        /* Set in the type of a menu group heading, on purpose (ui/menu.js). */
        header .label {
            flex: 1;
            font-size: var(--px-text-2xs);
            font-weight: var(--px-weight-bold);
            letter-spacing: var(--px-tracking-caps);
            text-transform: uppercase;
            color: var(--px-text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        header .tools { display: flex; flex: 0 0 auto; opacity: 0.55; }
        section > header:hover .tools { opacity: 1; }
        header .tools .ghost.on { color: var(--px-accent); }
        header .tools .remove:hover { color: var(--px-danger); }

        .body { padding: var(--px-space-0) var(--px-space-2) var(--px-space-2); }
        section:not(.open) .body { display: none; }

        /* ── reordering ─────────────────────────────────────────────────── */

        /* THE HEADER IS A BUTTON, THE GRIP IS A HANDLE (ADR-0026 §10, §12). Clicking a
           header folds the section, so it takes the pointer cursor; the drag that reorders
           lives on a grip that shows grab, because a surface that can be clicked AND
           dragged with no mark is one a creator has to discover by accident. */
        header .grip {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 12px;
            flex: 0 0 auto;
            color: var(--px-text-dim);
            cursor: grab;
            opacity: 0.55;
        }

        section > header:hover .grip { opacity: 1; color: var(--px-text-muted); }

        /* THE LIST REORGANISES UNDER THE POINTER (ADR-0028). A flat list asks one
           question — at what rank? — so it may answer it in place: the carried section
           follows the pointer and the others slide out of its way before the drop, which
           is what makes the drop confirm something already visible rather than reveal it.
           Nothing here writes: the offsets come from dnd/reflow.js and die with the
           gesture. The tree does the opposite, and says why in windows/hierarchy.js. */
        section.dragging {
            position: relative;
            z-index: 2;
            opacity: 0.85;
            box-shadow: 0 0 0 1px var(--px-accent-border);
            border-radius: var(--px-radius-sm);
            pointer-events: none;
        }

        section.dragging .grip { cursor: grabbing; }

        /* Only the sections that step aside animate. The carried one tracks the pointer
           and must not lag a frame behind the hand holding it. */
        section.sliding { transition: transform var(--px-duration) var(--px-ease); }

        section[data-type] { position: relative; }

        section.before::after,
        section.after::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            height: 2px;
            background: var(--px-accent);
            pointer-events: none;
            z-index: 1;
        }

        section.before::after { top: -1px; }
        section.after::after { bottom: -1px; }

        section.off .body { opacity: 0.45; }
        section.off > header .label { color: var(--px-text-dim); }

        /* ── rows ───────────────────────────────────────────────────────────
           ONE row primitive, for every property. The label column and the value
           column are declared here and nowhere else — a field is a cell that
           goes in the second column, never a row that draws its own. */

        .row {
            display: grid;
            /* 62px is this panel's label column, and only this panel's: it stopped being
               a design token the moment px-field gave up drawing its own row, because a
               token with one consumer is a constant with extra steps.

               TWO COLUMNS, AND THAT IS A CONSTRAINT RATHER THAN A PREFERENCE. Eight places
               in this file build a row, and several of them carry a label and a value
               and nothing else. A third column added for one of them put every one of those
               labels into an 18 px slot — Color became a single letter. A grid every producer has to
               remember is a grid that will be got wrong; two columns is what they all
               already agree on. */
            grid-template-columns: 62px minmax(0, 1fr);
            align-items: center;
            gap: var(--px-space-2);
            min-height: calc(var(--px-control) + var(--px-space-1) + 2px);
        }

        /* A CONTROL TALLER THAN ITS LABEL PUTS THE LABEL AT THE TOP, not in the middle of
           it. Every control was one row high until a list arrived, so centring was the
           whole answer; a palette of six colours would leave its label floating halfway
           down a column of swatches, beside nothing. The padding is what lines the word up
           with the first row rather than with the top of the box. */
        .row.tall { align-items: start; }
        .row.tall > .label { padding-top: calc((var(--px-control) - 1em) / 2); }

        /* A property label is quieter than its value — that contrast is what makes a
           column of numbers legible at a glance. Still 4.6:1 on the panel surface. */
        .row > .label {
            color: var(--px-text-dim);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        /* Draggable, and it says so — but only where dragging means something.
           px-field decides, and adds the class (ui/field.js). */
        .row > .label.handle {
            cursor: ew-resize;
            touch-action: none;
            transition: color var(--px-duration-fast) var(--px-ease);
        }

        .row > .label.handle:hover,
        .row > .label.scrubbing { color: var(--px-accent); }

        .fields {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            min-width: 0;
        }

        /* Two axes of one idea, side by side. */
        .fields.pair { display: grid; grid-template-columns: 1fr 1fr; }

        /* A lone number takes the first of the same two cells, so Rotation ends
           exactly where the X of Position ends. The second cell is held open and
           empty rather than collapsed — that is what keeps the column. */
        .fields.single { display: grid; grid-template-columns: 1fr 1fr; }
        .fields.single > :nth-child(2) { visibility: hidden; pointer-events: none; }

        .none {
            padding: var(--px-space-1) 0 var(--px-space-2);
            color: var(--px-text-dim);
            font-style: italic;
        }

        .none.problem { color: var(--px-danger); font-style: normal; }

        /* A DECLARED PROPERTY IS THREE ROWS, so it needs a boundary a creator can see —
           without one, the Default of the first property and the Name of the second read
           as one block. A hairline and one step of space, not a box: the panel is already
           a column of rows and a card per property would fight it. */
        /* ── a declared property of a .px ──────────────────────────────────
           A CARD IN A LIST, NOT THREE LOOSE ROWS. Six properties used to be eighteen
           unlabelled rows separated by hairlines, which a creator had to count in threes
           to read. The header carries the two facts that identify one — its name and its
           type — and the fields fold away behind it once it is set up. */
        .property {
            border: 1px solid var(--px-border-subtle);
            border-radius: var(--px-radius-sm);
            background: var(--px-surface);
        }

        .property + .property { margin-top: var(--px-space-1); }
        .property.open { background: var(--px-surface-raised); }

        .property > header {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            height: var(--px-hit);
            /* A LITTLE AIR ON THE LEFT. The grip was flush against the card's border, so
               the one control that says "carry me" read as part of the frame. */
            padding: 0 var(--px-space-0) 0 var(--px-space-1);
            cursor: pointer;
        }

        .property > header:hover { background: var(--px-surface-hover); border-radius: var(--px-radius-sm); }

        .property .pname {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--px-text-strong);
            font-size: var(--px-text-xs);
        }

        /* The type, as a quiet badge rather than as a word in a row: it is what tells two
           properties apart at a glance, and it must not read as a value. */
        .property .ptype {
            display: flex;
            align-items: center;
            gap: 3px;
            flex: 0 0 auto;
            padding: 0 var(--px-space-1);
            border-radius: 2px;
            background: var(--px-surface-input);
            color: var(--px-text-dim);
            font-size: var(--px-text-2xs);
            letter-spacing: var(--px-tracking-caps);
            text-transform: uppercase;
        }

        .property .ptype > .glyph { display: flex; }

        /* It is information first and a handle second, so it says so on hover rather than
           at rest — the card is already dense with a grip, a caret, a name and a trash. */
        .property .ptype.draggable { cursor: grab; }
        .property .ptype.draggable:hover { color: var(--px-text); background: var(--px-surface-hover); }
        .property .ptype.dragging { cursor: grabbing; color: var(--px-accent); }

        .property .pbody { padding: var(--px-space-0) var(--px-space-1) var(--px-space-1); }
        .property:not(.open) .pbody { display: none; }

        /* VISIBLE BY DEFAULT. Hiding the only way to delete a property behind a hover
           makes removing one something a creator has to discover; the hover still
           strengthens it, which is all a hover should ever do (ui/styles.js). */
        .property .remove { flex: 0 0 auto; opacity: 0.55; }
        .property > header:hover .remove, .property .remove:focus-visible { opacity: 1; }
        .property .remove:hover { color: var(--px-danger); }

        /* The same two marks a component section wears while it is being carried
           (ADR-0028 §1): a flat list, so it reorganises under the pointer. */
        .property.dragging {
            position: relative;
            z-index: 2;
            opacity: 0.85;
            border-color: var(--px-accent);
            pointer-events: none;
        }

        .property.sliding { transition: transform var(--px-duration) var(--px-ease); }
        .property.dragging .grip { cursor: grabbing; }

        /* ── resource facts and content ─────────────────────────────────── */

        /* A fact is read, not edited, so it is set as text in the value column rather than
           in a disabled control that invites a click. Monospace for the same reason every
           value in this panel is: a column of numbers and identifiers has to align. */
        .row .value {
            font-family: var(--px-font-mono);
            font-size: var(--px-text-sm);
            color: var(--px-text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
        }

        /* The part of a name a creator may not edit, drawn where it reads as part of the
           value rather than as a second field. */
        .row .suffix {
            flex: 0 0 auto;
            align-self: center;
            font-family: var(--px-font-mono);
            font-size: var(--px-text-xs);
            color: var(--px-text-dim);
        }

        /* THE ROW A DROP WOULD LAND IN, and the one it would be turned down by. Twelve
           properties stacked a row apart need the answer at the row, not at the panel —
           and a refusal is drawn rather than left silent, which is the whole of ADR-0028
           §3. "drop" is what a file from the desktop sets; "drop-refused" is what the
           shell sets while a resource is carried over something that will not take it. */
        px-field.drop, px-resource.drop, .preview.drop, .none.drop, .add.drop {
            outline: 2px dashed var(--px-accent);
            outline-offset: 2px;
            border-radius: var(--px-radius-sm);
        }

        px-field.drop-refused, px-resource.drop-refused {
            outline: 2px dashed var(--px-danger);
            outline-offset: 2px;
            border-radius: var(--px-radius-sm);
        }

        .preview {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--px-space-2);
            margin-bottom: var(--px-space-2);
            background: var(--px-surface-sunken);
            border: 1px solid var(--px-border);
            border-radius: var(--px-radius-sm);
        }

        /* Bounded so a large image cannot push the panel around, and pixellated because
           this is a pixel-art editor: a thumbnail that smooths the art misreports it. */
        .preview img {
            max-width: 100%;
            max-height: 180px;
            image-rendering: pixelated;
        }

        /* ── add ────────────────────────────────────────────────────────── */

        .add {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--px-space-2);
            width: calc(100% - var(--px-space-6));
            margin: var(--px-space-3) var(--px-space-3) var(--px-space-4);
            height: var(--px-hit);
            border: 1px dashed var(--px-border-subtle);
            border-radius: var(--px-radius);
            color: var(--px-text-muted);
            transition: border-color var(--px-duration-fast) var(--px-ease),
                        color var(--px-duration-fast) var(--px-ease),
                        background var(--px-duration-fast) var(--px-ease);
        }

        .add:hover {
            border-color: var(--px-accent-border);
            border-style: solid;
            color: var(--px-text-strong);
            background: var(--px-accent-muted);
        }

        .add:active { background: var(--px-surface-active); }

        /* ── empty ──────────────────────────────────────────────────────── */

        .empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: var(--px-space-2);
            padding: var(--px-space-8) var(--px-space-4);
            text-align: center;
            color: var(--px-text-dim);
            line-height: var(--px-leading);
        }

        .empty .glyph { opacity: 0.35; }
    `);

    #scene = null;
    #selection = null;
    #registry = null;
    #workspace = null;
    #subject = null;
    /** The installer that turns a `.px` into a registered type (project/definitions.js). */
    #definitions = null;
    #body = null;
    #search = null;
    #create = null;
    #query = '';
    // THE THIRD SUBJECT (ADR-0027). A graph node is neither an Object nor a Resource, and
    // it is selected on a canvas rather than in a tree — so it is held here and cleared by
    // the shell when either of the other two selections speaks, exactly as those two clear
    // each other.
    /** `.px` resources whose live model is being fetched, so one render does not ask twice. */
    #attaching = new globalThis.Set();
    // View state, and only view state: which sections the creator folded away. Keyed by
    // section name so it survives selecting another object of the same shape.
    #folded = new globalThis.Set();

    /** The press on a section header that may become a reorder. */
    #drag = null;

    /** The press on a type badge that may become a drag out of this panel. */
    #source = null;
    /** Set for exactly one click: the one that ends a drag and must not also fold. */
    #dragged = false;
    /** The field currently marked as the one a drop would land in. */
    #dropMark = null;
    /** Where a `.px` would attach, while an object is being inspected. */
    #componentsZone = null;

    /**
     * Point the window at the selections it follows.
     *
     * TWO SELECTIONS, ONE PANEL. An Object comes from the scene's `Selection`, a Resource
     * from the `Workspace` (ADR-0025). They are mutually exclusive — selecting in one
     * clears the other, wired in `editor.js` — so this window never has to decide which of
     * two things a creator meant.
     *
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene
     * @param {object} context.selection - The Editor selection
     * @param {object} context.registry - Component registry the Add menu lists
     * @param {object} [context.workspace] - The workspace, for the selected resource
     * @returns {Inspector} This element
     */
    bind({ scene, selection, subject = null, registry, workspace = null, definitions = null }) {
        this.#definitions = definitions;
        this.#scene = scene;
        this.#selection = selection;
        // Read to know WHAT to show; `subject` is what a drop announces when it lands an
        // object in the scene (ADR-0032).
        this.#subject = subject;
        this.#registry = registry;
        this.#workspace = workspace;
        return this;
    }

    /**
     * Show a graph node, or clear it.
     *
     * The Graph window announces its selection as an event and the shell routes it here
     * (ADR-0006): neither element holds a reference to the other, which is what stops the
     * canvas from having to know an Inspector exists.
     *
     * @param {object|null} node - The node record
     * @param {object|null} definition - The `.px` it belongs to
     * @returns {Inspector} This element
     */
    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) {
            this.#body = el('div');

            // The same two actions the Hierarchy carries, in the same order and built from
            // the same primitives: find what is already there, then add. A creator who has
            // learned one header has learned both.
            this.#search = searchField({
                // A Resource has properties and facts, an Object has components — one
                // field searches whichever the panel is showing, so it is named for the
                // thing they have in common (ADR-0026 §9).
                placeholder: 'Search properties',
                label: 'properties',
                onQuery: query => {
                    this.#query = query;
                    this.#render();
                }
            });

            const create = el('button', {
                class: 'ghost',
                type: 'button',
                title: 'Add component',
                'aria-label': 'Add component',
                onclick: () => {
                    const object = this.#selection.object;
                    if (object) this.#openAddMenu(create, object);
                }
            }, icon('plus'));

            this.#create = create;

            const more = el('button', {
                class: 'ghost',
                type: 'button',
                title: 'More',
                'aria-label': 'More inspector actions',
                onclick: () => this.#openMoreMenu(more)
            }, icon('more'));

            this.shadowRoot.append(
                el('px-window', { label: 'Inspector', icon: 'inspector' },
                    el('div', { class: 'actions', slot: 'actions' }, this.#search.toggle, create, more),
                    this.#search.bar,
                    this.#body
                )
            );
        }

        this.track(this.#selection.observe(() => this.#render()));

        // A component appearing or disappearing changes what there is to show — and it
        // can come from anywhere, not only from the button below.
        for (const event of ['component:added', 'component:removed', 'component:moved']) {
            this.track(this.#scene.on(event, payload => {
                if (this.#selection.has(payload.object)) this.#render();
            }));
        }

        if (this.#workspace) {
            this.track(this.#workspace.on('selection', () => this.#render()));
            // A resource panel shows facts that a manifest mutation changes — a revision, a
            // size, a location. Only the selected one is worth redrawing for.
            this.track(this.#workspace.project.operations.on('operation', operation => {
                const selected = this.#workspace.selectedId;
                if (!selected) return;
                // A rename arrives through the name field's own binding; redrawing on it
                // would take the field being typed into with it.
                if (operation.type === 'SET_PROPERTY' && operation.prop === 'name') return;
                if (operation.target.object === selected) this.#render();
            }));
        }

        this.#render();
    }

    /**
     * The `…` menu.
     *
     * Folding is the only view state this panel owns, and it is the only thing here that a
     * creator cannot reach from a row. Nothing is invented to lengthen the list
     * (ADR-0026 §14).
     */
    #openMoreMenu(anchor) {
        const items = [
            { heading: 'View' },
            { id: 'expand', label: 'Expand all sections', icon: 'chevron' },
            { id: 'collapse', label: 'Collapse all sections', icon: 'minus' }
        ];

        openMenu(anchor, items, choice => {
            if (choice === 'expand') this.#folded.clear();
            if (choice === 'collapse') {
                const object = this.#selection.object;
                for (const type of object?.componentTypes() ?? []) this.#folded.add(type);
                if (this.#workspace?.selected) {
                    for (const key of ['resource:fields', 'resource:details', 'resource:content']) {
                        this.#folded.add(key);
                    }
                }
            }
            this.#render();
        }, { label: 'actions' });
    }

    #render() {
        // The object panel's drop zone is rebuilt below when there is an object to attach
        // to; anything else must not inherit the last one.
        this.#componentsZone = null;

        // NOTHING TO DRAW INTO YET. The shell wires this panel's subjects while it is still
        // assembling the layout, so a selection can arrive before `connectedCallback()` has
        // built the body. Rendering then would reach for controls that do not exist; the
        // panel draws itself once it is connected, from whatever the state is by then.
        if (!this.#body) return;

        this.release('panel');

        // A resource, or an object. The two are mutually exclusive — the shell clears one
        // when the other speaks — so this is a route rather than a priority.
        //
        // THERE IS NO THIRD SUBJECT ANY MORE. Selecting a graph node used to swap this
        // panel for that node's params; a node is now edited where it lives, and selecting
        // one selects the `.px` it belongs to (editor.js). `describeNode()` did not go
        // away with the panel — the canvas draws its fields.
        const resource = this.#workspace?.selected ?? null;
        if (resource) {
            this.#create.disabled = true;
            this.#renderResource(resource);
            return;
        }

        const object = this.#selection.object;
        this.#create.disabled = !object;

        if (!object) {
            fill(this.#body, el('div', { class: 'empty' },
                el('span', { class: 'glyph' }, icon('inspector', 20)),
                el('span', { textContent: 'Select an object or a resource to inspect it.' })
            ));
            return;
        }

        const components = object.components;
        // In collection order — the same order the runtime updates in and the scene
        // renderer draws in (ADR-0018). The panel is a view of the order, not a listing.
        const types = object.componentTypes();
        const shown = types.filter(type => this.#matches(this.#titleOf(type)));
        const searching = this.#query.trim() !== '';

        // A `.px` DROPPED HERE ATTACHES ITSELF. The whole panel is the target, because
        // "add this Component to this object" is a statement about the OBJECT and not
        // about any one row of it. The rule lives next door like every other one, and the
        // marks are the shared ones (ADR-0026 §6, ADR-0028 §3).
        this.#componentsZone = { zone: DropZone.COMPONENTS, object };

        fill(this.#body,
            this.#renderIdentity(object, types.length),
            this.#matches('Object')
                ? this.#renderSection({
                    name: 'Object',
                    glyph: 'object',
                    body: this.#renderRows(object, objectFields())
                })
                : null,
            shown.map(type => this.#renderComponent(object, components[type], type)),
            // A filter that hides everything has to say so; silently showing an empty
            // panel reads as an object that carries nothing.
            searching && shown.length === 0 && !this.#matches('Object')
                ? el('div', { class: 'none', textContent: `No component matches “${this.#query.trim()}”.` })
                : null,
            searching ? null : this.#renderAddButton(object)
        );
    }

    // --- the Resource panel -------------------------------------------------------
    //
    // THE SAME PANEL, A DIFFERENT SUBJECT. Identity header, sections, rows, one field per
    // editable value: everything below reuses what a component's panel is built from, so
    // a Resource does not get a second Inspector with its own idea of what a row is.
    //
    // AND NO CHAIN OF BRANCHES. What differs between kinds — the extra facts, whether
    // there is content to show — is answered by `describeResource()` (inspector/resource.js).
    // This method renders an answer; it never asks what kind it is.

    #renderResource(resource) {
        const project = this.#workspace.project;
        // A `.px` WITH A LIVE MODEL REPORTS THE MODEL, not the payload the store still
        // holds. A creator who has just declared a property expects to read three, not the
        // two that were last saved — the facts would otherwise contradict the rows above.
        const definition = this.#definitionFor(resource);
        const payload = definition ? definition.serialize() : readable(project, resource);
        const description = describeResource(resource, {
            project,
            payload,
            size: project.store.size?.(resource.id) ?? null
        });

        fill(this.#body,
            this.#renderResourceIdentity(resource, description),
            this.#renderSection({
                name: 'Resource',
                key: 'resource:fields',
                glyph: iconForResource(resource),
                body: description.fields.map(descriptor => this.#renderResourceRow(resource, descriptor))
            }),
            definition ? this.#renderProperties(definition) : null,
            this.#renderSection({
                name: 'Details',
                key: 'resource:details',
                // WHAT IS TRUE OF IT, not what it declares. Details and Properties used to
                // share the Inspector window's own glyph, so two opposite sections read as
                // the same kind of list (ui/icons.js).
                glyph: 'info',
                body: description.metadata.map(entry => el('div', { class: 'row' },
                    el('span', { class: 'label', textContent: entry.label }),
                    el('span', { class: 'value', textContent: globalThis.String(entry.value) })
                ))
            }),
            description.content
                ? this.#renderSection({
                    name: 'Content',
                    key: 'resource:content',
                    glyph: 'image',
                    body: this.#renderContent(resource, description.content)
                })
                : null
        );
    }

    // --- a `.px`'s user-declared properties (ADR-0027) --------------------------------
    //
    // THE SUBJECT IS THE SCHEMA, NOT A VALUE. Inspecting a Transform edits `x`; inspecting a
    // Component edits what a Component IS — which properties it has, what shape each one
    // holds, what a fresh instance starts them at. So a property is three fields rather than
    // one, and each writes to the reactive descriptor the definition holds, which puts the
    // edit on that resource's pipeline and in that resource's undo stack.
    //
    // NOT A SECOND PROPERTY SYSTEM. The type list is the Core's own eight (ADR-0023) and the
    // control for the default is derived from the chosen type by the same mapping every
    // other field goes through. `inspector/definition.js` answers what to show; this draws it.

    /**
     * The live model of a `.px`, fetching it once when there is not one yet.
     *
     * Attaching is asynchronous because the store's contract is (ADR-0020), so the first
     * render of a freshly selected Component shows its facts and the next one shows its
     * properties. ATTACHING IS NOT OPENING: the resource stays deletable, which it would
     * not if merely selecting it counted as having it open (ADR-0027).
     */
    #definitionFor(resource) {
        if (resource.kind !== ResourceKind.COMPONENT || !this.#workspace) return null;

        const attached = this.#workspace.attached(resource.id);
        if (attached) return attached;

        if (this.#attaching.has(resource.id)) return null;
        this.#attaching.add(resource.id);
        globalThis.Promise.resolve(this.#workspace.attach(resource.id)).then(model => {
            this.#attaching.delete(resource.id);
            if (model && this.#workspace.selectedId === resource.id) this.#render();
        });

        return null;
    }

    #renderProperties(definition) {
        const description = describeDefinition(definition);

        // WHAT THE FIELDS CANNOT FOLLOW BY THEMSELVES. Each field observes the descriptor it
        // edits, so a rename or a new default arrives without a redraw. Three things change
        // the SHAPE of this section instead of a value — a property appearing, one
        // disappearing, and a type changing the control its default is edited with — and
        // those must be redrawn. They may also arrive from an undo or from a collaborator,
        // which is why this listens to the pipeline rather than to the buttons.
        this.track(definition.operations.on('operation', operation => {
            const structural = operation.type === 'ADD_PROPERTY' || operation.type === 'REMOVE_PROPERTY';
            const retyped = operation.type === 'SET_PROPERTY' && operation.prop === 'type';
            if (structural || retyped) globalThis.queueMicrotask(() => this.#render());
        }), 'panel');

        const add = el('button', {
            class: 'add',
            type: 'button',
            title: 'Add property',
            onclick: () => {
                const property = definition.addProperty({});
                // The pipeline listener above redraws the section, so the focus waits behind
                // it in the microtask queue — one redraw, not two, and the caret lands in a
                // field that exists. Straight into the name, because a creator who adds a
                // property is about to name it: the move the Hierarchy makes for an object.
                if (property) globalThis.queueMicrotask(() => this.#focusProperty(property.id));
            }
        }, icon('plus', 16), el('span', { textContent: 'Add property' }));

        return this.#renderSection({
            name: 'Properties',
            key: 'resource:properties',
            glyph: 'properties',
            body: [
                description.properties.length === 0
                    ? el('div', { class: 'none', textContent: 'This Component declares no properties yet.' })
                    : description.properties.map(entry => this.#renderProperty(definition, entry)),
                add
            ]
        });
    }

    /**
     * One declared property of a `.px`, as a card that folds.
     *
     * IT IS A LIST ITEM, SO IT LOOKS LIKE ONE. A property used to be three unlabelled rows
     * with a horizontal rule between groups, which meant a Component with six properties
     * was eighteen rows a creator had to count in threes to read. It now carries its own
     * header — grip, name, type — so the list can be SCANNED, and the three fields fold
     * away behind it once it has been set up.
     *
     * THE HEADER SAYS THE TWO THINGS THAT IDENTIFY IT: the name, live from the model, and
     * the type. Everything else is behind the fold, because a creator returning to a `.px`
     * is looking for which properties exist, not for what each one defaults to.
     */
    #renderProperty(definition, entry) {
        const property = definition.property(entry.id);
        if (!property) return null;

        const [name, type, fallback] = entry.fields;
        const key = `property:${entry.id}`;
        const open = !this.#folded.has(key);

        const remove = el('button', {
            class: 'ghost remove',
            type: 'button',
            title: 'Remove property',
            'aria-label': `Remove ${entry.name}`,
            onclick: event => {
                event.stopPropagation();
                definition.removeProperty(entry.id);
            }
        }, icon('trash', 16));

        const grip = el('span', {
            class: 'grip',
            title: `Drag to reorder ${entry.name}`,
            'aria-hidden': 'true'
        }, icon('grip', 16));

        const caret = el('span', { class: `ghost twisty${open ? ' open' : ''}`, 'aria-hidden': 'true' },
            icon('chevron', 16));

        const title = el('span', { class: 'pname', textContent: property.name || 'property' });
        // THE BADGE IS THE HANDLE, and it costs no column: it already sits on this card and
        // already says what the property holds. A `.px` property is TWO identities of
        // project scope — the Component type this file declares, and the property's own id
        // (ADR-0037 §2.3) — which is exactly what a graph may name, so this is the one row
        // in the Inspector where carrying a property somewhere else means something.
        //
        // NOT THE LABEL, and not the grip: the label is the scrub handle of every number
        // (ui/scrub.js) and the grip already means reorder on this very card. One element,
        // one gesture.
        const badge = el('span', { class: 'ptype draggable' },
            el('span', { class: 'glyph' }, icon(iconForPropertyType(property.type), 12)),
            el('span', { textContent: typeLabel(property.type) })
        );
        badge.title = `${property.name || 'This property'} — drag onto a graph`;
        this.#makeDragSource(badge, () =>
            propertyPayload(definition.type, entry.id, property.name || entry.name));

        // The header follows the model, so renaming a property in the field below —
        // or from an undo, or from a collaborator — retitles it on the keystroke.
        this.track(observe(property, 'name', change => {
            title.textContent = change.value || 'property';
        }), 'panel');
        this.track(observe(property, 'type', change => {
            fill(badge,
                el('span', { class: 'glyph' }, icon(iconForPropertyType(change.value), 12)),
                el('span', { textContent: typeLabel(change.value) })
            );
        }), 'panel');

        const block = el('div', {
            class: `property${open ? ' open' : ''}`,
            dataset: { property: entry.id }
        });

        const header = el('header', {
            title: 'Click to fold',
            onclick: () => {
                // The click that ends a drag is still a click. Folding the property a
                // creator has just moved would be the one thing they did not ask for.
                if (this.#dragged) {
                    this.#dragged = false;
                    return;
                }
                if (this.#folded.has(key)) this.#folded.delete(key);
                else this.#folded.add(key);
                const shown = !this.#folded.has(key);
                block.classList.toggle('open', shown);
                caret.classList.toggle('open', shown);
            }
        }, grip, caret, title, badge, remove);

        const body = el('div', { class: 'pbody' },
            // Letter by letter, like every other field in this panel: a rename is one
            // history entry because the field mints a batch for the typing session, not
            // because it waits for Enter (ADR-0026 §3).
            this.#renderPropertyRow(property, name, {
                write: (value, options) => definition.renameProperty(entry.id, value, options)
            }),
            // Changing the type changes the control the default is edited with, so the
            // section is redrawn — by the pipeline listener, which also catches the redraw
            // an undo or a collaborator would otherwise not trigger.
            this.#renderPropertyRow(property, type, {
                write: value => definition.setPropertyType(entry.id, value)
            }),
            this.#renderPropertyRow(property, fallback, {
                write: (value, options) => definition.setPropertyDefault(entry.id, value, options)
            })
        );

        block.append(header, body);

        // The same reorder gesture the components use, told a different list (ADR-0028 §1).
        this.#makeDraggable(grip, header, {
            element: block,
            siblings: () => this.#orderedProperties(),
            rank: () => definition.indexOf(entry.id),
            commit: rank => definition.moveProperty(entry.id, rank)
        });

        return block;
    }

    #renderPropertyRow(property, descriptor, { write, extra = null }) {
        const field = this.#control(property, descriptor, { write });
        const label = el('span', { class: 'label', textContent: descriptor.label });
        field.bindLabel?.(label);

        // A DEFAULT THAT HOLDS A REFERENCE TAKES A DROP, like the property it is the
        // default of. There is no component to ask what it accepts, so the target states
        // its clause and its writer outright — which is the shape `acceptsResource()` now
        // takes for exactly this case (dnd/rules.js).
        if (descriptor.kind === FieldKind.RESOURCE) {
            this.#makeDroppable(field, {
                zone: DropZone.PROPERTY,
                label: descriptor.label,
                accepts: descriptor.accepts ?? { kind: null, mime: null },
                assign: value => write(value)
            });
        }

        return el('div', { class: 'row' },
            label,
            el('div', { class: 'fields' }, field, extra)
        );
    }

    #focusProperty(id) {
        const field = this.#body.querySelector(`.property[data-property="${id}"] px-field`);
        field?.shadowRoot?.querySelector('input')?.focus();
    }

    #renderResourceIdentity(resource, description) {
        const entry = this.#workspace.project.get(resource.id);
        const title = el('span', { class: 'title', textContent: description.title });

        // Letter by letter, from the model, like every other name in the Editor — and the
        // extension is dropped on the way, because it belongs to the kind rather than to
        // the creator (ADR-0026 §4).
        this.track(observe(entry, 'name', change => {
            title.textContent = baseNameOf({ ...entry, name: change.value }) || 'Untitled';
        }), 'panel');

        // THE KIND LINE NAMES THE KIND. The extension was put here last pass and it was
        // the wrong home: `.png` is derived from the mime and repeating it under a title
        // that already dropped it says the same thing twice. It belongs beside the field
        // a creator edits — the Name row of the Resource section already draws it, and
        // that is where the rule about what may be typed applies (ADR-0026 §4).
        return el('div', { class: 'identity' },
            el('span', { class: 'glyph' }, icon(iconForResource(resource), 20)),
            el('div', { class: 'who' },
                title,
                el('span', { class: 'kind', textContent: description.kindName })
            )
        );
    }

    /**
     * One editable field of a resource.
     *
     * TWO THINGS DIFFER FROM A COMPONENT'S ROW, and both come from where the value lives.
     * A manifest entry has no `setProperty()` of its own — the operation belongs to the
     * Project's pipeline (ADR-0020) — so the writer is handed in; and the write happens on
     * validate, because a rename is ONE intent and one undo entry, not one per keystroke
     * (ADR-0025).
     */
    #renderResourceRow(resource, descriptor) {
        const entry = this.#workspace.project.get(resource.id);

        // The box holds the BASE name; the extension is drawn beside it, because the kind
        // decides it and a creator may not type it away (ADR-0026).
        const extension = descriptor.name === 'name' ? extensionOf(entry) : '';
        const view = descriptor.name === 'name' ? this.#nameView(entry) : entry;

        const field = el('px-field').bind(view, descriptor, {
            // Letter by letter, like every other field in this panel: typing here retitles
            // the Project row and the panel header on each keystroke, because the model is
            // what both read (ADR-0003). The `batch` the field mints for the typing session
            // is what keeps that ONE undo entry rather than eleven (ADR-0026).
            write: (value, { batch }) => this.#workspace.project.setProperty(
                resource.id,
                descriptor.name,
                descriptor.name === 'name' ? withExtension(value, entry) : value,
                { batch }
            )
        });

        const label = el('span', { class: 'label', textContent: descriptor.label });
        field.bindLabel(label);

        return el('div', { class: 'row' },
            label,
            el('div', { class: 'fields' },
                field,
                extension ? el('span', { class: 'suffix', textContent: extension }) : null
            )
        );
    }

    /**
     * What a resource's content looks like, and how it is replaced.
     *
     * The preview is whatever `describeResource()` could make of the payload, including
     * "this cannot be previewed" — which is said rather than drawn as a broken box.
     */
    #renderContent(resource, content) {
        const nodes = [];
        // The drop and the button take the SAME path: one import, one replacement, one
        // place where a payload is written (ADR-0026).
        const zone = { zone: DropZone.CONTENT, resource };

        if (content.preview?.type === 'image') {
            nodes.push(el('div', { class: 'preview' },
                el('img', {
                    src: content.preview.source,
                    alt: resource.name || 'Preview',
                    draggable: false
                })));
        } else if (content.preview?.note) {
            nodes.push(el('div', { class: 'none', textContent: content.preview.note }));
        }

        for (const node of nodes) this.#makeDroppable(node, zone, { accept: content.accept });

        if (content.replaceable) {
            nodes.push(el('button', {
                class: 'add',
                type: 'button',
                onclick: () => this.#replaceContent(resource, content)
            }, icon('plus', 16), el('span', { textContent: 'Replace…' })));
        }

        return nodes;
    }

    /**
     * Swap a resource's payload for a file the creator chooses.
     *
     * `project.save()` writes the payload, bumps the revision and stamps `modified` — the
     * same path a scene save takes, so nothing about replacing content is a special case.
     * The identity does not move, so every reference to this resource still resolves.
     */
    async #replaceContent(resource, content) {
        const file = await pickFile({ accept: content.accept ?? '' });
        if (!file) return;

        const payload = await readAsDataUrl(file);
        const project = this.#workspace.project;
        // The declared format follows the file: replacing a PNG with a JPEG is a legal
        // thing to do, and leaving the old mime would make the panel lie about it.
        if (file.type && file.type !== project.get(resource.id)?.mime) {
            project.setProperty(resource.id, 'mime', file.type);
        }
        project.save(resource.id, payload);
        this.#render();
    }

    /**
     * A reactive view of a resource's name, holding the part a creator edits.
     *
     * The field needs something to observe, and what it must show is the BASE name while
     * the model holds the whole one. So this is a view-model of exactly one property, kept
     * in step with the manifest — not a second source of truth: nothing writes to it, and
     * every write goes to the project through the field's writer (ADR-0026).
     *
     * @param {object} entry - The reactive manifest entry
     * @returns {object} A reactive `{ name }`
     */
    #nameView(entry) {
        const view = makeReactive({ name: baseNameOf(entry) });

        this.track(observe(entry, 'name', change => {
            const base = baseNameOf({ ...entry, name: change.value });
            if (view.name !== base) view.name = base;
        }), 'panel');

        return view;
    }

    /**
     * Make an element a drop target for a zone the rules know about.
     *
     * The element learns nothing about what may land on it: it asks the rules whether the
     * drag in flight is legal, and hands the same rules the drop (ADR-0026).
     *
     * @param {HTMLElement} element - What the pointer is over
     * @param {object} zone - The target descriptor
     * @param {object} [options] - Options
     * @param {string} [options.accept] - Mime prefix for files, when the zone narrows it
     */
    #makeDroppable(element, zone, { accept = '' } = {}) {
        element.addEventListener('dragover', event => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            element.classList.add('drop');
        });
        element.addEventListener('dragleave', () => element.classList.remove('drop'));
        element.addEventListener('drop', async event => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            event.stopPropagation();
            element.classList.remove('drop');

            const wanted = accept.startsWith('image/') ? 'image/' : '';
            const payload = await readDroppedFiles(event, { accept: wanted });
            if (!payload) return;

            performDrop(payload, zone, this.#dropContext());
            this.#render();
        });

        // A resource carried from the Project panel is a pointer drag, not a DataTransfer,
        // so the shell asks this element what it would accept. Stamping the zone on the
        // node is what lets `zoneAt()` answer without a second registry of rectangles.
        element.pxDropZone = zone;
    }

    /**
     * The drop zone under a point, when what is being dragged would be accepted there.
     *
     * @param {object} payload - What is being dragged
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object|null} `{ node, zone, verdict }`, or null
     */
    zoneAt(payload, clientX, clientY) {
        const row = this.#rowZoneAt(clientX, clientY);
        const rowVerdict = row ? canDrop(payload, row.pxDropZone) : null;

        // A ROW THAT WANTS THE DRAG WINS. Dropping an image on `source` must assign a
        // picture, not attach a Component to the object behind the row.
        if (rowVerdict?.allowed) {
            this.#markDropZone(row, true);
            return { node: row, zone: row.pxDropZone, verdict: rowVerdict };
        }

        // A ROW THAT DOES NOT WANT IT DOES NOT SHADOW THE PANEL. A `.px` carried over the
        // Inspector passes over a dozen fields on its way, and none of them takes a
        // Component — answering "refused" for each would make attaching one a matter of
        // finding the one gap between two rows.
        const panel = this.#componentsZone && this.#within(clientX, clientY)
            ? { zone: this.#componentsZone, verdict: canDrop(payload, this.#componentsZone) }
            : null;

        if (panel?.verdict.allowed) {
            this.#markDropZone(null, false);
            this.classList.toggle('dnd-attach', true);
            return { node: this, zone: panel.zone, verdict: panel.verdict };
        }
        this.classList.toggle('dnd-attach', false);

        // NOTHING WANTS IT, AND THAT IS STILL AN ANSWER. A refused row is reported rather
        // than skipped: this used to return null, which sent the shell looking behind the
        // Inspector and landed an image in the scene instead of turning it down
        // (ADR-0028 §3). Being over something that refuses is not being over nothing.
        if (row) {
            this.#markDropZone(row, false);
            return { node: row, zone: row.pxDropZone, verdict: rowVerdict };
        }

        this.#markDropZone(null, false);
        return panel ? { node: this, zone: panel.zone, verdict: panel.verdict } : null;
    }

    /**
     * The field under a point, when one of them declared a drop zone.
     *
     * EVERY CONTROL THAT CAN BE A TARGET IS LISTED, and the list is what decides: a control
     * absent from it is invisible to a drag however droppable `#makeDroppable()` made it.
     * `px-object` was missing, so an `objectref` row — the one row an Object can be dropped
     * on — could not be found (ADR-0034 §3.5).
     */
    #rowZoneAt(clientX, clientY) {
        for (const node of this.shadowRoot.querySelectorAll('px-field, px-resource, px-object, .preview, .none, .add')) {
            if (!node.pxDropZone) continue;

            const box = node.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;
            return node;
        }
        return null;
    }

    /** Whether a point is inside this window. */
    #within(clientX, clientY) {
        const box = this.getBoundingClientRect();
        return clientX >= box.left && clientX < box.right
            && clientY >= box.top && clientY < box.bottom;
    }

    /**
     * Mark the one field a drop would land in.
     *
     * The window outline says "this panel"; this says "this row", which is the answer a
     * creator actually needs when twelve properties are stacked a row apart. Marking is a
     * view concern, so it lives with the view rather than in the shell that resolved it.
     *
     * @param {HTMLElement|null} node - The field under the pointer
     * @param {boolean} allowed - What the rule said about it
     */
    #markDropZone(node, allowed) {
        if (this.#dropMark && this.#dropMark !== node) {
            this.#dropMark.classList.remove('drop', 'drop-refused');
        }
        this.#dropMark = node;
        node?.classList.toggle('drop', allowed);
        node?.classList.toggle('drop-refused', !allowed);
    }

    /** Take the row mark off, when the gesture ends wherever it ended. */
    clearDropMarks() {
        this.#markDropZone(null, false);
        this.classList.remove('dnd-attach');
    }

    /**
     * Perform a drop of something dragged from elsewhere in the Editor.
     * @param {object} payload - What is being dragged
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object|null} What the rule did
     */
    drop(payload, clientX, clientY) {
        const found = this.zoneAt(payload, clientX, clientY);
        if (!found) return null;

        const result = performDrop(payload, found.zone, this.#dropContext());
        this.#render();
        return result;
    }

    #dropContext() {
        return {
            project: this.#workspace?.project ?? null,
            workspace: this.#workspace,
            scene: this.#scene,
            folder: null,
            select: object => (this.#subject ? this.#subject.object(object) : this.#selection.set(object)),
            // A `.px` is data until something registers it as a type; the Project layer
            // does that (project/definitions.js) and the rule is handed the result rather
            // than reaching for a registry of its own.
            install: id => this.#definitions?.install(id) ?? null,
            addComponent: (object, type) => addComponent(object, type, this.#registry)
        };
    }

    /**
     * Whether a section survives the component filter.
     * @param {string} title - The section's displayed title
     * @returns {boolean} True when it is shown
     */
    #matches(title) {
        const query = this.#query.trim().toLowerCase();
        return query === '' || title.toLowerCase().includes(query);
    }

    #renderIdentity(object, count) {
        const title = el('span', { class: 'title', textContent: object.name || '(unnamed)' });
        const glyph = el('span', { class: 'glyph' }, icon(iconForObject(object), 20));

        this.track(object.observe('name', change => {
            title.textContent = change.value || '(unnamed)';
        }), 'panel');

        const children = object.children.length;
        const summary = [`${count} component${count === 1 ? '' : 's'}`];
        if (children > 0) summary.push(`${children} child${children === 1 ? '' : 'ren'}`);

        return el('div', { class: 'identity' },
            glyph,
            el('div', { class: 'who' },
                title,
                el('span', { class: 'kind', textContent: summary.join(' · ') })
            )
        );
    }

    /**
     * A component's displayed name.
     *
     * The LABEL, never the identity (ADR-0021). A component a creator made is keyed by the
     * ResourceId of its definition, so showing the type would put `res_c3` in the panel
     * and in the search box. A shipped component has no label of its own, and its type
     * name is read out instead — `RectangleRenderer` shown as `Rectangle Renderer`.
     *
     * @param {string} type - The component type
     * @returns {string} The title to show
     */
    #titleOf(type) {
        const ComponentClass = this.#registry?.get(type);
        return ComponentClass?.label ?? describeType(type, this.#registry).label ?? humanise(type);
    }

    #renderComponent(object, component, type) {
        const title = this.#titleOf(type);
        const section = this.#renderSection({
            name: title,
            key: type,
            glyph: iconForComponent(component, type),
            body: (() => {
                // A component whose definition could not be resolved says so, and shows
                // the values it is holding on to rather than pretending to be empty.
                // Losing them silently is what would make the placeholder pointless
                // (ADR-0021).
                if (isMissingComponent(component)) return this.#renderMissing(component, type);

                const fields = describeComponent(component);
                return fields.length === 0
                    ? [el('div', { class: 'none', textContent: 'No properties' })]
                    : this.#renderRows(component, fields);
            })()
        });

        // `active` is the one state a Component really has: the runtime reads it to decide
        // whether to run `update()` and `draw()` (ADR-0004). There is no per-component
        // `visible` in the model, and inventing one in the Inspector would show a control
        // that does nothing.
        const toggle = el('button', {
            class: 'ghost',
            type: 'button',
            onclick: event => {
                event.stopPropagation();
                component.setProperty('active', component.active === false);
            }
        }, icon('eye', 16));

        const syncActive = () => {
            const on = component.active !== false;
            toggle.title = on ? `Disable ${title}` : `Enable ${title}`;
            toggle.setAttribute('aria-label', toggle.title);
            toggle.classList.toggle('on', !on);
            section.classList.toggle('off', !on);
            fill(toggle, icon(on ? 'eye' : 'eye-off', 16));
        };
        syncActive();
        // `active` may not exist yet — a component carries it only once something has
        // switched it off — and the Property System observes by name either way.
        this.track(observe(component, 'active', syncActive), 'panel');

        const remove = el('button', {
            class: 'ghost remove',
            type: 'button',
            title: `Remove ${title}`,
            'aria-label': `Remove ${title}`,
            onclick: event => {
                event.stopPropagation();
                removeComponent(object, type);
            }
        }, icon('close', 16));

        section.querySelector('.tools').append(toggle, remove);
        this.#makeReorderable(section, object, type);
        return section;
    }

    // --- reordering components ----------------------------------------------------
    //
    // THE ORDER IS THE MODEL'S, AND IT IS EDITABLE HERE BECAUSE IT MEANS SOMETHING: it is
    // the order the Runtime calls `update()` in, the order the renderer calls `draw()` in
    // — so which of two renderers lands on top — and the order this panel reads in. One
    // order, persisted, undoable (ADR-0018).
    //
    // A drag submits ONE `MOVE_COMPONENT`: nothing is detached and no value is touched,
    // which is the difference between reordering and "remove, then add again" — a gesture
    // that loses both the values and the rank (ADR-0019).
    //
    // The whole header is the handle. There is no separate grip: it would reserve a column
    // in every row of the panel to duplicate a target the creator already has under the
    // pointer.

    #makeReorderable(section, object, type) {
        section.dataset.type = type;
        const header = section.querySelector('header');

        // Six dots, before the caret: the one part of the header that means "carry me".
        const grip = el('span', {
            class: 'grip',
            title: `Drag to reorder ${this.#titleOf(type)}`,
            'aria-hidden': 'true'
        }, icon('grip', 16));
        header.prepend(grip);

        this.#makeDraggable(grip, header, {
            element: section,
            // Read at the moment the drag starts rather than captured now: a component
            // added or removed in between must not leave this holding a stale list.
            siblings: () => this.#orderedSections(),
            rank: () => object.componentTypes().indexOf(type),
            commit: rank => moveComponent(object, type, rank),
            // AND IT MAY LEAVE THE PANEL. Inside, the gesture ranks a component among its
            // siblings; carried out, it is a Component type the rest of the Editor may
            // name — which is the one thing a graph is allowed to store about one
            // (ADR-0034 §3.2). A list without this stays a reorder and nothing else, which
            // is what the declared properties below still are.
            payload: () => componentPayload(object, type, this.#titleOf(type))
        });
    }

    // --- one reorder gesture, for every flat list in this panel ----------------------
    //
    // TWO LISTS, ONE MECHANISM. A component's rank and a declared property's rank are the
    // same question asked about different things, and ADR-0028 §1 gives them the same
    // answer: a flat list reorganises under the pointer. Writing it twice would be two
    // chances to get the rank arithmetic subtly different — which is the one part of this
    // gesture nobody can check by looking at it.
    //
    // What differs between the two is passed in: which elements take part, what rank the
    // carried one holds in the MODEL, and what to call when the pointer is released. The
    // preview itself knows none of that.

    /**
     * Make a handle start a reorder of the list its element belongs to.
     *
     * @param {HTMLElement} handle - The grip; the only part that starts the drag
     * @param {HTMLElement} surface - Where the move and the release are heard
     * @param {object} list - `{ element, siblings, rank, commit }`
     */
    #makeDraggable(handle, surface, list) {
        handle.addEventListener('pointerdown', event => {
            event.stopPropagation();
            this.#armDrag(event, list);
        });
        handle.addEventListener('click', event => event.stopPropagation());
        surface.addEventListener('pointermove', event => this.#dragMove(event));
        surface.addEventListener('pointerup', event => this.#dragDrop(event));
        surface.addEventListener('pointercancel', () => this.#cancelDrag());
    }

    #armDrag(event, list) {
        if (event.button > 0) return;
        // A filtered panel shows a subset, so the ranks on screen are not the model's.
        if (this.#query.trim() !== '') return;

        this.#drag = {
            list,
            element: list.element,
            grip: event.currentTarget,
            pointerId: event.pointerId,
            from: event.clientY,
            started: false,
            // The rank the preview is showing, so a pointer wandering inside one row
            // does not rebuild the same layout sixty times a second.
            shown: null
        };
    }

    #dragMove(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            if (Math.abs(event.clientY - drag.from) < DRAG_THRESHOLD) return;
            drag.started = true;
            capture(drag.grip, drag.pointerId);

            // The layout as it is BEFORE anything slides. Measuring live would read the
            // animated position of an element mid-transition, so the rank would depend on
            // how far the previous answer had got to drawing itself.
            const siblings = drag.list.siblings();
            drag.siblings = siblings;
            drag.boxes = siblings.map(element => {
                const box = element.getBoundingClientRect();
                return { start: box.top, size: box.height };
            });
            drag.index = siblings.indexOf(drag.element);

            drag.element.classList.add('dragging');
        }

        event.preventDefault();

        // THE GESTURE BECOMES THE EDITOR'S WHEN IT LEAVES THIS PANEL, and not before — the
        // rule the Hierarchy already lives by (windows/hierarchy.js). Inside, the sliding
        // rows are the whole affordance; announcing from the first pixel would make the
        // shell mark this very panel as refusing a drop it is not being offered.
        // A gesture with no payload never leaves: a declared property ranks and nothing else.
        if (!drag.list.payload) {
            this.#preview(event.clientY);
            return;
        }

        const here = this.#within(event.clientX, event.clientY);
        // OVER THIS PANEL, THE SLIDING ROWS; OUTSIDE IT, NONE. A rank previewed while the
        // pointer is over the canvas would promise a reorder that releasing there will not
        // perform.
        if (here) {
            this.#preview(event.clientY);
        } else {
            this.#clearPreview(drag);
            // The rank the preview was showing goes with it. Without this, coming back to
            // the same rank finds `shown` unchanged and leaves every row flat.
            drag.shown = null;
        }

        if (here) {
            if (drag.announced) {
                drag.announced = false;
                this.#announceDrag('px-drag-end', drag.list.payload(), NOWHERE);
            }
            return;
        }

        if (!drag.announced) {
            drag.announced = true;
            this.#announceDrag('px-drag-start', drag.list.payload(), event);
            return;
        }
        this.#announceDrag('px-drag-move', null, event);
    }

    /**
     * Tell the shell where a gesture that has left this panel is.
     *
     * @param {string} name - `px-drag-start`, `px-drag-move` or `px-drag-end`
     * @param {object|null} drag - The gesture, when its payload is needed
     * @param {{clientX: number, clientY: number}} at - Where the pointer is
     */
    #announceDrag(name, payload, at) {
        this.dispatchEvent(new CustomEvent(name, {
            detail: {
                ...(payload ? { payload } : {}),
                clientX: at.clientX,
                clientY: at.clientY
            },
            bubbles: true,
            composed: true
        }));
    }

    /**
     * Make an element carry something out of this panel, and nothing inside it.
     *
     * THE SAME SHAPE AS THE TWO GESTURES ABOVE: a press arms, travel starts it, and leaving
     * the panel is what makes it the Editor's (windows/hierarchy.js). What differs is that
     * this one has no meaning at home — a type badge is not reorderable — so inside
     * the panel it simply does nothing, and the drag begins the moment the pointer is out.
     *
     * IT CLAIMS THE POINTER SO NOTHING ELSE DOES. The grip beside it already means reorder
     * and the card around it folds on a click; stopping the event here is what keeps those
     * two gestures exactly as they were.
     *
     * @param {HTMLElement} handle - The element to press
     * @param {Function} payloadOf - () => the payload this handle carries
     */
    #makeDragSource(handle, payloadOf) {
        handle.addEventListener('pointerdown', event => {
            if (event.button > 0) return;
            event.stopPropagation();
            this.#source = {
                handle,
                payloadOf,
                pointerId: event.pointerId,
                from: { x: event.clientX, y: event.clientY },
                started: false,
                announced: false
            };
            capture(handle, event.pointerId);
        });

        handle.addEventListener('pointermove', event => this.#sourceMove(event));
        handle.addEventListener('pointerup', event => this.#sourceEnd(event, event));
        handle.addEventListener('pointercancel', () => this.#sourceEnd(null, NOWHERE));
        // A press that never travelled is a click on a decoration, and must not fold the
        // section it happens to sit in.
        handle.addEventListener('click', event => event.stopPropagation());
    }

    #sourceMove(event) {
        const source = this.#source;
        if (!source || event.pointerId !== source.pointerId) return;

        if (!source.started) {
            const travelled = Math.hypot(event.clientX - source.from.x, event.clientY - source.from.y);
            if (travelled < DRAG_THRESHOLD) return;
            source.started = true;
            source.handle.classList.add('dragging');
        }

        event.preventDefault();

        // Out of the panel is what makes it a drag the Editor answers; inside, there is
        // nothing here to drop on and the shell would mark this panel as refusing.
        const here = this.#within(event.clientX, event.clientY);
        if (here) {
            if (source.announced) {
                source.announced = false;
                this.#announceDrag('px-drag-end', source.payloadOf(), NOWHERE);
            }
            return;
        }

        if (!source.announced) {
            source.announced = true;
            this.#announceDrag('px-drag-start', source.payloadOf(), event);
            return;
        }
        this.#announceDrag('px-drag-move', null, event);
    }

    #sourceEnd(event, at) {
        const source = this.#source;
        if (event && event.pointerId !== source?.pointerId) return;
        if (!source) return;

        this.#source = null;
        if (source.started) {
            release(source.handle, source.pointerId);
            source.handle.classList.remove('dragging');
        }
        if (source.announced) this.#announceDrag('px-drag-end', source.payloadOf(), at);
    }

    #dragDrop(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        const here = !drag.list.payload || this.#within(event.clientX, event.clientY);
        const rank = drag.started && here ? this.#rankUnder(event.clientY) : null;
        const list = drag.list;
        const current = list.rank();
        this.#dragged = drag.started;

        // Outside, the shell is holding this gesture and has to be told where it landed;
        // inside, it was never told about it. `#cancelDrag()` reports neither.
        const announced = drag.announced;
        drag.announced = false;
        this.#cancelDrag();
        if (announced) this.#announceDrag('px-drag-end', list.payload(), event);

        // NO insertionIndex() HERE, and that is the subtle part. That helper converts a
        // rank counted in the list WITH the carried item still in it. The preview counts
        // ranks in the resulting order instead — dnd/reflow.js is splice-out-then-splice-in,
        // which is exactly what moveComponent() and moveProperty() do — so the rank is
        // already the one the primitive wants. Adjusting it again turned every downward
        // move into a no-op.
        if (rank !== null && rank !== current) list.commit(rank);
    }

    #cancelDrag() {
        const drag = this.#drag;
        this.#drag = null;
        if (!drag) return;

        if (drag.started) {
            release(drag.grip, drag.pointerId);
            drag.element.classList.remove('dragging');
        }
        this.#clearPreview(drag);

        // A GESTURE THE PLATFORM TOOK AWAY STILL HAS TO END, or the shell keeps a ghost
        // following a drag nobody is making. It ends NOWHERE, at a point no window holds.
        if (drag.announced) this.#announceDrag('px-drag-end', drag.list.payload(), NOWHERE);
    }

    /** The component sections that take part in a reorder, in model order. */
    #orderedSections() {
        return [...(this.#body?.querySelectorAll('section[data-type]') ?? [])];
    }

    /** The declared properties of a `.px`, in model order. */
    #orderedProperties() {
        return [...(this.#body?.querySelectorAll('.property[data-property]') ?? [])];
    }

    /**
     * The rank the pointer is over, in the list as the model orders it.
     *
     * Answered from the snapshot taken when the drag began, never from the live DOM: the
     * preview slides boxes around and animates them, so measuring would make the answer
     * depend on how far the previous answer had got to drawing itself.
     *
     * @param {number} clientY - The pointer vertical position
     * @returns {number|null} A rank, or null when the drag holds no layout
     */
    #rankUnder(clientY) {
        const boxes = this.#drag?.boxes;
        if (!boxes || boxes.length === 0) return null;
        return rankAt(clientY, boxes);
    }

    /**
     * Show the list as it would be, without changing it (ADR-0028, sections 1 and 2).
     *
     * Nothing here writes: the offsets come from dnd/reflow.js, they live on the elements
     * as transforms, and the gesture ending removes them. A cancelled drag is therefore
     * not an undo, because there was never anything to undo.
     *
     * @param {number} clientY - The pointer vertical position
     */
    #preview(clientY) {
        const drag = this.#drag;
        if (!drag) return;

        const siblings = drag.siblings;
        const from = drag.index;
        if (!siblings || from === -1) return;

        const to = this.#rankUnder(clientY);
        if (to === null) return;

        if (to !== drag.shown) {
            drag.shown = to;
            const offsets = previewOffsets(drag.boxes.map(box => box.size), from, to);

            siblings.forEach((element, i) => {
                // The carried element follows the pointer instead of its computed slot: it
                // is the one thing the creator is actually holding.
                if (i === from) return;
                element.classList.add('sliding');
                element.style.transform = offsets[i] === 0 ? '' : 'translateY(' + offsets[i] + 'px)';
            });
        }

        drag.element.style.transform = 'translateY(' + (clientY - drag.from) + 'px)';
    }

    /**
     * Put every element back where the model says it is.
     * @param {object} [drag] - The gesture that is ending, when there was one
     */
    #clearPreview(drag = null) {
        const touched = drag?.siblings ?? [...this.#orderedSections(), ...this.#orderedProperties()];
        for (const element of touched) {
            element.classList.remove('sliding', 'before', 'after');
            element.style.transform = '';
        }
    }

    /**
     * What a component whose type nothing could resolve shows.
     *
     * @param {object} component - The placeholder
     * @param {string} type - The type that was not found
     * @returns {HTMLElement[]} The rows
     */
    #renderMissing(component, type) {
        const values = globalThis.Object.entries(component)
            .filter(([, value]) => typeof value !== 'function');

        return [
            el('div', { class: 'none' },
                `Its definition is missing. Nothing runs, and every value below is kept `
                + `exactly as it was saved — restoring “${type}” restores the object.`),
            ...values.map(([name, value]) => el('div', { class: 'row' },
                el('span', { class: 'label', textContent: humanise(name) }),
                el('span', { class: 'value', textContent: globalThis.String(value) })
            ))
        ];
    }

    /**
     * Build a section: a header that folds, and a body.
     *
     * `key` is what the folded state is remembered under, and it is the type rather than
     * the title: renaming a component must not silently unfold its panel (ADR-0021).
     *
     * @param {object} options - Options
     * @param {string} options.name - The section title, as it is read
     * @param {string} [options.key] - Identity for the folded state; the name by default
     * @param {string} options.glyph - Icon name
     * @param {any} options.body - Rows to show
     * @returns {HTMLElement} The section
     */
    #renderSection({ name, key = name, glyph, body }) {
        const open = !this.#folded.has(key);
        const section = el('section', { class: open ? 'open' : '' });

        // The same control a Hierarchy branch folds with: `.ghost .twisty` from the shared
        // base sheet, carrying its own `open` class so the rotation rule is the one rule
        // (ui/styles.js).
        const caret = el('span', {
            class: `ghost twisty${open ? ' open' : ''}`,
            'aria-hidden': 'true'
        }, icon('chevron', 16));

        const header = el('header', {
            title: 'Click to fold',
            onclick: () => {
                // The click that ends a drag is still a click. Folding the section a
                // creator has just moved would be the one thing they did not ask for.
                if (this.#dragged) {
                    this.#dragged = false;
                    return;
                }
                if (this.#folded.has(key)) this.#folded.delete(key);
                else this.#folded.add(key);
                const shown = !this.#folded.has(key);
                section.classList.toggle('open', shown);
                caret.classList.toggle('open', shown);
            }
        },
            caret,
            el('span', { class: 'glyph' }, icon(glyph, 16)),
            el('span', { class: 'label', textContent: name }),
            el('div', { class: 'tools' })
        );

        section.append(header, el('div', { class: 'body' }, body));
        return section;
    }

    /**
     * The control one descriptor is edited with.
     *
     * ONE PLACE DECIDES, so a `resource` property gets the same control whether it belongs
     * to a Component, to a `.px` being declared or to a graph node's params. `px-field`
     * covers every shape of VALUE; a reference is not a value a creator types, so it has
     * its own element and this is the fork between them (ui/resource-field.js).
     *
     * @param {object} target - The reactive target holding the property
     * @param {object} descriptor - A descriptor from inspector/schema.js
     * @param {object} [options] - Passed through to whichever control is built
     * @returns {HTMLElement} The bound control
     */
    #control(target, descriptor, options = {}) {
        // An Object reference is resolved in the scene rather than in the project, so it has
        // its own control for the same reason a resource does: the value is an identity, and
        // a text field over one is a debugger (ADR-0034 §3.5, ui/object-field.js).
        if (descriptor.kind === FieldKind.OBJECT) {
            return el('px-object').bind(target, descriptor, {
                scene: this.#scene ?? null,
                write: options.write ?? null
            });
        }

        // A list is drawn by a control of its own for the reason the two above are: what it
        // edits is not one value. It needs nothing from this panel, though — every row is
        // drawn from its own value, which is what `field()` checks before it lets a list be
        // one at all (inspector/schema.js).
        if (descriptor.kind === FieldKind.LIST) return el('px-list').bind(target, descriptor, options);

        if (descriptor.kind !== FieldKind.RESOURCE) return el('px-field').bind(target, descriptor, options);

        return el('px-resource').bind(target, descriptor, {
            project: this.#workspace?.project ?? null,
            write: options.write ?? null,
            // Importing from the picker takes the same rule a dropped file does, and a
            // rule acts on the model rather than on the DOM — so it is handed the context
            // the panel already builds for every other drop (ADR-0026 §6).
            context: this.#dropContext()
        });
    }

    #renderRows(target, fields) {
        return rows(fields).map(row => (row.fields.length === 1
            ? this.#renderRow(target, row.fields[0])
            : this.#renderPair(target, row)));
    }

    #renderRow(target, descriptor) {
        const field = this.#control(target, descriptor);
        const label = el('span', { class: 'label', textContent: descriptor.label });
        this.#makeDroppable(field, {
            zone: DropZone.PROPERTY,
            component: target,
            prop: descriptor.name,
            label: descriptor.label,
            accepts: descriptor.accepts ?? undefined
        }, { accept: descriptor.accepts?.mime ?? '' });
        // The panel drew the label; the field decides whether dragging it means
        // something, and owns every line of the value logic behind it.
        field.bindLabel?.(label);

        // A plain number is a value in a column of values; a slider, a colour or a
        // string is content and takes the width it needs.
        const single = isNumeric(descriptor) && descriptor.kind !== FieldKind.RANGE;
        // A list is the one control that is taller than its label, so it is the one that
        // needs the label at the top of it.
        const tall = descriptor.kind === FieldKind.LIST;

        return el('div', { class: `row${tall ? ' tall' : ''}` },
            label,
            el('div', { class: `fields${single ? ' single' : ''}` }, field, single ? el('span') : null)
        );
    }

    #renderPair(target, row) {
        const prefixes = PAIR_PREFIXES[row.fields[0].name] ?? ['', ''];

        return el('div', { class: 'row' },
            el('span', { class: 'label', textContent: row.label }),
            el('div', { class: 'fields pair' },
                row.fields.map((descriptor, index) =>
                    el('px-field').bind(target, descriptor, { prefix: prefixes[index] }))
            )
        );
    }

    #renderAddButton(object) {
        const button = el('button', {
            class: 'add',
            type: 'button',
            onclick: () => this.#openAddMenu(button, object)
        }, icon('plus', 16), el('span', { textContent: 'Add Component' }));

        return button;
    }

    #openAddMenu(anchor, object) {
        const available = availableComponents(object, this.#registry);
        const items = [];

        for (const group of groupTypes(available, this.#registry)) {
            items.push({ heading: group.category });
            for (const entry of group.entries) {
                items.push({
                    id: entry.type,
                    label: entry.label,
                    icon: iconForComponent(this.#registry.get(entry.type), entry.type)
                });
            }
        }

        // Nothing re-renders by hand afterwards: attaching announces itself on the scene,
        // and this window is already listening for that.
        openMenu(anchor, items, type => addComponent(object, type, this.#registry),
            { search: true, label: 'components' });
    }
}

/**
 * A component type name as a section title.
 *
 * `RectangleRenderer` is how the type is spelled; `Rectangle Renderer` is how it is read.
 * The registry already does this for the Add menu, but it maps types to *labels* — the
 * section shows the type it actually carries, so it splits the name instead.
 *
 * @param {string} name - The type name
 * @returns {string} The title to show
 */
/**
 * A declared property type, as the badge on its header reads it.
 * @param {string} type - One of PropertyType
 * @returns {string} The displayed name
 */
function typeLabel(type) {
    return PROPERTY_TYPE_LABELS[type] ?? type ?? '';
}

function humanise(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * One port of a graph node, reported rather than edited.
 *
 * Ports are wired on the canvas, so the panel's job is to say what a node takes and gives —
 * which matters most for the ports that CHANGE: a Set Property's value takes the shape of
 * the property it names (ADR-0027).
 *
 * @param {string} side - `In` or `Out`
 * @param {object} port - The port descriptor
 * @returns {HTMLElement} The row
 */
function portRow(side, port) {
    return el('div', { class: 'row' },
        el('span', { class: 'label', textContent: port.label || port.id }),
        el('div', { class: 'fields' },
            el('span', {
                class: 'value',
                textContent: port.kind === 'flow' ? `${side} · flow` : `${side} · ${port.type}`
            })
        )
    );
}

/**
 * A fact about a node, set as text in the value column.
 * @param {string} label - What it is
 * @param {string} value - What it says
 * @returns {HTMLElement} The row
 */
function detailRow(label, value) {
    return el('div', { class: 'row' },
        el('span', { class: 'label', textContent: label }),
        el('div', { class: 'fields' }, el('span', { class: 'value', textContent: value }))
    );
}

customElements.define('px-inspector', Inspector);

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
