// <px-splitter> — the draggable seam between two windows.
//
// It owns no size. It reads one through a getter and writes it back through a setter,
// which is what keeps the sizes in `layout.js` and stops this element from becoming a
// second place where the layout is decided.
//
// A one-pixel line is impossible to grab, and impossible twice over with a finger. The
// visible seam therefore stays one pixel while the hit area is `--px-grip` wide and grows
// on a coarse pointer — the standard trick, and the reason this is an element rather than
// a CSS border.

import { Element } from './element.js';
import { sheet } from './styles.js';

export class Splitter extends Element {

    static styles = sheet(`
        :host {
            position: relative;
            flex: 0 0 auto;
            background: var(--px-line);
            z-index: 2;
            touch-action: none;
            -webkit-user-select: none;
            user-select: none;
        }

        :host([axis='x']) { width: 1px; cursor: col-resize; }
        :host([axis='y']) { height: 1px; cursor: row-resize; }

        /* The grab area, invisible, centred on the seam. */
        .grip {
            position: absolute;
            transition: background 120ms ease;
        }

        :host([axis='x']) .grip {
            top: 0;
            bottom: 0;
            left: calc(var(--px-grip) / -2);
            width: var(--px-grip);
            cursor: col-resize;
        }

        :host([axis='y']) .grip {
            left: 0;
            right: 0;
            top: calc(var(--px-grip) / -2);
            height: var(--px-grip);
            cursor: row-resize;
        }

        .grip:hover, :host([dragging]) .grip { background: var(--px-accent-line); }
    `);

    #config = null;
    #start = 0;
    #from = 0;

    /**
     * Tell the splitter which size it moves.
     *
     * @param {object} config - Binding
     * @param {'x'|'y'} config.axis - Direction the pointer travels in
     * @param {Function} config.get - Reads the current size in pixels
     * @param {Function} config.set - Writes the new size in pixels
     * @param {boolean} [config.invert] - True when moving towards the origin grows the size
     * @returns {Splitter} This element
     */
    bind({ axis, get, set, invert = false }) {
        this.#config = { axis, get, set, invert };
        this.setAttribute('axis', axis);
        return this;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        const grip = document.createElement('div');
        grip.className = 'grip';
        grip.addEventListener('pointerdown', event => this.#begin(event));
        grip.addEventListener('pointermove', event => this.#move(event));
        grip.addEventListener('pointerup', event => this.#end(event));
        grip.addEventListener('pointercancel', event => this.#end(event));
        grip.addEventListener('dblclick', () => this.#config?.set(null));

        this.shadowRoot.append(grip);
    }

    #begin(event) {
        if (!this.#config || event.button > 0) return;
        event.preventDefault();
        event.target.setPointerCapture(event.pointerId);

        this.#start = this.#config.axis === 'x' ? event.clientX : event.clientY;
        this.#from = this.#config.get();
        this.toggleAttribute('dragging', true);
    }

    #move(event) {
        if (!this.hasAttribute('dragging')) return;

        const position = this.#config.axis === 'x' ? event.clientX : event.clientY;
        const travelled = position - this.#start;
        this.#config.set(this.#from + (this.#config.invert ? -travelled : travelled));
    }

    #end(event) {
        if (!this.hasAttribute('dragging')) return;
        if (event.target.hasPointerCapture?.(event.pointerId)) {
            event.target.releasePointerCapture(event.pointerId);
        }
        this.toggleAttribute('dragging', false);
    }
}

customElements.define('px-splitter', Splitter);
