// <px-field> — one property, bound both ways.
//
// This is the scoped binding ADR-0006 requires. Legacy found its views with
// `document.getElementsByClassName(id + '-' + prop)` and wrote into all of them from the
// module that made the change; a shadow root makes that query return nothing, silently.
// Here the direction is reversed: the field subscribes to the property it displays, and
// the writer knows about nobody.
//
// What is preserved exactly, because it is the ergonomics of the product and not an
// implementation detail:
//
//   - letter-by-letter propagation — typing in the Inspector updates the Hierarchy on
//     every keystroke, through the model, with no debounce;
//   - the focus guard — the field being typed into is never overwritten by an incoming
//     change, so the caret cannot jump.
//
// What is added: `disconnectedCallback` releases the subscription (Legacy never did),
// and numbers keep their decimals.
//
// WRITES GO THROUGH setProperty(). The Editor states an intent, so it takes the
// controlled path and produces an Operation (CONVENTIONS.md). A plain `=` here would
// change the value and never replicate, never undo, and never say so.

import { observe } from '../../core/mod.js';
import { PxElement, el } from './element.js';
import { sheet } from './styles.js';
import { FieldKind, formatValue, parseValue } from '../inspector/schema.js';

export class PxField extends PxElement {

    static styles = sheet(`
        :host {
            display: grid;
            grid-template-columns: 88px minmax(0, 1fr);
            align-items: center;
            gap: 8px;
            padding: 2px 10px;
            min-height: 24px;
        }

        label {
            color: var(--px-text-dim);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: default;
        }

        .control {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .unit {
            color: var(--px-text-dim);
            font-size: 10px;
            flex: 0 0 auto;
        }

        .readonly {
            color: var(--px-text-dim);
            font-family: var(--px-mono);
            font-size: 11px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        input[type='checkbox'] { margin: 0; }
        input[type='color'] { width: 46px; flex: 0 0 auto; }
    `);

    #target = null;
    #descriptor = null;
    #input = null;

    /**
     * Point the field at a property.
     *
     * @param {object} target - The reactive Object or component holding the property
     * @param {object} descriptor - A descriptor from inspector/schema.js
     * @returns {PxField} This field
     */
    bind(target, descriptor) {
        this.#target = target;
        this.#descriptor = descriptor;
        if (this.isConnected) this.#render();
        return this;
    }

    connectedCallback() {
        if (this.#descriptor) this.#render();
    }

    #render() {
        this.release('binding');

        const descriptor = this.#descriptor;
        const target = this.#target;
        const value = target[descriptor.name];

        this.#input = this.#createControl(descriptor, value);
        if (descriptor.tooltip) this.title = descriptor.tooltip;

        const control = el('div', { class: 'control' },
            this.#input,
            descriptor.unit ? el('span', { class: 'unit', textContent: descriptor.unit }) : null
        );

        this.shadowRoot.replaceChildren(
            el('label', { textContent: descriptor.label, title: descriptor.tooltip ?? descriptor.name }),
            control
        );

        this.track(observe(target, descriptor.name, change => this.#pull(change.value)), 'binding');
    }

    #createControl(descriptor, value) {
        if (descriptor.kind === FieldKind.READONLY) {
            return el('span', { class: 'readonly', textContent: formatValue(descriptor, value) });
        }

        if (descriptor.kind === FieldKind.BOOLEAN) {
            return el('input', {
                type: 'checkbox',
                checked: Boolean(value),
                disabled: descriptor.readonly,
                onchange: event => this.#push(event.target.checked)
            });
        }

        if (descriptor.kind === FieldKind.ENUM) {
            const select = el('select', {
                disabled: descriptor.readonly,
                onchange: event => this.#push(event.target.value)
            }, descriptor.values.map(option => el('option', { value: option, textContent: option })));
            select.value = globalThis.String(value ?? '');
            return select;
        }

        if (descriptor.kind === FieldKind.COLOR) {
            return el('input', {
                type: 'color',
                value: colorOrBlack(value),
                disabled: descriptor.readonly,
                oninput: event => this.#push(event.target.value)
            });
        }

        // Numbers use a text input rather than `type="number"`: the spinner and the
        // browser's own validation get in the way of an incomplete entry like "-" or
        // "1.", and parsing is already the schema module's job.
        return el('input', {
            type: 'text',
            spellcheck: false,
            inputMode: numericKind(descriptor.kind) ? 'decimal' : undefined,
            value: formatValue(descriptor, value),
            readOnly: descriptor.readonly,
            oninput: event => this.#push(event.target.value),
            onblur: () => this.#pull(this.#target[descriptor.name])
        });
    }

    /** Send what the creator typed to the model. */
    #push(raw) {
        const descriptor = this.#descriptor;
        const value = parseValue(descriptor, raw);

        // An entry that is not a value yet leaves the model alone. Writing NaN on the way
        // to "-1" is how a field ends up fighting the person typing into it.
        if (value === undefined) return;

        this.#target.setProperty(descriptor.name, value);
    }

    /** Bring a model change into the input, unless it is being typed into. */
    #pull(value) {
        const input = this.#input;
        if (!input || this.shadowRoot.activeElement === input) return;

        const descriptor = this.#descriptor;

        if (descriptor.kind === FieldKind.BOOLEAN) input.checked = Boolean(value);
        else if (descriptor.kind === FieldKind.COLOR) input.value = colorOrBlack(value);
        else if (descriptor.kind === FieldKind.READONLY) input.textContent = formatValue(descriptor, value);
        else input.value = formatValue(descriptor, value);
    }
}

function numericKind(kind) {
    return kind === FieldKind.NUMBER || kind === FieldKind.INT;
}

function colorOrBlack(value) {
    // `<input type="color">` has no empty state; a component whose colour has never been
    // set shows black rather than refusing to render.
    return /^#[0-9a-f]{6}$/i.test(globalThis.String(value)) ? value : '#000000';
}

customElements.define('px-field', PxField);
