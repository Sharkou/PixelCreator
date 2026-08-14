// Where the windows are, and how big.
//
// The only state the Editor owns that is not in the model — and it is not model state:
// nothing here describes the project, so none of it is serialized with a scene, none of
// it is replicated, and none of it produces an Operation. It is remembered per browser,
// because a creator who narrows the Inspector expects it narrow tomorrow.
//
// Sizes are written as CSS custom properties on the shell rather than as inline styles on
// each window. One write moves a seam and every rule that reads the variable follows,
// which is what keeps the layout in CSS where it belongs.
//
// THIS IS NOT A DOCKING MANAGER. There is a fixed set of named sizes and a fixed set of
// named windows. Moving a window to another zone, detaching it, stacking it — none of
// that exists, and the day it does it will be a change here and nowhere else.

import { Emitter } from '../core/mod.js';

const STORAGE_KEY = 'pixelcreator.editor.layout';

/** Sizes in pixels, with the bounds a drag is clamped to. */
const SIZES = {
    // 236 is the prototype's own left column, measured rather than guessed
    // (design/prototype.css, --left). The minimum leaves a Hierarchy row its twisty, its
    // glyph and its three per-row controls with something left for a name.
    left: { value: 236, min: 180, max: 480, property: '--px-left' },
    // The minimum is measured, not guessed: below 260 the Inspector's paired fields
    // leave under 45 px for the digits, and a six-character coordinate starts scrolling
    // inside its own box (src/editor/ui/field.js).
    right: { value: 304, min: 260, max: 560, property: '--px-right' },
    project: { value: 192, min: 120, max: 720, property: '--px-project' },
    timeline: { value: 192, min: 120, max: 720, property: '--px-timeline' }
};

/**
 * Windows a creator can hide, and whether they start shown.
 *
 * The Timeline starts hidden because L4 makes it conditional: it takes a band across the
 * scene, and a project with nothing animated should not pay for it. The viewport is not
 * negotiable and is absent from this table; so are the creation tools, which are now part
 * of the viewport's own control group rather than a window of their own.
 */
const PANELS = {
    hierarchy: true,
    inspector: true,
    project: true,
    timeline: false
};

export class Layout {

    #root = null;
    #sizes = new globalThis.Map();
    #visible = new globalThis.Map();
    #emitter = new Emitter();

    constructor() {
        for (const [name, spec] of globalThis.Object.entries(SIZES)) this.#sizes.set(name, spec.value);
        for (const [name, shown] of globalThis.Object.entries(PANELS)) this.#visible.set(name, shown);
        this.#restore();
    }

    /**
     * Attach to the shell element the custom properties are written on.
     * @param {HTMLElement} root - The shell
     * @returns {Layout} This layout
     */
    mount(root) {
        this.#root = root;
        for (const name of this.#sizes.keys()) this.#apply(name);
        return this;
    }

    /**
     * Read a size.
     * @param {string} name - One of the named sizes
     * @returns {number} The size in pixels
     */
    get(name) {
        return this.#sizes.get(name);
    }

    /**
     * Write a size, clamped to its bounds.
     * @param {string} name - One of the named sizes
     * @param {number|null} value - The new size, or null to go back to the default
     */
    set(name, value) {
        const spec = SIZES[name];
        if (!spec) return;

        const next = value === null
            ? spec.value
            : Math.min(spec.max, Math.max(spec.min, Math.round(value)));

        if (next === this.#sizes.get(name)) return;
        this.#sizes.set(name, next);
        this.#apply(name);
        this.#save();
    }

    /**
     * Whether a window is shown.
     * @param {string} panel - One of the named windows
     * @returns {boolean} True when shown
     */
    shows(panel) {
        return this.#visible.get(panel) ?? true;
    }

    /**
     * Show or hide a window.
     * @param {string} panel - One of the named windows
     * @param {boolean} [shown] - The new state; toggles when omitted
     */
    show(panel, shown = !this.shows(panel)) {
        if (!(panel in PANELS) || shown === this.shows(panel)) return;
        this.#visible.set(panel, shown);
        this.#save();
        this.#emitter.emit('changed', { panel, shown });
    }

    /**
     * Subscribe to window visibility changes.
     * @param {Function} listener - Called with { panel, shown }
     * @returns {Function} Unsubscribe function
     */
    observe(listener) {
        return this.#emitter.on('changed', listener);
    }

    #apply(name) {
        this.#root?.style.setProperty(SIZES[name].property, `${this.#sizes.get(name)}px`);
    }

    #save() {
        const state = {
            sizes: globalThis.Object.fromEntries(this.#sizes),
            visible: globalThis.Object.fromEntries(this.#visible)
        };
        try {
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Private browsing, a full quota, storage switched off: the Editor still
            // works, it just forgets. Not worth interrupting anyone over.
        }
    }

    #restore() {
        let state = null;
        try {
            state = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null');
        } catch {
            return;
        }
        if (!state || typeof state !== 'object') return;

        // Read defensively: this came from storage, which a previous version wrote and a
        // human may have edited. An unusable value falls back rather than breaking the
        // shell, and a size out of bounds is clamped by set().
        for (const [name, value] of globalThis.Object.entries(state.sizes ?? {})) {
            if (SIZES[name] && typeof value === 'number' && globalThis.Number.isFinite(value)) {
                this.#sizes.set(name, clamp(name, value));
            }
        }
        for (const [name, shown] of globalThis.Object.entries(state.visible ?? {})) {
            if (name in PANELS && typeof shown === 'boolean') this.#visible.set(name, shown);
        }
    }
}

function clamp(name, value) {
    const spec = SIZES[name];
    return Math.min(spec.max, Math.max(spec.min, Math.round(value)));
}
