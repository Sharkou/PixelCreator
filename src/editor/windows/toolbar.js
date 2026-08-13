// <px-toolbar> — the creation palette, down the left edge.
//
// Legacy had exactly this and it was right: a strip of object templates you drag into the
// scene, so a creator never has to find "Create" in a menu and then move what appeared.
// What is not kept is how: `dragstart` / `drop` is the HTML5 Drag & Drop API, which does
// not exist on a touch screen. Pointer Events cover mouse, pen and finger with one code
// path (docs/architecture/EDITOR.md).
//
// Two gestures, because a drag is not always convenient:
//
//   drag  -> the object is created where you let go, in world coordinates
//   tap   -> the object is created at the centre of the view
//
// The ghost follows the pointer on `document.body`, outside every shadow root, so it is
// never clipped by the panel it started in.

import { Element, el } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon, IconSize } from '../ui/icons.js';
import { OBJECT_KINDS, createObject } from '../commands.js';

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

const TOOL_ICONS = {
    rectangle: 'rectangle',
    empty: 'object',
    camera: 'camera'
};

export class Toolbar extends Element {

    static styles = sheet(`
        :host {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--px-space-0);
            width: var(--px-toolbar);
            flex: 0 0 auto;
            padding: var(--px-space-2) 0;
            background: var(--px-surface-raised);
            border-right: 1px solid var(--px-border);
            -webkit-user-select: none;
            user-select: none;
            touch-action: none;
        }

        /* Wider than a --px-hit control on purpose: this is a presence glyph you aim at
           and then drag, not a button in a row. --px-text-dim measures 4.25:1 on a raised
           surface, so the resting colour is --px-text-muted like every other label there. */
        button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: calc(var(--px-toolbar) - var(--px-space-3));
            height: calc(var(--px-toolbar) - var(--px-space-3));
            border-radius: var(--px-radius);
            color: var(--px-text-muted);
            cursor: grab;
            transition: background var(--px-duration-fast) var(--px-ease),
                        color var(--px-duration-fast) var(--px-ease);
        }

        button:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
        button:active { background: var(--px-surface-active); cursor: grabbing; }
        button.dragging { background: var(--px-accent-muted); color: var(--px-accent); }
    `);

    #context = null;
    #drag = null;

    /**
     * Point the toolbar at the scene it creates into.
     *
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene
     * @param {object} context.selection - The Editor selection
     * @param {object} context.viewport - The viewport, for world coordinates
     * @returns {Toolbar} This element
     */
    bind(context) {
        this.#context = context;
        return this;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        this.shadowRoot.append(...OBJECT_KINDS.map(kind => el('button', {
            type: 'button',
            title: `${kind.label} — drag into the scene, or tap to place at the centre`,
            'aria-label': kind.label,
            onpointerdown: event => this.#begin(event, kind),
            onpointermove: event => this.#move(event),
            onpointerup: event => this.#drop(event),
            onpointercancel: () => this.#cancel()
        }, icon(TOOL_ICONS[kind.id] ?? 'object', IconSize.MD))));
    }

    disconnectedCallback() {
        this.#cancel();
        super.disconnectedCallback();
    }

    #begin(event, kind) {
        if (event.button > 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        this.#drag = {
            kind,
            button: event.currentTarget,
            from: { x: event.clientX, y: event.clientY },
            ghost: null
        };
    }

    #move(event) {
        const drag = this.#drag;
        if (!drag) return;

        if (!drag.ghost) {
            const travelled = Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y);
            if (travelled < DRAG_THRESHOLD) return;
            drag.ghost = createGhost(drag.kind);
            drag.button.classList.add('dragging');
        }

        drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    }

    #drop(event) {
        const drag = this.#drag;
        if (!drag) return;

        const dragged = Boolean(drag.ghost);
        this.#cancel();

        const { scene, selection, viewport } = this.#context;

        // Dropped on the scene: exactly where the pointer let go. Tapped, or dropped
        // anywhere else: the centre of what the creator is currently looking at, which is
        // the only defensible guess.
        const point = dragged && viewport.containsClient(event.clientX, event.clientY)
            ? viewport.worldAt(event.clientX, event.clientY)
            : viewport.worldCentre();

        if (dragged && !viewport.containsClient(event.clientX, event.clientY)) return;

        selection.set(createObject(scene, {
            kind: drag.kind.id,
            x: Math.round(point.x),
            y: Math.round(point.y)
        }));
    }

    #cancel() {
        const drag = this.#drag;
        if (!drag) return;

        drag.ghost?.remove();
        drag.button.classList.remove('dragging');
        this.#drag = null;
    }
}

// The ghost lives on document.body, outside every shadow root, so it is never clipped by
// the panel the drag started in — and the tokens still reach it, because custom properties
// are declared on :root and this is a child of the document.
//
// It was the last literal Legacy blue in src/: rgba(51, 154, 240, .85), a colour from a
// palette this Editor no longer has. It is the accent now, with a dark glyph on it (7.0:1
// against #fff's 2.6:1), at the same size as the rail button it was lifted from. No
// shadow: depth is a surface step here, and the two shadows the Editor allows itself are
// the menu and the narrow-mode drawer (ui/styles.js).
function createGhost(kind) {
    const ghost = el('div', { class: 'px-drag-ghost' }, icon(TOOL_ICONS[kind.id] ?? 'object', IconSize.MD));
    ghost.style.cssText = `
        position: fixed; left: 0; top: 0; pointer-events: none;
        z-index: var(--px-z-drag);
        display: flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; margin: -16px 0 0 -16px;
        border-radius: var(--px-radius);
        color: var(--px-background);
        background: var(--px-accent);
    `;
    document.body.append(ghost);
    return ghost;
}

customElements.define('px-toolbar', Toolbar);
