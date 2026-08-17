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

import { isMissingComponent, observe } from '../../core/mod.js';
import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForComponent, iconForObject } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { searchField } from '../ui/search-field.js';
import { addComponent, availableComponents, moveComponent, removeComponent } from '../commands.js';
import { DropPosition, dropPositionAt, insertionIndex } from './drop.js';
import { describeType, groupTypes } from '../registry.js';
import { FieldKind, describeComponent, isNumeric, objectFields, rows } from '../inspector/schema.js';
import '../ui/window.js';
import '../ui/field.js';

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

        /* The order of these sections is the order the runtime updates in and the
           renderer draws in (ADR-0018), so it is edited here, by dragging a header. */
        section[data-type] > header { cursor: grab; }
        section.dragging { opacity: 0.4; }
        section.dragging > header { cursor: grabbing; }

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
    #body = null;
    #search = null;
    #create = null;
    #query = '';
    // View state, and only view state: which sections the creator folded away. Keyed by
    // section name so it survives selecting another object of the same shape.
    #folded = new globalThis.Set();

    /** The press on a section header that may become a reorder. */
    #drag = null;
    /** Set for exactly one click: the one that ends a drag and must not also fold. */
    #dragged = false;

    /**
     * Point the window at the selection it follows.
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene
     * @param {object} context.selection - The Editor selection
     * @param {object} context.registry - Component registry the Add menu lists
     * @returns {Inspector} This element
     */
    bind({ scene, selection, registry }) {
        this.#scene = scene;
        this.#selection = selection;
        this.#registry = registry;
        return this;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) {
            this.#body = el('div');

            // The same two actions the Hierarchy carries, in the same order and built from
            // the same primitives: find what is already there, then add. A creator who has
            // learned one header has learned both.
            this.#search = searchField({
                placeholder: 'Search components',
                label: 'components',
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

            this.shadowRoot.append(
                el('px-window', { label: 'Inspector', icon: 'inspector' },
                    el('div', { class: 'actions', slot: 'actions' }, this.#search.toggle, create),
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

        this.#render();
    }

    #render() {
        this.release('panel');

        const object = this.#selection.object;
        this.#create.disabled = !object;

        if (!object) {
            fill(this.#body, el('div', { class: 'empty' },
                el('span', { class: 'glyph' }, icon('inspector', 20)),
                el('span', { textContent: 'Select an object to inspect it.' })
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

        header.addEventListener('pointerdown', event => this.#armDrag(event, object, type, section));
        header.addEventListener('pointermove', event => this.#dragMove(event));
        header.addEventListener('pointerup', event => this.#dragDrop(event));
        header.addEventListener('pointercancel', () => this.#cancelDrag());
    }

    #armDrag(event, object, type, section) {
        if (event.button > 0) return;
        // A filtered panel shows a subset, so the ranks on screen are not the model's.
        if (this.#query.trim() !== '') return;
        // The tools are buttons; a press on one is not the start of a move.
        if (event.target.closest('.tools')) return;

        this.#drag = {
            object,
            type,
            section,
            header: event.currentTarget,
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
            capture(drag.header, drag.pointerId);
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
            release(drag.header, drag.pointerId);
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
