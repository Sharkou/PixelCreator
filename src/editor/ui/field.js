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
// numbers keep their decimals, and the control is chosen from the schema rather than from
// what the value happens to look like right now.
//
// WRITES GO THROUGH setProperty(). The Editor states an intent, so it takes the
// controlled path and produces an Operation (CONVENTIONS.md). A plain `=` here would
// change the value and never replicate, never undo, and never say so.

import { observe } from '../../core/mod.js';
import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { FieldKind, formatValue, isNumeric, parseValue, toDisplay } from '../inspector/schema.js';
import './number-input.js';

export class Field extends Element {

    static styles = sheet(`
        :host {
            display: grid;
            grid-template-columns: 86px minmax(0, 1fr);
            align-items: center;
            gap: 8px;
            padding: 3px 10px;
            min-height: calc(var(--px-control) + 6px);
        }

        /* Half of a pair: no label, no padding — the row around it provides both. */
        :host([bare]) {
            display: block;
            padding: 0;
            min-height: 0;
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
            min-width: 0;
        }

        .control > input[type='range'] { flex: 1; }

        .amount {
            flex: 0 0 auto;
            width: 38px;
            text-align: right;
            font-family: var(--px-mono);
            font-size: 10px;
            color: var(--px-text);
        }

        .unit { color: var(--px-text-dim); font-size: 10px; flex: 0 0 auto; }

        .readonly {
            color: var(--px-text-dim);
            font-family: var(--px-mono);
            font-size: 11px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        input[type='color'] { width: 44px; flex: 0 0 auto; }
        input[type='checkbox'] { justify-self: start; }
    `);

    #target = null;
    #descriptor = null;
    #control = null;
    #echo = null;
    // Private, and not properties on the host: `prefix` is a read-only DOM getter on
    // Element, so assigning it throws. Shadowing a global class means living by its
    // surface (CONVENTIONS.md).
    #prefix = null;
    #labelled = true;

    /**
     * Point the field at a property.
     *
     * @param {object} target - The reactive Object or component holding the property
     * @param {object} descriptor - A descriptor from inspector/schema.js
     * @param {object} [options] - Options
     * @param {string} [options.prefix] - A one-letter label inside the control, for pairs
     * @param {boolean} [options.labelled] - Draw the label; pairs draw their own
     * @returns {Field} This field
     */
    bind(target, descriptor, { prefix = null, labelled = true } = {}) {
        this.#target = target;
        this.#descriptor = descriptor;
        this.#prefix = prefix;
        this.#labelled = labelled;
        this.toggleAttribute('bare', !labelled);
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

        this.#echo = null;
        this.#control = this.#createControl(descriptor, value);
        if (descriptor.tooltip) this.title = descriptor.tooltip;

        fill(this.shadowRoot,
            this.#labelled
                ? el('label', { textContent: descriptor.label, title: descriptor.tooltip ?? descriptor.name })
                : null,
            el('div', { class: 'control' },
                this.#control,
                this.#echo,
                descriptor.unit && !isNumeric(descriptor) ? el('span', { class: 'unit', textContent: descriptor.unit }) : null
            )
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

        // Bounded at both ends: a slider, with the number beside it so the value is still
        // readable and still exact.
        if (descriptor.kind === FieldKind.RANGE) {
            this.#echo = el('span', { class: 'amount', textContent: formatValue(descriptor, value) });
            return el('input', {
                type: 'range',
                min: descriptor.min * descriptor.scale,
                max: descriptor.max * descriptor.scale,
                step: descriptor.step ?? sliderStep(descriptor),
                value: toDisplay(descriptor, value) ?? 0,
                disabled: descriptor.readonly,
                oninput: event => this.#push(event.target.value)
            });
        }

        if (isNumeric(descriptor)) {
            const number = el('px-number');
            number.configure({
                min: descriptor.min === null ? null : descriptor.min * descriptor.scale,
                max: descriptor.max === null ? null : descriptor.max * descriptor.scale,
                step: descriptor.step ?? 1,
                integer: descriptor.kind === FieldKind.INT,
                prefix: this.#prefix,
                suffix: descriptor.unit,
                onInput: amount => this.#push(amount)
            });
            number.value = toDisplay(descriptor, value);
            return number;
        }

        return el('input', {
            type: 'text',
            spellcheck: false,
            value: formatValue(descriptor, value),
            readOnly: descriptor.readonly,
            oninput: event => this.#push(event.target.value),
            onkeydown: event => event.stopPropagation()
        });
    }

    /** Send what the creator entered to the model. */
    #push(raw) {
        const descriptor = this.#descriptor;
        const value = parseValue(descriptor, raw);

        // An entry that is not a value yet leaves the model alone. Writing NaN on the way
        // to "-1" is how a field ends up fighting the person typing into it.
        if (value === undefined) return;

        this.#target.setProperty(descriptor.name, value);
    }

    /** Bring a model change into the control, unless it is being typed into. */
    #pull(value) {
        const control = this.#control;
        if (!control) return;

        const descriptor = this.#descriptor;
        if (this.#echo) this.#echo.textContent = formatValue(descriptor, value);

        // A `<px-number>` guards its own inner input; everything else is compared here.
        // Either way the rule is the same one Legacy had: never overwrite what has focus.
        if (control.tagName !== 'PX-NUMBER' && this.shadowRoot.activeElement === control) return;

        if (descriptor.kind === FieldKind.BOOLEAN) control.checked = Boolean(value);
        else if (descriptor.kind === FieldKind.COLOR) control.value = colorOrBlack(value);
        else if (descriptor.kind === FieldKind.READONLY) control.textContent = formatValue(descriptor, value);
        else if (isNumeric(descriptor)) control.value = toDisplay(descriptor, value) ?? '';
        else control.value = formatValue(descriptor, value);
    }
}

function sliderStep(descriptor) {
    const span = (descriptor.max - descriptor.min) * descriptor.scale;
    // A hundred stops across the range: fine enough to feel continuous, coarse enough
    // that the number beside it stays readable.
    return span / 100;
}

function colorOrBlack(value) {
    // `<input type="color">` has no empty state; a component whose colour has never been
    // set shows black rather than refusing to render.
    return /^#[0-9a-f]{6}$/i.test(globalThis.String(value)) ? value : '#000000';
}

customElements.define('px-field', Field);
