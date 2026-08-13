// <px-menu> — a transient list of choices next to the control that opened it.
//
// Mounted on `document.body` rather than inside the panel that opened it, because a
// panel scrolls and clips and a menu must do neither. It closes on the first thing that
// means "not that": a pointer outside, Escape, a scroll, a resize.

import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';

export class Menu extends Element {

    static styles = sheet(`
        /* The popover surface, and one of the only two shadows left in the Editor: depth
           is a step in the surface ramp everywhere else, but a menu genuinely floats over
           unrelated content and has to say so (ui/styles.js). */
        :host {
            position: fixed;
            z-index: var(--px-z-overlay);
            min-width: 150px;
            max-height: 320px;
            overflow: auto;
            padding: var(--px-space-1);
            background: var(--px-surface-overlay);
            border: 1px solid var(--px-border);
            border-radius: var(--px-radius);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        }

        button {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            width: 100%;
            min-height: var(--px-row);
            padding: var(--px-space-1) var(--px-space-2);
            border-radius: var(--px-radius);
            text-align: left;
            white-space: nowrap;
            color: var(--px-text);
        }

        button:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
        button[disabled] { color: var(--px-text-dim); cursor: default; }
        button[disabled]:hover { background: none; }

        .empty {
            padding: var(--px-space-2);
            color: var(--px-text-dim);
        }

        /* THE REFERENCE. A Component's title in the Inspector uses this exact type, so
           that "Rendering" in this menu and "Rectangle Renderer" over there read as the
           same kind of thing. Only the colour differs, by role: a group heading is
           quieter than the section it groups. */
        .heading {
            padding: var(--px-space-2) var(--px-space-2) var(--px-space-1);
            font-size: var(--px-text-2xs);
            font-weight: var(--px-weight-bold);
            letter-spacing: var(--px-tracking-caps);
            text-transform: uppercase;
            color: var(--px-text-dim);
        }

        .heading:not(:first-child) {
            margin-top: var(--px-space-1);
            border-top: 1px solid var(--px-border-subtle);
        }
    `);

    #onPick = null;

    /**
     * Fill and place the menu.
     *
     * @param {DOMRect} rect - Screen rectangle of the control that opened it
     * @param {object[]} items - Entries as { id, label, icon, disabled }, or { heading }
     * @param {Function} onPick - Called with the chosen entry's id
     */
    open(rect, items, onPick) {
        this.#onPick = onPick;

        fill(this.shadowRoot,
            items.length === 0
                ? el('div', { class: 'empty', textContent: 'Nothing to add' })
                : items.map(item => (item.heading
                    ? el('div', { class: 'heading', textContent: item.heading })
                    : el('button', {
                        type: 'button',
                        disabled: Boolean(item.disabled),
                        onclick: () => this.#pick(item)
                    }, item.icon ? icon(item.icon) : null, el('span', { textContent: item.label }))))
        );

        this.style.left = `${rect.left}px`;
        this.style.top = `${rect.bottom + 4}px`;
        // Placed, then corrected: the height is only known once the entries are in.
        requestAnimationFrame(() => this.#keepOnScreen(rect));
    }

    connectedCallback() {
        const close = event => {
            if (!event || !this.contains(event.target)) this.remove();
        };
        const onKey = event => {
            if (event.key === 'Escape') this.remove();
        };

        this.track(listen(document, 'pointerdown', close, true));
        this.track(listen(document, 'keydown', onKey, true));
        this.track(listen(globalThis, 'resize', () => this.remove()));
        this.track(listen(globalThis, 'wheel', () => this.remove(), true));
    }

    #pick(item) {
        if (item.disabled) return;
        this.remove();
        this.#onPick?.(item.id);
    }

    #keepOnScreen(rect) {
        const own = this.getBoundingClientRect();
        if (own.bottom > globalThis.innerHeight - 8) {
            this.style.top = `${Math.max(8, rect.top - own.height - 4)}px`;
        }
        if (own.right > globalThis.innerWidth - 8) {
            this.style.left = `${Math.max(8, globalThis.innerWidth - own.width - 8)}px`;
        }
    }
}

/**
 * Open a menu under a control.
 *
 * @param {HTMLElement} anchor - The control that opened it
 * @param {object[]} items - Entries as { id, label, icon, disabled }
 * @param {Function} onPick - Called with the chosen entry's id
 * @returns {Menu} The open menu
 */
export function openMenu(anchor, items, onPick) {
    const menu = document.createElement('px-menu');
    document.body.append(menu);
    menu.open(anchor.getBoundingClientRect(), items, onPick);
    return menu;
}

function listen(target, event, handler, capture = false) {
    target.addEventListener(event, handler, capture);
    return () => target.removeEventListener(event, handler, capture);
}

customElements.define('px-menu', Menu);
