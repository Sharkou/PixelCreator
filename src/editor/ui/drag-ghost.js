// What the pointer carries, drawn where the pointer is (ADR-0028 §3).
//
// ONE GHOST FOR EVERY DRAG. A resource leaving the Project panel, an object leaving the
// Hierarchy and a component being reordered are three payloads and one gesture, so they
// get one mark. Legacy had a `Dnd` class of static state that every window read from each
// other; here the ghost is told what to show and knows nothing about who is dragging.
//
// IT ALSO CARRIES THE VERDICT. `rules.canDrop()` already answers whether a drop is legal
// and why (ADR-0026 §6), and that answer used to reach nobody: a refused drop looked
// exactly like a drag over empty space. The ghost shows the sentence the rule wrote, so a
// refusal is visible at the moment it applies rather than discovered by nothing happening.
//
// It mounts inside the shell rather than on `document.body`, because the design tokens
// live on the shell and a body-mounted element resolves none of them.

import { el, fill } from './element.js';
import { icon as glyph } from './icons.js';
import { sheet } from './styles.js';

/** How far from the pointer the ghost sits, so it never covers what is under it. */
const OFFSET = { x: 14, y: 12 };

const styles = sheet(`
    .px-ghost {
        position: fixed;
        top: 0;
        left: 0;
        z-index: var(--px-z-drag);
        display: flex;
        align-items: center;
        gap: var(--px-space-2);
        max-width: 280px;
        padding: var(--px-space-1) var(--px-space-2);
        background: var(--px-surface-overlay);
        border: 1px solid var(--px-border);
        border-radius: var(--px-radius);
        color: var(--px-text);
        font-family: var(--px-font-sans);
        font-size: var(--px-text-xs);
        pointer-events: none;
        -webkit-user-select: none;
        user-select: none;
    }

    .px-ghost .px-ghost-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--px-text-strong);
    }

    /* The verdict, in the rule's own words. Wrapped rather than clipped: a refusal that
       cannot be read is a refusal that was not given. */
    .px-ghost .px-ghost-reason {
        max-width: 200px;
        color: var(--px-text-muted);
        font-size: var(--px-text-2xs);
        line-height: var(--px-leading-tight);
    }

    .px-ghost.allowed { border-color: var(--px-accent-border); }
    .px-ghost.allowed .px-ghost-glyph { color: var(--px-accent); }

    .px-ghost.forbidden { border-color: var(--px-danger); }
    .px-ghost.forbidden .px-ghost-glyph { color: var(--px-danger); }
    .px-ghost.forbidden .px-ghost-reason { color: var(--px-danger); }
`);

/**
 * Create the ghost for a shell.
 *
 * @param {HTMLElement} host - The shell it mounts into, whose tokens it reads
 * @returns {{show: Function, move: Function, verdict: Function, hide: Function}} The ghost
 */
export function createDragGhost(host) {
    if (!host.ownerDocument.adoptedStyleSheets.includes(styles)) {
        host.ownerDocument.adoptedStyleSheets = [...host.ownerDocument.adoptedStyleSheets, styles];
    }

    let element = null;
    let name = null;
    let reason = null;
    let mark = null;
    let shown = { allowed: null, text: null };

    /**
     * Start showing a payload.
     * @param {object} description - `{ label, icon }` from `dnd/payload.js`
     * @param {number} clientX - Where the pointer is
     * @param {number} clientY - Where the pointer is
     */
    function show(description, clientX, clientY) {
        hide();

        mark = el('span', { class: 'px-ghost-glyph' }, glyph(description.icon));
        name = el('span', { class: 'px-ghost-name', textContent: description.label });
        reason = el('span', { class: 'px-ghost-reason' });

        element = el('div', { class: 'px-ghost' }, mark, name, reason);
        host.append(element);
        move(clientX, clientY);
    }

    /**
     * Follow the pointer.
     *
     * Positioned with a transform rather than with `left`/`top`: the ghost moves on every
     * pointer event, and a transform is the one property a browser will move without
     * laying the page out again.
     *
     * @param {number} clientX - Where the pointer is
     * @param {number} clientY - Where the pointer is
     */
    function move(clientX, clientY) {
        if (!element) return;
        element.style.transform = 'translate(' + (clientX + OFFSET.x) + 'px, ' + (clientY + OFFSET.y) + 'px)';
    }

    /**
     * Say whether the drop under the pointer would be taken, and why.
     *
     * @param {{allowed: boolean, reason: string|null}|null} answer - What `canDrop()` said,
     *   or null when the pointer is over nothing that answers at all
     */
    function verdict(answer) {
        if (!element) return;

        const allowed = answer?.allowed ?? null;
        const text = answer?.reason ?? null;
        // Written only when it changed: this runs on every pointer event, and rewriting a
        // text node is a style invalidation whatever the text says.
        if (allowed === shown.allowed && text === shown.text) return;
        shown = { allowed, text };

        element.classList.toggle('allowed', allowed === true);
        element.classList.toggle('forbidden', allowed === false);
        reason.textContent = text ?? '';
    }

    /** Take the ghost away. Safe to call when there is none. */
    function hide() {
        element?.remove();
        element = null;
        name = null;
        reason = null;
        mark = null;
        shown = { allowed: null, text: null };
    }

    return { show, move, verdict, hide };
}
