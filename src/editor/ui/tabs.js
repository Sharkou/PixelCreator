// <px-tabs> — a strip of choices, and nothing else.
//
// It renders the strip and announces the choice. It does not own the panels, does not
// hide anything, and does not slot content: the window that uses it already knows how to
// show its own children, and a tab strip that also managed content would be two things.
//
// NO CONSUMER TODAY, AND IT STAYS — but not for the reason this file used to give. It was
// the Project/Timeline strip of the old bottom dock; L4 gave each of those its own zone, so
// nothing renders it.
//
// THE DOCUMENT STRIP DID NOT TAKE IT, and that was the right call. The strip above the
// stage needs tabs that CLOSE, that carry an unsaved mark, and that reorder under the
// pointer; all three already existed there, tested by use. Rebuilding them in here to
// "reuse a primitive" would have been a rewrite wearing the word reuse, and it would have
// dragged Workspace vocabulary into `ui/`, which knows about no model at all.
//
// So what is left for this element is what it actually is: a strip of choices with no
// lifecycle behind them — a segmented control. The surfaces that may still want one are
// named in the roadmap (ADR-0009, ADR-0016); none of them is here yet.
//
// `Graph` is the name of the visual-programming window, always. `Composer` is reserved for
// a possible future music-composition window and must never be used for this one
// (PROJECT.md §2) — a comment reading otherwise gets taken for normative two years later.
//
// WHAT A TAB DESIGNATES, now that the model can say it: an `OpenEditor` —
// `{ resourceId, kind, viewState, history }`, an Editor object, never serialized into the
// project (ADR-0020). It is not a Resource, and it is not a `Document`, because there is
// no such concept in the model. A tab's "modified" mark is the `dirty` flag its resource's
// operation pipeline raises, and its undo stack is that resource's (ADR-0024). None of it
// needs building here.
//
// What is NOT built here, and must not be until something asks: closable tabs, overflow
// scrolling, drag to reorder, detachment. Speculating on those is how a primitive becomes
// a framework before it has a user — and the one surface that turned out to need them
// already had them, which is the case in point. It is registered by editor.js so it stays
// loadable and testable; the day a window slots one in, this file is the whole of the work.

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
