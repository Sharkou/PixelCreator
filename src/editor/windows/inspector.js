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
import { describeComponent, objectFields, rows } from '../inspector/schema.js';
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

        .identity {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 9px 10px;
            border-bottom: 1px solid var(--px-line);
        }

        .identity .glyph { color: var(--px-accent); }

        .identity .title {
            flex: 1;
            font-size: 13px;
            font-weight: 600;
            color: var(--px-text-strong);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        section { border-bottom: 1px solid var(--px-line); padding-bottom: 5px; }

        section > header {
            display: flex;
            align-items: center;
            gap: 7px;
            height: calc(var(--px-hit) + 4px);
            padding: 0 5px 0 10px;
            color: var(--px-text-dim);
        }

        section > header .label {
            flex: 1;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            color: var(--px-text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        section.off > header .label, section.off .pair, section.off px-field { opacity: 0.45; }

        header .ghost { opacity: 0.6; }
        section:hover header .ghost { opacity: 1; }
        header .ghost.on { opacity: 1; color: var(--px-accent); }
        header .remove:hover { color: var(--px-danger); }

        .pair { padding: 3px 10px 4px; }

        .pair > .label {
            display: block;
            margin-bottom: 4px;
            color: var(--px-text-dim);
        }

        .pair > .fields {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }

        .none {
            padding: 4px 10px 8px;
            color: var(--px-text-dim);
            font-style: italic;
        }

        .add {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            width: calc(100% - 20px);
            margin: 12px 10px 16px;
            height: calc(var(--px-control) + 6px);
            border: 1px dashed var(--px-line-soft);
            border-radius: var(--px-radius);
            color: var(--px-text-dim);
            transition: border-color 90ms ease, color 90ms ease, background 90ms ease;
        }

        .add:hover {
            border-color: var(--px-accent);
            color: var(--px-text-strong);
            background: var(--px-accent-soft);
        }

        .empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 34px 20px;
            text-align: center;
            color: var(--px-text-dim);
            line-height: 1.5;
        }

        .empty .glyph { opacity: 0.3; }
    `);

    #scene = null;
    #selection = null;
    #registry = null;
    #body = null;

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
                el('span', { class: 'glyph' }, icon('inspector', 24)),
                el('span', { textContent: 'Select an object to inspect it.' })
            ));
            return;
        }

        const components = object.components;
        const types = globalThis.Object.keys(components);

        fill(this.#body,
            this.#renderIdentity(object),
            this.#renderSection({
                label: 'Object',
                glyph: 'object',
                fields: this.#renderRows(object, objectFields())
            }),
            types.map(type => this.#renderComponent(object, components[type], type)),
            this.#renderAddButton(object)
        );
    }

    #renderIdentity(object) {
        const title = el('span', { class: 'title', textContent: object.name || '(unnamed)' });
        const glyph = el('span', { class: 'glyph' }, icon(iconForObject(object), 15));

        this.track(object.observe('name', change => {
            title.textContent = change.value || '(unnamed)';
        }), 'panel');

        return el('div', { class: 'identity' }, glyph, title);
    }

    #renderComponent(object, component, type) {
        const label = el('span', { class: 'label', textContent: type });
        const section = el('section', {});

        // `active` is the one state a Component really has: the runtime reads it to decide
        // whether to run `update()` and `draw()` (ADR-0004). There is no per-component
        // `visible` in the model, and inventing one in the Inspector would show a control
        // that does nothing.
        const toggle = el('button', {
            class: 'ghost',
            type: 'button',
            onclick: () => component.setProperty('active', component.active === false)
        }, icon('eye', 13));

        const syncActive = () => {
            const on = component.active !== false;
            toggle.title = on ? `Disable ${type}` : `Enable ${type}`;
            toggle.setAttribute('aria-label', toggle.title);
            toggle.classList.toggle('on', !on);
            section.classList.toggle('off', !on);
            fill(toggle, icon(on ? 'eye' : 'eye-off', 13));
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
            onclick: () => removeComponent(object, type)
        }, icon('close', 13));

        const fields = describeComponent(component);

        section.append(
            el('header', {},
                icon(iconForComponent(component, type), 13),
                label,
                toggle,
                remove
            ),
            ...(fields.length === 0
                ? [el('div', { class: 'none', textContent: 'No properties' })]
                : this.#renderRows(component, fields))
        );

        return section;
    }

    #renderSection({ label, glyph, fields }) {
        return el('section', {},
            el('header', {}, icon(glyph, 13), el('span', { class: 'label', textContent: label })),
            fields
        );
    }

    #renderRows(target, fields) {
        return rows(fields).map(row => {
            if (row.fields.length === 1) {
                return el('px-field').bind(target, row.fields[0]);
            }

            const prefixes = PAIR_PREFIXES[row.fields[0].name] ?? ['', ''];
            return el('div', { class: 'pair' },
                el('span', { class: 'label', textContent: row.label }),
                el('div', { class: 'fields' },
                    row.fields.map((descriptor, index) =>
                        el('px-field').bind(target, descriptor, { prefix: prefixes[index], labelled: false }))
                )
            );
        });
    }

    #renderAddButton(object) {
        const button = el('button', {
            class: 'add',
            type: 'button',
            onclick: () => this.#openAddMenu(button, object)
        }, icon('plus', 13), el('span', { textContent: 'Add Component' }));

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

customElements.define('px-inspector', Inspector);
