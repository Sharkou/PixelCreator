// <px-tabs> — a strip of choices, and nothing else.
//
// It renders the strip and announces the choice. It does not own the panels, does not
// hide anything, and does not slot content: the window that uses it already knows how to
// show its own children, and a tab strip that also managed content would be two things.

import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';

export class Tabs extends Element {

    static styles = sheet(`
        :host {
            display: flex;
            align-items: stretch;
            gap: var(--px-space-0);
            height: 100%;
            -webkit-user-select: none;
            user-select: none;
        }

        /* The same type as a panel title, because that is what a tab replaces. */
        button {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            height: 100%;
            padding: 0 var(--px-space-3);
            color: var(--px-text-dim);
            font-size: var(--px-text-xs);
            font-weight: var(--px-weight-bold);
            letter-spacing: var(--px-tracking-caps);
            text-transform: uppercase;
            white-space: nowrap;
            position: relative;
            transition: color var(--px-duration-fast) var(--px-ease);
        }

        button::after {
            content: '';
            position: absolute;
            left: var(--px-space-2);
            right: var(--px-space-2);
            bottom: 0;
            height: 2px;
            border-radius: 1px;
            background: transparent;
            transition: background var(--px-duration) var(--px-ease);
        }

        button:hover { color: var(--px-text-muted); }
        button[aria-selected='true'] { color: var(--px-text-strong); }
        button[aria-selected='true']::after { background: var(--px-accent); }
    `);

    #items = [];
    #active = null;
    #onChange = null;

    /**
     * Fill the strip.
     *
     * @param {object[]} items - Entries as { id, label, icon }
     * @param {object} [options] - Options
     * @param {string} [options.active] - Selected entry id; the first one by default
     * @param {Function} [options.onChange] - Called with the newly selected id
     * @returns {Tabs} This element
     */
    bind(items, { active, onChange } = {}) {
        this.#items = items;
        this.#active = active ?? items[0]?.id ?? null;
        this.#onChange = onChange ?? null;
        if (this.isConnected) this.#render();
        return this;
    }

    /** The selected entry id. */
    get active() {
        return this.#active;
    }

    set active(id) {
        if (id === this.#active) return;
        this.#active = id;
        this.#render();
        this.#onChange?.(id);
    }

    connectedCallback() {
        this.#render();
    }

    #render() {
        fill(this.shadowRoot, this.#items.map(item => el('button', {
            type: 'button',
            role: 'tab',
            'aria-selected': globalThis.String(item.id === this.#active),
            onclick: () => { this.active = item.id; }
        }, item.icon ? icon(item.icon) : null, el('span', { textContent: item.label }))));
    }
}

customElements.define('px-tabs', Tabs);
