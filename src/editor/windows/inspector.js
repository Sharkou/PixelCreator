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
import { icon, iconForComponent, iconForObject, iconForResource } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { searchField } from '../ui/search-field.js';
import { addComponent, availableComponents, moveComponent, removeComponent } from '../commands.js';
import { DropPosition, dropPositionAt, insertionIndex } from './drop.js';
import { describeResource } from '../inspector/resource.js';
import { describeDefinition } from '../inspector/definition.js';
import { describeNode } from '../inspector/node.js';
import { ResourceKind, baseNameOf, extensionOf, hasPayload, withExtension } from '../../project/mod.js';
import { pickFile, readAsDataUrl } from '../ui/file.js';
import { DropZone } from '../dnd/payload.js';
import { canDrop, performDrop } from '../dnd/rules.js';
import { carriesFiles, readDroppedFiles } from '../dnd/files.js';
import { describeType, groupTypes } from '../registry.js';
import { FieldKind, describeComponent, isNumeric, objectFields, rows } from '../inspector/schema.js';
import '../ui/window.js';
import '../ui/field.js';

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

/** Prefix letters for a paired row, by the property the pair starts on. */
const PAIR_PREFIXES = {
    x: ['X', 'Y'],
    width: ['W', 'H'],
    scaleX: ['X', 'Y']
};

export class Inspector extends Element {

    static styles = sheet(`
        :host { display: block; }
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
            cursor: default;
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
        section[data-type] > header { cursor: pointer; }

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
        section.dragging { opacity: 0.4; }
        section.dragging .grip { cursor: grabbing; }

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
               token with one consumer is a constant with extra steps. */
            grid-template-columns: 62px minmax(0, 1fr);
            align-items: center;
            gap: var(--px-space-2);
            min-height: calc(var(--px-control) + var(--px-space-1) + 2px);
        }

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
        .property + .property {
            margin-top: var(--px-space-2);
            padding-top: var(--px-space-2);
            border-top: 1px solid var(--px-border-subtle);
        }

        .property .remove { flex: 0 0 auto; opacity: 0.55; }
        .property:hover .remove { opacity: 1; }
        .property .remove:hover { color: var(--px-danger); }

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

        px-field.drop, .preview.drop, .none.drop, .add.drop {
            outline: 2px dashed var(--px-accent);
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
    #body = null;
    #search = null;
    #create = null;
    #query = '';
    // THE THIRD SUBJECT (ADR-0027). A graph node is neither an Object nor a Resource, and
    // it is selected on a canvas rather than in a tree — so it is held here and cleared by
    // the shell when either of the other two selections speaks, exactly as those two clear
    // each other.
    #node = null;
    /** `.px` resources whose live model is being fetched, so one render does not ask twice. */
    #attaching = new globalThis.Set();
    // View state, and only view state: which sections the creator folded away. Keyed by
    // section name so it survives selecting another object of the same shape.
    #folded = new globalThis.Set();

    /** The press on a section header that may become a reorder. */
    #drag = null;
    /** Set for exactly one click: the one that ends a drag and must not also fold. */
    #dragged = false;

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
    bind({ scene, selection, registry, workspace = null }) {
        this.#scene = scene;
        this.#selection = selection;
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
    inspectNode(node, definition = null) {
        this.#node = node ? { node, definition } : null;
        this.#render();
        return this;
    }

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
        // NOTHING TO DRAW INTO YET. The shell wires this panel's subjects while it is still
        // assembling the layout, so a selection can arrive before `connectedCallback()` has
        // built the body. Rendering then would reach for controls that do not exist; the
        // panel draws itself once it is connected, from whatever the state is by then.
        if (!this.#body) return;

        this.release('panel');

        // A graph node, a resource, or an object. All three selections are mutually
        // exclusive — the shell clears the others when one speaks — so this is a route
        // rather than a priority.
        if (this.#node) {
            this.#create.disabled = true;
            this.#renderNode(this.#node);
            return;
        }

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
                glyph: 'inspector',
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
            glyph: 'inspector',
            body: [
                description.properties.length === 0
                    ? el('div', { class: 'none', textContent: 'This Component declares no properties yet.' })
                    : description.properties.map(entry => this.#renderProperty(definition, entry)),
                add
            ]
        });
    }

    #renderProperty(definition, entry) {
        const property = definition.property(entry.id);
        if (!property) return null;

        const [name, type, fallback] = entry.fields;

        const remove = el('button', {
            class: 'ghost remove',
            type: 'button',
            title: 'Remove property',
            'aria-label': `Remove ${entry.name}`,
            onclick: () => definition.removeProperty(entry.id)
        }, icon('trash', 14));

        return el('div', { class: 'property', dataset: { property: entry.id } },
            // Letter by letter, like every other field in this panel: a rename is one
            // history entry because the field mints a batch for the typing session, not
            // because it waits for Enter (ADR-0026 §3).
            this.#renderPropertyRow(property, name, {
                write: (value, options) => definition.renameProperty(entry.id, value, options),
                extra: remove
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
    }

    #renderPropertyRow(property, descriptor, { write, extra = null }) {
        const field = el('px-field').bind(property, descriptor, { write });
        const label = el('span', { class: 'label', textContent: descriptor.label });
        field.bindLabel(label);

        return el('div', { class: 'row' },
            label,
            el('div', { class: 'fields' }, field, extra)
        );
    }

    #focusProperty(id) {
        const field = this.#body.querySelector(`.property[data-property="${id}"] px-field`);
        field?.shadowRoot?.querySelector('input')?.focus();
    }

    // --- a graph node (ADR-0027) ------------------------------------------------------
    //
    // NO CHAIN OF BRANCHES HERE EITHER. What a node exposes is its `params`, declared in the
    // node catalogue in the same shape a Component declares a property, so this renders an
    // answer `describeNode()` produced and never asks what type the node is. A node type
    // added tomorrow inspects correctly without this file changing — the rule ADR-0007 sets
    // for components, applied to nodes.

    #renderNode({ node, definition }) {
        // A PARAM CHANGE CAN CHANGE THE PORTS. `Set Property` takes the shape of the
        // property it names, so picking one rewrites what this panel reports — the same
        // reason a property's type redraws its section. The value itself needs no redraw:
        // the field observes it.
        this.track(observe(node, 'params', () => globalThis.queueMicrotask(() => this.#render())), 'panel');

        const position = el('span', { class: 'value', textContent: `${Math.round(node.x)}, ${Math.round(node.y)}` });
        for (const axis of ['x', 'y']) {
            this.track(observe(node, axis, () => {
                position.textContent = `${Math.round(node.x)}, ${Math.round(node.y)}`;
            }), 'panel');
        }

        const description = describeNode(node, {
            registry: definition?.registry,
            properties: definition?.properties() ?? [],
            issues: definition?.validate() ?? []
        });

        fill(this.#body,
            el('div', { class: 'identity' },
                el('span', { class: 'glyph' }, icon('graph', 20)),
                el('div', { class: 'who' },
                    el('span', { class: 'title', textContent: description.title }),
                    el('span', { class: 'kind', textContent: description.category })
                )
            ),
            // What is wrong with this node, in the panel that is showing it — the canvas
            // outlines it in red, and here it says why (ADR-0027).
            description.issues.length > 0
                ? el('div', { class: 'none problem', textContent: description.issues[0].message })
                : null,
            description.fields.length > 0
                ? this.#renderSection({
                    name: 'Node',
                    key: 'node:fields',
                    glyph: 'graph',
                    body: description.fields.map(descriptor => this.#renderNodeRow(node, definition, descriptor))
                })
                : null,
            this.#renderSection({
                name: 'Ports',
                key: 'node:ports',
                glyph: 'inspector',
                body: [
                    ...description.ports.inputs.map(port => portRow('In', port)),
                    ...description.ports.outputs.map(port => portRow('Out', port))
                ]
            }),
            this.#renderSection({
                name: 'Details',
                key: 'node:details',
                glyph: 'inspector',
                body: [
                    detailRow('Type', description.type),
                    // Live, so a node dragged across the canvas reads its own coordinates
                    // rather than the ones it had when the panel was drawn.
                    el('div', { class: 'row' },
                        el('span', { class: 'label', textContent: 'Position' }),
                        el('div', { class: 'fields' }, position)
                    ),
                    detailRow('Identifier', node.id)
                ]
            })
        );
    }

    #renderNodeRow(node, definition, descriptor) {
        // A node's params live inside one reactive `params` record, so the field is bound to
        // a view of the one value it edits and every write goes through `setParam` — a
        // SET_PROPERTY on the node, undoable like everything else (ADR-0027). The view is
        // not a second source of truth: nothing writes to it but the record it follows.
        const view = makeReactive({ [descriptor.name]: node.params?.[descriptor.name] ?? null });

        this.track(observe(node, 'params', change => {
            const value = change.value?.[descriptor.name] ?? null;
            if (view[descriptor.name] !== value) view[descriptor.name] = value;
        }), 'panel');

        const field = el('px-field').bind(view, descriptor, {
            write: (value, options) => definition.graph.setParam(node.id, descriptor.name, value, options)
        });

        const label = el('span', { class: 'label', textContent: descriptor.label });
        field.bindLabel(label);

        return el('div', { class: 'row' }, label, el('div', { class: 'fields' }, field));
    }

    #renderResourceIdentity(resource, description) {
        const title = el('span', { class: 'title', textContent: description.title });

        this.track(observe(this.#workspace.project.get(resource.id), 'name', change => {
            title.textContent = change.value || 'Untitled';
        }), 'panel');

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
        for (const node of this.shadowRoot.querySelectorAll('px-field, .preview, .none, .add')) {
            if (!node.pxDropZone) continue;

            const box = node.getBoundingClientRect();
            if (clientX < box.left || clientX >= box.right) continue;
            if (clientY < box.top || clientY >= box.bottom) continue;

            const verdict = canDrop(payload, node.pxDropZone);
            return verdict.allowed ? { node, zone: node.pxDropZone, verdict } : null;
        }
        return null;
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
            select: object => this.#selection.set(object)
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

        grip.addEventListener('pointerdown', event => {
            event.stopPropagation();
            this.#armDrag(event, object, type, section);
        });
        grip.addEventListener('click', event => event.stopPropagation());
        header.addEventListener('pointermove', event => this.#dragMove(event));
        header.addEventListener('pointerup', event => this.#dragDrop(event));
        header.addEventListener('pointercancel', () => this.#cancelDrag());
    }

    #armDrag(event, object, type, section) {
        if (event.button > 0) return;
        // A filtered panel shows a subset, so the ranks on screen are not the model's.
        if (this.#query.trim() !== '') return;

        this.#drag = {
            object,
            type,
            section,
            grip: event.currentTarget,
            pointerId: event.pointerId,
            from: event.clientY,
            started: false
        };
    }

    #dragMove(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            if (Math.abs(event.clientY - drag.from) < DRAG_THRESHOLD) return;
            drag.started = true;
            capture(drag.grip, drag.pointerId);
            drag.section.classList.add('dragging');
        }

        event.preventDefault();
        this.#markDrop(this.#resolveDrop(event.clientY));
    }

    #dragDrop(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId) return;

        const drop = drag.started ? this.#resolveDrop(event.clientY) : null;
        const { object, type } = drag;
        this.#dragged = drag.started;
        this.#cancelDrag();

        if (drop) moveComponent(object, type, drop.index);
    }

    #cancelDrag() {
        const drag = this.#drag;
        this.#drag = null;
        if (!drag) return;

        if (drag.started) {
            release(drag.grip, drag.pointerId);
            drag.section.classList.remove('dragging');
        }
        this.#markDrop(null);
    }

    /**
     * The rank the pointer is currently over.
     * @param {number} clientY - The pointer's vertical position
     * @returns {{index: number, section: HTMLElement, position: string}|null} The drop
     */
    #resolveDrop(clientY) {
        const drag = this.#drag;
        if (!drag) return null;

        const types = drag.object.componentTypes();
        const current = types.indexOf(drag.type);

        const sections = [...this.#body.querySelectorAll('section[data-type]')];
        const over = sections.find(section => {
            const box = section.getBoundingClientRect();
            return clientY >= box.top && clientY < box.bottom;
        });

        // Past the last section: the end of the collection, which is how a component is
        // sent behind everything that draws.
        if (!over) {
            const last = sections.at(-1);
            if (!last || clientY < last.getBoundingClientRect().bottom) return null;
            const index = insertionIndex(current, types.length);
            return index === current ? null : { index, section: last, position: DropPosition.AFTER };
        }

        if (over === drag.section) return null;

        // A section is a header and a body, so its middle is not a nesting zone: there is
        // nothing to nest a component into. Before or after, and nothing else.
        const position = dropPositionAt(clientY, over.getBoundingClientRect(), { canNest: false });
        const rank = types.indexOf(over.dataset.type);
        if (rank === -1) return null;

        const index = insertionIndex(current, position === DropPosition.AFTER ? rank + 1 : rank);
        return index === current ? null : { index, section: over, position };
    }

    /** Draw the line where the component would land, and nowhere else. */
    #markDrop(drop) {
        for (const section of this.#body?.querySelectorAll('section[data-type]') ?? []) {
            section.classList.remove('before', 'after');
        }
        if (drop) drop.section.classList.add(drop.position);
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

    #renderRows(target, fields) {
        return rows(fields).map(row => (row.fields.length === 1
            ? this.#renderRow(target, row.fields[0])
            : this.#renderPair(target, row)));
    }

    #renderRow(target, descriptor) {
        const field = el('px-field').bind(target, descriptor);
        const label = el('span', { class: 'label', textContent: descriptor.label });
        this.#makeDroppable(field, { zone: DropZone.PROPERTY, component: target, prop: descriptor.name });
        // The panel drew the label; the field decides whether dragging it means
        // something, and owns every line of the value logic behind it.
        field.bindLabel(label);

        // A plain number is a value in a column of values; a slider, a colour or a
        // string is content and takes the width it needs.
        const single = isNumeric(descriptor) && descriptor.kind !== FieldKind.RANGE;

        return el('div', { class: 'row' },
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
