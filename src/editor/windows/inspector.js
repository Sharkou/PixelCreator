// <px-inspector> — the selected object, and everything on it.
//
// ZERO KNOWLEDGE OF CONCRETE COMPONENTS. There is no `if (type === 'Transform')` here and
// there must never be one: what to show comes from `componentSchema()`, and from
// reflection when a component declares none (ADR-0007). A component a creator writes
// tomorrow — including one built from a definition, which always has a schema
// (ADR-0016) — inspects correctly without this file changing.
//
// Rebuilt on selection and on the scene's component events; individual values are not
// rebuilt at all, because each `<px-field>` is bound to its own property and updates
// itself. Editing `x` does not re-render the panel, which is what keeps focus and caret
// where the creator put them.

import { PxElement, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { addComponent, availableComponents, removeComponent } from '../commands.js';
import { describeComponent, objectFields } from '../inspector/schema.js';
import '../ui/field.js';

export class PxInspector extends PxElement {

    static styles = sheet(`
        :host { display: block; height: 100%; }
        px-panel { height: 100%; }

        .identity {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 10px 8px;
            border-bottom: 1px solid var(--px-line);
        }

        .identity .glyph { color: var(--px-accent); }

        .identity .title {
            font-size: 13px;
            font-weight: 600;
            color: var(--px-text-strong);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .identity .id {
            margin-left: auto;
            font-family: var(--px-mono);
            font-size: 10px;
            color: var(--px-text-dim);
        }

        section { border-bottom: 1px solid var(--px-line); padding-bottom: 6px; }

        section > header {
            display: flex;
            align-items: center;
            gap: 6px;
            height: 26px;
            padding: 0 6px 0 10px;
            color: var(--px-text-dim);
        }

        section > header .label {
            flex: 1;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            color: var(--px-text);
        }

        .remove {
            display: none;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border-radius: 4px;
            color: var(--px-text-dim);
        }

        section:hover .remove { display: flex; }
        .remove:hover { background: var(--px-bg-3); color: var(--px-danger); }

        .none {
            padding: 6px 10px 8px;
            color: var(--px-text-dim);
            font-style: italic;
        }

        .add {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: calc(100% - 20px);
            margin: 12px 10px;
            padding: 6px;
            border: 1px dashed var(--px-line-soft);
            border-radius: var(--px-radius);
            color: var(--px-text-dim);
        }

        .add:hover {
            border-color: var(--px-accent);
            color: var(--px-text-strong);
            background: var(--px-accent-soft);
        }

        .empty {
            padding: 16px 12px;
            color: var(--px-text-dim);
            line-height: 1.5;
        }
    `);

    #scene = null;
    #selection = null;
    #registry = null;
    #body = null;

    /**
     * Point the panel at the selection it follows.
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene
     * @param {object} context.selection - The Editor selection
     * @param {object} context.registry - Component registry the Add menu lists
     * @returns {PxInspector} This element
     */
    bind({ scene, selection, registry }) {
        this.#scene = scene;
        this.#selection = selection;
        this.#registry = registry;
        return this;
    }

    connectedCallback() {
        this.#body = el('div');
        this.shadowRoot.replaceChildren(el('px-panel', { label: 'Inspector' }, this.#body));

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
        this.release('fields');

        const object = this.#selection.object;
        if (!object) {
            fill(this.#body, el('div', {
                class: 'empty',
                textContent: 'Select an object to inspect it.'
            }));
            return;
        }

        const components = object.components;
        const types = globalThis.Object.keys(components);

        fill(this.#body,
            this.#renderIdentity(object),
            this.#renderSection('Object', objectFields().map(field => this.#field(object, field))),
            types.map(type => this.#renderComponent(object, components[type], type)),
            this.#renderAddButton(object)
        );
    }

    #renderIdentity(object) {
        const title = el('span', { class: 'title', textContent: object.name || '(unnamed)' });
        this.track(object.observe('name', change => {
            title.textContent = change.value || '(unnamed)';
        }), 'fields');

        return el('div', { class: 'identity' },
            el('span', { class: 'glyph' }, icon('object', 15)),
            title,
            el('span', { class: 'id', textContent: object.id, title: 'Object id' })
        );
    }

    #renderComponent(object, component, type) {
        const remove = el('button', {
            class: 'remove',
            type: 'button',
            title: `Remove ${type}`,
            onclick: () => removeComponent(object, type)
        }, icon('close', 13));

        const fields = describeComponent(component);

        return el('section', {},
            el('header', {},
                icon('component', 13),
                el('span', { class: 'label', textContent: type }),
                remove
            ),
            fields.length === 0
                ? el('div', { class: 'none', textContent: 'No properties' })
                : fields.map(field => this.#field(component, field))
        );
    }

    #renderSection(label, fields) {
        return el('section', {},
            el('header', {}, icon('object', 13), el('span', { class: 'label', textContent: label })),
            fields
        );
    }

    #field(target, descriptor) {
        // No tracking needed: a field subscribes on connect and releases on disconnect,
        // and the next render replaces the whole body.
        return document.createElement('px-field').bind(target, descriptor);
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
        const items = availableComponents(object, this.#registry)
            .map(type => ({ id: type, label: type, icon: 'component' }));

        // Nothing re-renders by hand afterwards: attaching announces itself on the scene,
        // and this panel is already listening for that.
        openMenu(anchor, items, type => addComponent(object, type, this.#registry));
    }
}

customElements.define('px-inspector', PxInspector);
