// Where the pointer is, shown on the edges of the viewport.
//
// Legacy drew a tick and a `« Npx »` label on a top and a left ruler, in the accent
// colour, following the cursor (legacy/editor/misc/ruler.js). The idea is good and worth
// keeping: while placing something, the question is always "where am I", and looking away
// at a readout in a corner breaks the gesture.
//
// Built from DOM rather than painted on the canvas, for one concrete reason: the renderer
// contract has no text operation, and adding one to the runtime so the Editor can label a
// ruler would be the wrong direction. The guides are Editor chrome, they belong in the
// Editor's layer — where the text is also crisper and styleable.
//
// Deliberately thin: two faint lines and two small labels, no opaque ruler strips. A
// ruler bar would eat the scene, and the scene is the thing being looked at.

import { el } from '../ui/element.js';

export class Guides {

    #root;
    #vertical;
    #horizontal;
    #xLabel;
    #yLabel;

    /**
     * Build the guides inside a container.
     * @param {HTMLElement} parent - The element to draw over
     */
    constructor(parent) {
        this.#vertical = el('div', { class: 'guide-v' });
        this.#horizontal = el('div', { class: 'guide-h' });
        this.#xLabel = el('div', { class: 'guide-label guide-x' });
        this.#yLabel = el('div', { class: 'guide-label guide-y' });

        this.#root = el('div', { class: 'guides' },
            this.#vertical, this.#horizontal, this.#xLabel, this.#yLabel);
        parent.append(this.#root);
        this.hide();
    }

    /**
     * Move the guides to the pointer.
     * @param {number} x - Horizontal position in CSS pixels, relative to the viewport
     * @param {number} y - Vertical position in CSS pixels
     * @param {object} world - The world point under it
     */
    update(x, y, world) {
        this.#root.style.opacity = '1';
        this.#vertical.style.transform = `translateX(${x}px)`;
        this.#horizontal.style.transform = `translateY(${y}px)`;
        this.#xLabel.style.transform = `translateX(${x}px)`;
        this.#yLabel.style.transform = `translateY(${y}px)`;
        this.#xLabel.textContent = `${Math.round(world.x)}`;
        this.#yLabel.textContent = `${Math.round(world.y)}`;
    }

    /** Take the guides away, when the pointer leaves. */
    hide() {
        this.#root.style.opacity = '0';
    }
}

/** Rules the viewport adopts alongside its own. */
export const GUIDE_STYLES = `
    .guides {
        position: absolute;
        inset: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
    }

    .guide-v, .guide-h {
        position: absolute;
        background: var(--px-accent);
        opacity: 0.22;
    }

    .guide-v { top: 0; bottom: 0; left: 0; width: 1px; }
    .guide-h { left: 0; right: 0; top: 0; height: 1px; }

    .guide-label {
        position: absolute;
        font-family: var(--px-mono);
        font-size: 10px;
        font-weight: 600;
        line-height: 1;
        color: var(--px-accent);
        background: var(--px-bg-0);
        border-radius: 2px;
        padding: 2px 3px;
        white-space: nowrap;
    }

    .guide-x { top: 3px; left: 0; transform-origin: left; margin-left: 4px; }
    .guide-y { left: 3px; top: 0; margin-top: 4px; }
`;
