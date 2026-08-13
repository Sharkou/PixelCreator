// <px-menu> — a transient list of choices next to the control that opened it.
//
// Mounted on `document.body` rather than inside the panel that opened it, because a
// panel scrolls and clips and a menu must do neither. It closes on the first thing that
// means "not that": a pointer outside, Escape, a scroll, a resize.

import { PxElement, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';

export class PxMenu extends PxElement {

    static styles = sheet(`
        :host {
            position: fixed;
            z-index: 100;
            min-width: 150px;
            max-height: 320px;
            overflow: auto;
            padding: 4px;
            background: var(--px-bg-2);
            border: 1px solid var(--px-line);
            border-radius: var(--px-radius);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        }

        button {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 5px 8px;
            border-radius: 4px;
            text-align: left;
            white-space: nowrap;
            color: var(--px-text);
        }

        button:hover { background: var(--px-bg-3); color: var(--px-text-strong); }
        button[disabled] { color: var(--px-text-dim); cursor: default; }
        button[disabled]:hover { background: none; }

        .empty {
            padding: 6px 8px;
            color: var(--px-text-dim);
        }
    `);

    #onPick = null;

    /**
     * Fill and place the menu.
     *
     * @param {DOMRect} rect - Screen rectangle of the control that opened it
     * @param {object[]} items - Entries as { id, label, icon, disabled }
     * @param {Function} onPick - Called with the chosen entry's id
     */
    open(rect, items, onPick) {
        this.#onPick = onPick;

        fill(this.shadowRoot,
            items.length === 0
                ? el('div', { class: 'empty', textContent: 'Nothing to add' })
                : items.map(item => el('button', {
                    type: 'button',
                    disabled: Boolean(item.disabled),
                    onclick: () => this.#pick(item)
                }, item.icon ? icon(item.icon, 13) : null, el('span', { textContent: item.label })))
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
 * @returns {PxMenu} The open menu
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

customElements.define('px-menu', PxMenu);
