// The base every `px-*` element extends, and the one DOM helper they share.
//
// It exists for a single reason: SUBSCRIPTIONS MUST BE RELEASED. Legacy added listeners
// and never removed them — `Emitter.on()` returning an unsubscribe function
// (core/events.js) is only half the fix; something has to call it. An element that
// leaves the document releases everything it took, automatically, and an element that
// re-renders releases the previous render's subscriptions.
//
// It is not a component framework and must not grow into one (ADR-0006). No templating,
// no reactivity, no lifecycle beyond what Custom Elements already define — the reactive
// model is the Property System, and a second one would be the mistake this project
// deliberately avoids.

import { baseStyles } from './styles.js';

export class PxElement extends HTMLElement {

    /** Own sheet, adopted after the shared one. Subclasses override it. */
    static styles = null;

    #cleanups = new globalThis.Map();

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        const own = this.constructor.styles;
        this.shadowRoot.adoptedStyleSheets = own ? [baseStyles, own] : [baseStyles];
    }

    /**
     * Hold on to an unsubscribe function until the matching release.
     *
     * @param {Function} unsubscribe - What to call to undo the subscription
     * @param {string} [group] - Release scope; 'element' lives as long as the element
     * @returns {Function} The same unsubscribe function
     */
    track(unsubscribe, group = 'element') {
        let group_ = this.#cleanups.get(group);
        if (!group_) {
            group_ = [];
            this.#cleanups.set(group, group_);
        }
        group_.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Release tracked subscriptions.
     * @param {string} [group] - The scope to release; every scope when omitted
     */
    release(group) {
        const groups = group === undefined ? [...this.#cleanups.keys()] : [group];
        for (const name of groups) {
            for (const unsubscribe of this.#cleanups.get(name) ?? []) unsubscribe();
            this.#cleanups.delete(name);
        }
    }

    disconnectedCallback() {
        this.release();
    }
}

/**
 * Create an element.
 *
 * Deliberately not a template language: a function call with real values reads as well
 * as markup, keeps every value escaped by construction, and needs no parser.
 *
 * @param {string} tag - Tag name
 * @param {object} [props] - Properties, `class`, `dataset`, or `on<Event>` handlers
 * @param {...any} children - Nodes and strings, nested arrays allowed
 * @returns {HTMLElement} The element
 */
export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of globalThis.Object.entries(props)) {
        if (value === undefined || value === null) continue;

        if (key === 'class') node.className = value;
        else if (key === 'dataset') globalThis.Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }

    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child);
    }

    return node;
}

/**
 * Replace an element's children.
 * @param {HTMLElement} parent - The element to fill
 * @param {...any} children - Nodes and strings, nested arrays allowed
 * @returns {HTMLElement} The parent
 */
export function fill(parent, ...children) {
    parent.replaceChildren(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
    return parent;
}
