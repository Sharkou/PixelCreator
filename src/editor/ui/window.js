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
            background: var(--px-surface);
            min-height: 0;
            min-width: 0;
            overflow: hidden;
        }

        /* The header is a hit target plus one step of space, so it follows the density
           tokens instead of carrying a number of its own — 36 on a mouse, 42 under
           a coarse pointer. The prototype draws 30 here; that is off the four-pixel
           grid and below the touch target, so Modern Pixel wins (design/README.md is a
           reference, not an authority on density). */
        header {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            height: calc(var(--px-hit) + var(--px-space-2));
            padding: 0 var(--px-space-1) 0 var(--px-space-2);
            background: var(--px-surface-raised);
            border-bottom: 1px solid var(--px-border);
            flex: 0 0 auto;
            -webkit-user-select: none;
            user-select: none;
        }

        .glyph { color: var(--px-text-muted); }

        /* --px-text-dim measures 4.25:1 against --px-surface-raised — under the 4.5 the
           token table itself sets. A title on a raised header is --px-text-muted (5.6:1),
           which is the move styles.js said each window would make as it was rebuilt. */
        h2 {
            margin: 0;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: var(--px-text-xs);
            font-weight: var(--px-weight-bold);
            letter-spacing: var(--px-tracking-caps);
            text-transform: uppercase;
            color: var(--px-text-muted);
            white-space: nowrap;
        }

        .spacer { flex: 1; }

        /* The slot is the row, so a window with one button does not need a wrapper
           element to get the spacing right. */
        slot[name='actions'] {
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
            flex: 0 0 auto;
        }

        /* No border here: what lands in the slot owns its own, because a second row that
           can collapse to nothing (the Hierarchy's search) must be able to take its
           separator with it. */
        .subheader {
            display: none;
            flex: 0 0 auto;
            background: var(--px-surface);
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
                glyph ? el('span', { class: 'glyph' }, icon(glyph)) : null,
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
