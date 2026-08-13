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
import { icon } from '../ui/icons.js';
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
            gap: 2px;
            width: var(--px-toolbar);
            flex: 0 0 auto;
            padding: 6px 0;
            background: var(--px-bg-2);
            border-right: 1px solid var(--px-line);
            -webkit-user-select: none;
            user-select: none;
            touch-action: none;
        }

        button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: calc(var(--px-toolbar) - 12px);
            height: calc(var(--px-toolbar) - 12px);
            border-radius: var(--px-radius-sm);
            color: var(--px-text-dim);
            cursor: grab;
            transition: background 90ms ease, color 90ms ease;
        }

        button:hover { background: var(--px-bg-3); color: var(--px-text-strong); }
        button:active { background: var(--px-bg-4); cursor: grabbing; }
        button.dragging { background: var(--px-accent-soft); color: var(--px-accent); }
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
        }, icon(TOOL_ICONS[kind.id] ?? 'object', 18))));
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

function createGhost(kind) {
    const ghost = el('div', { class: 'px-drag-ghost' }, icon(TOOL_ICONS[kind.id] ?? 'object', 20));
    ghost.style.cssText = `
        position: fixed; left: 0; top: 0; z-index: 200; pointer-events: none;
        display: flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; margin: -17px 0 0 -17px;
        border-radius: 6px; color: #fff;
        background: rgba(51, 154, 240, 0.85);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    `;
    document.body.append(ghost);
    return ghost;
}

customElements.define('px-toolbar', Toolbar);
