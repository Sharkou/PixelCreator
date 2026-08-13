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

import { observe } from '../../core/mod.js';
import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, iconForComponent, iconForObject } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { addComponent, availableComponents, removeComponent } from '../commands.js';
import { groupTypes } from '../registry.js';
import { FieldKind, describeComponent, isNumeric, objectFields, rows } from '../inspector/schema.js';
import '../ui/window.js';
import '../ui/field.js';

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

        section > header {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            height: 28px;
            /* The grip hangs exactly one space unit outside the content edge the rows
               start on, which is the relationship the maquette draws. */
            padding: 0 var(--px-space-1);
            color: var(--px-text-muted);
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }

        section > header:hover { background: var(--px-surface-raised); }

        /* Always present, never conditional: a slot that appears only on some sections
           is what puts every caret below it at a different x. */
        header .grip {
            display: flex;
            width: 12px;
            flex: 0 0 auto;
            justify-content: center;
            color: var(--px-border-subtle);
        }

        header .caret {
            display: flex;
            flex: 0 0 auto;
            color: var(--px-text-dim);
            transition: transform var(--px-duration-fast) var(--px-ease);
        }

        section.open > header .caret { transform: rotate(90deg); }
        header .glyph { display: flex; flex: 0 0 auto; color: var(--px-text-dim); }

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
    // View state, and only view state: which sections the creator folded away. Keyed by
    // section name so it survives selecting another object of the same shape.
    #folded = new globalThis.Set();

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
            this.shadowRoot.append(
                el('px-window', { label: 'Inspector', icon: 'inspector' }, this.#body)
            );
        }

        this.track(this.#selection.observe(() => this.#render()));

        // A component appearing or disappearing changes what there is to show — and it
        // can come from anywhere, not only from the button below.
        for (const event of ['component:added', 'component:removed']) {
            this.track(this.#scene.on(event, payload => {
                if (this.#selection.has(payload.object)) this.#render();
            }));
        }

        this.#render();
    }

    #render() {
        this.release('panel');

        const object = this.#selection.object;
        if (!object) {
            fill(this.#body, el('div', { class: 'empty' },
                el('span', { class: 'glyph' }, icon('inspector', 20)),
                el('span', { textContent: 'Select an object to inspect it.' })
            ));
            return;
        }

        const components = object.components;
        const types = globalThis.Object.keys(components);

        fill(this.#body,
            this.#renderIdentity(object, types.length),
            this.#renderSection({
                name: 'Object',
                glyph: 'object',
                body: this.#renderRows(object, objectFields())
            }),
            types.map(type => this.#renderComponent(object, components[type], type)),
            this.#renderAddButton(object)
        );
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

    #renderComponent(object, component, type) {
        const section = this.#renderSection({
            name: type,
            glyph: iconForComponent(component, type),
            body: (() => {
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
            toggle.title = on ? `Disable ${type}` : `Enable ${type}`;
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
            title: `Remove ${type}`,
            'aria-label': `Remove ${type}`,
            onclick: event => {
                event.stopPropagation();
                removeComponent(object, type);
            }
        }, icon('close', 16));

        section.querySelector('.tools').append(toggle, remove);
        return section;
    }

    /**
     * Build a section: a header that folds, and a body.
     *
     * @param {object} options - Options
     * @param {string} options.name - The section title, and the key its folded state uses
     * @param {string} options.glyph - Icon name
     * @param {any} options.body - Rows to show
     * @returns {HTMLElement} The section
     */
    #renderSection({ name, glyph, body }) {
        const open = !this.#folded.has(name);
        const section = el('section', { class: open ? 'open' : '' });

        const header = el('header', {
            title: 'Click to fold',
            onclick: () => {
                if (this.#folded.has(name)) this.#folded.delete(name);
                else this.#folded.add(name);
                section.classList.toggle('open', !this.#folded.has(name));
            }
        },
            el('span', { class: 'grip' }),
            el('span', { class: 'caret' }, icon('chevron', 16)),
            el('span', { class: 'glyph' }, icon(glyph, 16)),
            el('span', { class: 'label', textContent: humanise(name) }),
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
        openMenu(anchor, items, type => addComponent(object, type, this.#registry));
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
