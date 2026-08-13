// <px-window> — a titled region with a header and a scrolling body.
//
// Replaces the first slice's `<px-panel>`: same role, plus the two things every window
// in the Editor turned out to need — a second header row (the Hierarchy's search) and a
// title area a tab strip can take over (the dock's Project / Timeline).
//
// It is NOT a floating window and NOT a docking manager. Where a window sits is decided
// by the shell's flex layout and by `layout.js`; this element only knows how to be a
// window. Moving, detaching and re-docking are deliberately absent — the seam for them
// is the header, and none of it is built before something asks for it.
//
// Slots:
//   title    replaces the label — a tab strip, typically
//   actions  buttons at the right of the header
//   header   a full-width second row, under the header
//   (default) the body, which scrolls

import { Element, el } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';

export class Window extends Element {

    static styles = sheet(`
        :host {
            display: flex;
            flex-direction: column;
            background: var(--px-bg-1);
            min-height: 0;
            min-width: 0;
            overflow: hidden;
        }

        header {
            display: flex;
            align-items: center;
            gap: 6px;
            height: calc(var(--px-hit) + 8px);
            padding: 0 5px 0 10px;
            background: var(--px-bg-2);
            border-bottom: 1px solid var(--px-line);
            flex: 0 0 auto;
            -webkit-user-select: none;
            user-select: none;
        }

        .glyph { color: var(--px-text-dim); }

        h2 {
            margin: 0;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--px-text-dim);
            white-space: nowrap;
        }

        .spacer { flex: 1; }

        .subheader {
            display: none;
            flex: 0 0 auto;
            border-bottom: 1px solid var(--px-line);
            background: var(--px-bg-1);
        }

        .subheader.filled { display: block; }

        .body {
            flex: 1;
            min-height: 0;
            overflow: auto;
            overscroll-behavior: contain;
        }

        :host([plain]) .body { overflow: hidden; }
    `);

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        const label = this.getAttribute('label') ?? '';
        const glyph = this.getAttribute('icon');

        // A slot cannot be styled on whether anything landed in it, so the row is told.
        const headerSlot = el('slot', { name: 'header' });
        const subheader = el('div', { class: 'subheader' }, headerSlot);
        headerSlot.addEventListener('slotchange', () => {
            subheader.classList.toggle('filled', headerSlot.assignedNodes().length > 0);
        });

        this.shadowRoot.append(
            el('header', {},
                glyph ? el('span', { class: 'glyph' }, icon(glyph, 13)) : null,
                el('slot', { name: 'title' }, el('h2', { textContent: label })),
                el('div', { class: 'spacer' }),
                el('slot', { name: 'actions' })
            ),
            subheader,
            el('div', { class: 'body' }, el('slot'))
        );
    }
}

customElements.define('px-window', Window);
