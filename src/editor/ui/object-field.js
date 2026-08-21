// <px-object> — the control an `objectref` property is edited with (ADR-0034 §3.5).
//
// WHAT IT IS THE TWIN OF. `ui/resource-field.js` exists because a `ResourceId` is opaque
// and a text field over one invites a creator to type across a reference they cannot read
// back. An `ObjectId` is the same kind of value one scope down, so it gets the same kind of
// control: show WHAT it points at, and offer the two gestures that make sense on it — pick,
// and clear.
//
// WHAT IT DELIBERATELY IS NOT. There is no thumbnail, no import and no drop. An Object is
// not a file, nothing brings one in from outside, and the drag rules refuse every drop onto
// the graph for reasons ADR-0034 §3.7 states. What is left is a picker over the scene.
//
// THE LIST IS IN CANONICAL ORDER, which is the order the Hierarchy shows and the order the
// graph's own searches answer in (ADR-0034 §3.1). A creator picking from this menu and a
// `Find By Tag` running in the graph are reading one order, not two.
//
// A DEAD REFERENCE IS RED, NEVER BLANK. An Object that has been deleted leaves its identity
// behind on purpose — the value is preserved, the resolution answers nothing, and the fact
// is shown where a human can see it (ADR-0034 §3.4). Blanking it would be the Editor
// quietly deciding what the creator meant.
//
// IT HOLDS NO SCENE OF ITS OWN. The scene is handed in by the panel that binds it, exactly
// as the project is for a resource: this element is a control, and which scene it is looking
// at is a fact about the panel (ADR-0006).

import { hierarchyOrder, observe } from '../../core/mod.js';
import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';

export class ObjectField extends Element {

    static styles = sheet(`
        :host { display: block; min-width: 0; }

        .control {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            min-width: 0;
            width: 100%;
            height: var(--px-control);
            padding: 0 var(--px-space-0) 0 var(--px-space-1);
            background: var(--px-surface-input);
            border: 1px solid var(--px-border-subtle);
            border-radius: var(--px-radius-sm);
            color: var(--px-text);
            font: inherit;
            font-size: var(--px-text-xs);
            text-align: left;
            cursor: pointer;
            transition: border-color var(--px-duration-fast) var(--px-ease);
        }

        .control:hover { border-color: var(--px-accent-border); }
        .control:focus-visible { outline: 2px solid var(--px-accent); outline-offset: -1px; }

        :host([disabled]) .control { cursor: default; color: var(--px-text-dim); }
        :host([disabled]) .control:hover { border-color: var(--px-border-subtle); }

        .glyph { flex: 0 0 auto; display: flex; color: var(--px-text-dim); }

        .name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* An empty reference reads as empty, and does not pretend to hold a value. */
        .name.empty { color: var(--px-text-dim); font-style: italic; }

        /* An Object that is no longer in the scene. Never blank: a dangling reference is a
           fact the creator has to be able to see. */
        .name.missing { color: var(--px-danger); }

        .clear {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 18px;
            height: 18px;
            padding: 0;
            border: 0;
            border-radius: var(--px-radius-sm);
            background: none;
            color: var(--px-text-dim);
            cursor: pointer;
            opacity: 0;
        }

        :host(:hover) .clear, .clear:focus-visible { opacity: 1; }
        .clear:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
    `);

    #target = null;
    #descriptor = null;
    #scene = null;
    #write = null;

    /**
     * Point the control at a property.
     *
     * @param {object} target - The reactive record holding the value
     * @param {object} descriptor - A descriptor from inspector/schema.js
     * @param {object} [options] - Options
     * @param {object} [options.scene] - The scene the reference is resolved in
     * @param {Function} [options.write] - Writer to use instead of `target.setProperty`
     * @returns {ObjectField} This element
     */
    bind(target, descriptor, { scene = null, write = null } = {}) {
        this.#target = target;
        this.#descriptor = descriptor;
        this.#scene = scene;
        this.#write = write;

        this.toggleAttribute('disabled', Boolean(descriptor?.readonly));
        if (this.isConnected) this.#render();
        return this;
    }

    connectedCallback() {
        if (this.#descriptor) this.#render();
    }

    /** The Object the property currently points at, or null when it points at nothing. */
    get object() {
        const id = this.#target?.[this.#descriptor?.name] ?? null;
        return (id && this.#scene?.get(id)) || null;
    }

    #render() {
        this.release('binding');

        const descriptor = this.#descriptor;
        const id = this.#target[descriptor.name] ?? null;
        const object = this.object;

        const button = el('button', {
            class: 'control',
            type: 'button',
            disabled: Boolean(descriptor.readonly),
            onclick: event => {
                event.stopPropagation();
                this.#openPicker(button);
            }
        },
            el('span', { class: 'glyph' }, icon('object', 16)),
            el('span', {
                class: `name${id ? (object ? '' : ' missing') : ' empty'}`,
                textContent: id ? object?.name || 'Missing object' : 'None'
            })
        );

        const clear = id && !descriptor.readonly
            ? el('button', {
                class: 'clear',
                type: 'button',
                title: `Clear ${descriptor.label}`,
                'aria-label': `Clear ${descriptor.label}`,
                onclick: event => {
                    event.stopPropagation();
                    this.#assign(null);
                }
            }, icon('close', 16))
            : null;

        fill(this.shadowRoot, el('div', { style: 'display:flex;align-items:center;gap:2px;min-width:0' },
            button, clear));

        // The reference itself, and the name of what it points at: renaming an object in
        // the Hierarchy retitles this control on the keystroke, with no redraw.
        this.track(observe(this.#target, descriptor.name, () => this.#render()), 'binding');
        if (object) this.track(observe(object, 'name', () => this.#render()), 'binding');
    }

    /** The objects a creator may choose, in the order the Hierarchy shows them. */
    #candidates() {
        return this.#scene ? hierarchyOrder(this.#scene) : [];
    }

    #openPicker(anchor) {
        if (this.#descriptor.readonly) return;

        const items = [];
        if (this.#target[this.#descriptor.name]) items.push({ id: '', label: 'None', icon: 'close' });

        for (const object of this.#candidates()) {
            items.push({ id: object.id, label: object.name || 'Untitled', icon: 'object' });
        }

        openMenu(anchor, items, id => this.#assign(id || null), {
            search: items.length > 6,
            label: 'objects'
        });
    }

    #assign(id) {
        if (this.#write) this.#write(id);
        else this.#target.setProperty(this.#descriptor.name, id);
    }
}

customElements.define('px-object', ObjectField);
