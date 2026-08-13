// <px-number> — a number, and the three ways of changing one.
//
// Type it, step it, or drag the prefix. The three exist because they suit different
// moments: typing when you know the value, stepping when you are nudging, dragging when
// you are looking at the scene rather than at the field. Blender and Unity both do this;
// Legacy had none of it, and used a text input that accepted `12foo`.
//
// IT REFUSES WHAT IS NOT A NUMBER, without fighting the person typing. `-` and `1.` are
// not numbers yet, so they are left in the box and nothing is reported; `abc` is simply
// dropped when the box is left. The rule is one-way: an incomplete entry never reaches
// the model, and the model never overwrites a box being typed into.
//
// THE STEPPERS ARE STACKED, AND THAT IS THE WHOLE POINT OF THE SHAPE. Two side buttons
// cost 34 px of a field that has about 90 to spend inside a 304 px panel; one 11 px
// column carries both arrows and gives the digits back the room they need. They are also
// quiet until the field is hovered or focused, because a row of arrows repeated eight
// times down a panel is noise, not affordance.
//
// HOLDING ONE REPEATS. A creator nudging a position from 120 to 140 should not click
// twenty times, and the repeat starts late enough that a single click stays a single
// step.
//
// It knows nothing about the Property System. `<px-field>` owns the binding; this owns
// the interaction — which is also why it is testable by eye in isolation.

import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { attachScrub } from './scrub.js';

/** How long a stepper is held before it starts repeating. */
const REPEAT_DELAY = 320;

/** How often it repeats after that. */
const REPEAT_EVERY = 45;

export class NumberInput extends Element {

    static styles = sheet(`
        :host {
            display: flex;
            align-items: center;
            height: var(--px-control);
            background: var(--px-surface-input);
            border: 1px solid var(--px-border);
            border-radius: var(--px-radius-sm);
            overflow: hidden;
            min-width: 0;
            transition: border-color var(--px-duration-fast) var(--px-ease),
                        box-shadow var(--px-duration-fast) var(--px-ease);
        }

        :host(:hover) { border-color: var(--px-border-subtle); }

        :host(.focused) {
            border-color: var(--px-accent);
            box-shadow: 0 0 0 2px var(--px-accent-muted);
        }

        /* The prefix is the scrub handle, which is why it is a letter and not an icon:
           it names the axis and it is wide enough to grab. */
        .prefix {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 15px;
            height: 100%;
            flex: 0 0 auto;
            font-family: var(--px-font-mono);
            font-size: var(--px-text-2xs);
            font-weight: var(--px-weight-bold);
            color: var(--px-text-dim);
            cursor: ew-resize;
            touch-action: none;
            -webkit-user-select: none;
            user-select: none;
            transition: color var(--px-duration-fast) var(--px-ease),
                        background var(--px-duration-fast) var(--px-ease);
        }

        .prefix:hover, .prefix.scrubbing {
            color: var(--px-accent);
            background: var(--px-accent-muted);
        }

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
            /* A value is set one step below the interface text. Digits are read, not
               scanned, and the smaller face buys two more characters before a long
               coordinate starts scrolling inside its own box. */
            font-size: var(--px-text-xs);
        }

        input:focus { outline: none; box-shadow: none; }

        .suffix {
            padding-right: var(--px-space-1);
            font-family: var(--px-font-mono);
            font-size: var(--px-text-2xs);
            color: var(--px-text-dim);
            flex: 0 0 auto;
            -webkit-user-select: none;
            user-select: none;
        }

        .steppers {
            display: flex;
            flex-direction: column;
            width: 11px;
            height: 100%;
            flex: 0 0 auto;
            border-left: 1px solid transparent;
            opacity: 0;
            transition: opacity var(--px-duration-fast) var(--px-ease);
        }

        :host(:hover) .steppers,
        :host(.focused) .steppers {
            opacity: 1;
            border-left-color: var(--px-border-subtle);
        }

        .steppers button {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--px-text-dim);
        }

        .steppers button:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
        .steppers button:active, .steppers button.held { background: var(--px-accent); color: #fff; }

        .steppers i {
            display: block;
            width: 0;
            height: 0;
            border-left: 3px solid transparent;
            border-right: 3px solid transparent;
        }

        .steppers .up i { border-bottom: 3px solid currentColor; }
        .steppers .down i { border-top: 3px solid currentColor; }

        :host([steppers='false']) .steppers { display: none; }
    `);

    #config = {
        min: null, max: null, step: 1, integer: false,
        prefix: null, suffix: null, onInput: null,
        // Where a gesture starts from. The box shows a value shortened for reading; a
        // stepper or a scrub must move the value the model actually holds, or the
        // rounding done for the eye becomes the value on the first click.
        source: null
    };
    #input = null;
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
     * @param {boolean} [config.steppers] - Show the stepper column
     * @param {Function} [config.source] - Returns the unrounded value a gesture starts from
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

    /**
     * Change the value by whole steps, as an arrow key does.
     * @param {number} steps - How many steps, signed
     */
    stepBy(steps) {
        this.#nudge(steps);
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#render();
    }

    #render() {
        this.release('control');
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

        let handle = null;
        if (prefix) {
            handle = el('span', {
                class: 'prefix',
                textContent: prefix,
                title: `Drag to change ${prefix}`
            });
            this.track(attachScrub(handle, {
                read: () => this.#base(),
                write: amount => this.#commit(amount),
                step: () => this.#config.step
            }), 'control');
        }

        fill(this.shadowRoot,
            handle,
            this.#input,
            suffix ? el('span', { class: 'suffix', textContent: suffix }) : null,
            el('div', { class: 'steppers' }, this.#stepper(1), this.#stepper(-1))
        );
    }

    #stepper(direction) {
        const button = el('button', {
            // The class carries the arrow: the triangle is a border on the `i`, and
            // without it the stepper is a button with nothing drawn in it.
            class: direction > 0 ? 'up' : 'down',
            type: 'button',
            tabIndex: -1,
            title: direction > 0 ? 'Increase — hold to repeat' : 'Decrease — hold to repeat',
            'aria-label': direction > 0 ? 'Increase' : 'Decrease'
        }, el('i'));

        let delay = 0;
        let repeat = 0;

        const stop = () => {
            button.classList.remove('held');
            clearTimeout(delay);
            clearInterval(repeat);
        };

        button.addEventListener('pointerdown', event => {
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            button.classList.add('held');
            this.#nudge(direction);
            delay = setTimeout(() => {
                repeat = setInterval(() => this.#nudge(direction), REPEAT_EVERY);
            }, REPEAT_DELAY);
        });
        button.addEventListener('pointerup', stop);
        button.addEventListener('pointercancel', stop);
        button.addEventListener('pointerleave', stop);
        // A control removed mid-press must not leave a timer running.
        this.track(stop, 'control');

        return button;
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
        this.#commit(this.#base() + steps * this.#config.step);
    }

    /**
     * The number a gesture moves away from.
     *
     * The model's value when the owner supplies one, because the box may be showing a
     * shortened form of it; the box otherwise, for a control used on its own.
     *
     * @returns {number} The starting value
     */
    #base() {
        const source = this.#config.source?.();
        if (globalThis.Number.isFinite(source)) return source;
        return globalThis.Number.isFinite(this.value) ? this.value : 0;
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
