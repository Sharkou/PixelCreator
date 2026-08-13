// <px-field> — one property, bound both ways.
//
// A CONTROL, NOT A ROW. It used to draw its own label and its own `label | value` grid,
// which meant the Inspector carried a second copy of that grid for paired properties and
// the two were kept in step by a shared token. One layout, defined twice, in two shadow
// roots. The row now belongs to the panel that arranges rows (`windows/inspector.js`) and
// this element is the cell that goes in it — which is also how the design prototype is
// built, and the reason its Inspector reads as a single grid.
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
// THE LABEL IS STILL A HANDLE, even though the field no longer owns it. `bindLabel()`
// takes the element the panel drew and makes it scrub this property. The panel keeps the
// layout, the field keeps every line of value logic — nothing about reading, converting
// or writing a property leaves this file.
//
// WHAT A GESTURE STARTS FROM. A stepper, a scrub or an arrow key moves the value the
// MODEL holds (`toDisplayExact`), never the shortened form the box is showing. Typing is
// the exception, and it has to be: a creator types over what they can see.
//
// WRITES GO THROUGH setProperty(). The Editor states an intent, so it takes the
// controlled path and produces an Operation (CONVENTIONS.md). A plain `=` here would
// change the value and never replicate, never undo, and never say so.

import { observe } from '../../core/mod.js';
import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { attachScrub } from './scrub.js';
import {
    FieldKind,
    formatValue,
    isNumeric,
    parseValue,
    toDisplay,
    toDisplayExact
} from '../inspector/schema.js';
import './number-input.js';

export class Field extends Element {

    static styles = sheet(`
        :host {
            display: block;
            min-width: 0;
        }

        .control {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            min-width: 0;
        }

        /* Anything that holds a value fills its cell; anything that is a switch or a
           swatch takes only what it needs. */
        .control > px-number,
        .control > input[type='text'],
        .control > input[type='range'],
        .control > select { flex: 1; min-width: 0; }

        .control > input[type='checkbox'] { flex: 0 0 auto; }
        .control > input[type='color'] { width: 44px; flex: 0 0 auto; }

        .amount {
            flex: 0 0 auto;
            width: 34px;
            text-align: right;
            font-family: var(--px-font-mono);
            font-variant-numeric: tabular-nums;
            /* The same step as the value inside a px-number: a slider's readout is a
               value too, and the two sit on adjacent rows. */
            font-size: var(--px-text-xs);
            color: var(--px-text);
        }

        .unit {
            flex: 0 0 auto;
            font-family: var(--px-font-mono);
            font-size: var(--px-text-2xs);
            color: var(--px-text-dim);
        }

        .readonly {
            flex: 1;
            min-width: 0;
            color: var(--px-text-dim);
            font-family: var(--px-font-mono);
            font-size: var(--px-text-xs);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `);

    #target = null;
    #descriptor = null;
    #control = null;
    #echo = null;
    // Private, and not a property on the host: `prefix` is a read-only DOM getter on
    // Element, so assigning it throws. Shadowing a global class means living by its
    // surface (CONVENTIONS.md).
    #prefix = null;

    /**
     * Point the field at a property.
     *
     * @param {object} target - The reactive Object or component holding the property
     * @param {object} descriptor - A descriptor from inspector/schema.js
     * @param {object} [options] - Options
     * @param {string} [options.prefix] - A one-letter label inside the control, for pairs
     * @returns {Field} This field
     */
    bind(target, descriptor, { prefix = null } = {}) {
        this.#target = target;
        this.#descriptor = descriptor;
        this.#prefix = prefix;
        this.toggleAttribute('disabled', Boolean(descriptor?.readonly));
        if (descriptor?.tooltip) this.title = descriptor.tooltip;
        if (this.isConnected) this.#render();
        return this;
    }

    /**
     * Make an element the scrub handle for this property.
     *
     * The panel owns the label — it is part of the row's grid — so the field is handed it
     * and decides whether dragging it means anything. Tracked apart from the binding, so
     * a re-render does not silently drop it.
     *
     * @param {HTMLElement} element - The label the panel drew
     * @returns {boolean} True when the element became a handle
     */
    bindLabel(element) {
        this.release('label');

        const descriptor = this.#descriptor;
        if (!descriptor) return false;

        const scrubbable = isNumeric(descriptor)
            && descriptor.kind !== FieldKind.RANGE
            && !descriptor.readonly;

        if (!scrubbable) {
            element.title = descriptor.tooltip ?? descriptor.name;
            return false;
        }

        element.classList.add('handle');
        element.title = `Drag to change ${descriptor.label}`;
        this.track(attachScrub(element, {
            read: () => toDisplayExact(descriptor, this.#target[descriptor.name]) ?? 0,
            write: amount => this.#push(amount),
            step: () => descriptor.step ?? 1
        }), 'label');

        return true;
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

        fill(this.shadowRoot,
            el('div', { class: 'control' },
                this.#control,
                this.#echo,
                descriptor.unit && !isNumeric(descriptor)
                    ? el('span', { class: 'unit', textContent: descriptor.unit })
                    : null
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
                // What the box shows is shortened; what a stepper moves is not.
                source: () => toDisplayExact(descriptor, this.#target[descriptor.name]),
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
