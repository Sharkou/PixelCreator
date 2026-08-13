// <px-number> — a number, and the three ways of changing one.
//
// Type it, step it, or drag the label. The three exist because they suit different
// moments: typing when you know the value, stepping when you are nudging, dragging when
// you are looking at the scene rather than at the field. Blender and Unity both do this;
// Legacy had none of it, and used a text input that accepted `12foo`.
//
// IT REFUSES WHAT IS NOT A NUMBER, without fighting the person typing. `-` and `1.` are
// not numbers yet, so they are left in the box and nothing is reported; `abc` is simply
// dropped when the box is left. The rule is one-way: an incomplete entry never reaches
// the model, and the model never overwrites a box being typed into.
//
// It knows nothing about the Property System. `<px-field>` owns the binding; this owns
// the interaction — which is also why it is testable by eye in isolation.

import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';

/** Pixels of horizontal drag worth one step. */
const SCRUB_PER_STEP = 4;

export class NumberInput extends Element {

    static styles = sheet(`
        :host {
            display: flex;
            align-items: center;
            height: var(--px-control);
            background: var(--px-bg-0);
            border: 1px solid var(--px-line);
            border-radius: var(--px-radius-sm);
            overflow: hidden;
            min-width: 0;
        }

        :host(:hover) { border-color: var(--px-line-soft); }
        :host(.focused) { border-color: var(--px-accent); box-shadow: 0 0 0 2px var(--px-accent-soft); }

        .prefix {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 15px;
            height: 100%;
            flex: 0 0 auto;
            color: var(--px-text-dim);
            font-size: 10px;
            font-weight: 600;
            cursor: ew-resize;
            -webkit-user-select: none;
            user-select: none;
            touch-action: none;
        }

        .prefix:hover { color: var(--px-accent); background: var(--px-bg-2); }

        button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 17px;
            height: 100%;
            flex: 0 0 auto;
            color: var(--px-text-dim);
            opacity: 0.75;
        }

        button:hover { color: var(--px-text-strong); background: var(--px-bg-2); opacity: 1; }
        button:active { background: var(--px-bg-3); }

        input {
            flex: 1;
            min-width: 0;
            height: 100%;
            border: 0;
            border-radius: 0;
            background: none;
            box-shadow: none;
            text-align: center;
            padding: 0 2px;
        }

        input:focus { outline: none; box-shadow: none; }

        .suffix {
            padding-right: 5px;
            color: var(--px-text-dim);
            font-size: 10px;
            flex: 0 0 auto;
            -webkit-user-select: none;
            user-select: none;
        }

        :host([steppers='false']) button { display: none; }
    `);

    #config = { min: null, max: null, step: 1, integer: false, prefix: null, suffix: null, onInput: null };
    #input = null;
    #scrub = null;
    // The value lives here, not only in the input: it is usually set before the element
    // is in the document, and a control that forgot what it was told is a control that
    // shows an empty box.
    #value = null;

    /**
     * Configure the control.
     *
     * @param {object} config - Options
     * @param {number|null} [config.min] - Lower bound
     * @param {number|null} [config.max] - Upper bound
     * @param {number} [config.step] - What one arrow press or one stepper click is worth
     * @param {boolean} [config.integer] - Whole numbers only
     * @param {string} [config.prefix] - A one-letter label, draggable to scrub
     * @param {string} [config.suffix] - A unit shown after the value
     * @param {boolean} [config.steppers] - Show the − and + buttons
     * @param {Function} config.onInput - Called with the number whenever it changes
     * @returns {NumberInput} This element
     */
    configure(config) {
        this.#config = { ...this.#config, ...config };
        if (config.steppers === false) this.setAttribute('steppers', 'false');
        if (this.isConnected) this.#render();
        return this;
    }

    /** The value shown, as a number. */
    get value() {
        return this.#input ? globalThis.Number(this.#input.value) : this.#value;
    }

    set value(value) {
        // Never while it is being typed into: the caret would jump and the half-typed
        // number would vanish. This is the focus guard, one level down.
        if (this.#input && this.shadowRoot.activeElement === this.#input) return;
        this.#value = globalThis.Number.isFinite(value) ? value : null;
        if (this.#input) this.#input.value = format(this.#value);
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#render();
    }

    #render() {
        const { prefix, suffix } = this.#config;

        this.#input = el('input', {
            type: 'text',
            inputMode: 'decimal',
            spellcheck: false,
            autocomplete: 'off',
            value: format(this.#value),
            oninput: () => this.#report(this.#input.value),
            onkeydown: event => this.#onKey(event),
            onfocus: () => this.classList.add('focused'),
            onblur: () => {
                this.classList.remove('focused');
                // Whatever survived typing is normalised on the way out, so `1.` and
                // `007` do not stay on screen once the field is left.
                this.#input.value = format(this.value);
            }
        });

        fill(this.shadowRoot,
            prefix ? el('span', {
                class: 'prefix',
                textContent: prefix,
                title: `Drag to change ${prefix}`,
                onpointerdown: event => this.#beginScrub(event),
                onpointermove: event => this.#scrubTo(event),
                onpointerup: event => this.#endScrub(event),
                onpointercancel: event => this.#endScrub(event)
            }) : null,
            el('button', {
                type: 'button',
                tabIndex: -1,
                title: 'Decrease',
                'aria-label': 'Decrease',
                onclick: () => this.#nudge(-1)
            }, icon('minus', 11)),
            this.#input,
            el('button', {
                type: 'button',
                tabIndex: -1,
                title: 'Increase',
                'aria-label': 'Increase',
                onclick: () => this.#nudge(1)
            }, icon('plus', 11)),
            suffix ? el('span', { class: 'suffix', textContent: suffix }) : null
        );
    }

    #onKey(event) {
        const multiplier = event.shiftKey ? 10 : 1;

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.#nudge(multiplier);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.#nudge(-multiplier);
        } else if (event.key === 'Enter') {
            this.#input.blur();
        }
        event.stopPropagation();
    }

    #nudge(steps) {
        const from = globalThis.Number.isFinite(this.value) ? this.value : 0;
        this.#commit(from + steps * this.#config.step);
    }

    #beginScrub(event) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        this.#scrub = { from: event.clientX, value: globalThis.Number.isFinite(this.value) ? this.value : 0 };
    }

    #scrubTo(event) {
        if (!this.#scrub) return;
        const steps = Math.round((event.clientX - this.#scrub.from) / SCRUB_PER_STEP);
        this.#commit(this.#scrub.value + steps * this.#config.step);
    }

    #endScrub(event) {
        if (!this.#scrub) return;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        this.#scrub = null;
    }

    #commit(value) {
        const bounded = this.#bound(value);
        this.#input.value = format(bounded);
        this.#config.onInput?.(bounded);
    }

    #report(raw) {
        const parsed = globalThis.Number(raw);
        // Mid-entry: "-", "1.", "" are all on the way to a number. Say nothing and let
        // the creator finish.
        if (raw.trim() === '' || !globalThis.Number.isFinite(parsed)) return;
        this.#config.onInput?.(this.#bound(parsed));
    }

    #bound(value) {
        const { min, max, integer } = this.#config;
        let bounded = integer ? Math.round(value) : value;
        if (min !== null && bounded < min) bounded = min;
        if (max !== null && bounded > max) bounded = max;
        return bounded;
    }
}

function format(value) {
    if (!globalThis.Number.isFinite(value)) return '';
    return globalThis.String(globalThis.Number(value.toPrecision(12)));
}

customElements.define('px-number', NumberInput);
