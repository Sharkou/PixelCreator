// <px-toolbar> — the creation palette, in the viewport's control group.
//
// Legacy had exactly this and it was right: a strip of object templates you drag into the
// scene, so a creator never has to find "Create" in a menu and then move what appeared.
// What is not kept is how: `dragstart` / `drop` is the HTML5 Drag & Drop API, which does
// not exist on a touch screen. Pointer Events cover mouse, pen and finger with one code
// path (docs/architecture/EDITOR.md).
//
// IT IS NO LONGER A RAIL. It used to be a full-height strip down the left edge of the
// workspace, and that strip was 44 px of chrome carrying three buttons — a column of
// window for a row of tools. The tools now sit in the viewport's own control group, next
// to Frame selection and Reset view, where every control that acts on the scene already
// lives; the left edge of the workspace is the Hierarchy. What made the rail worth keeping
// was never its position, it was the drag: an object is born exactly where it is dropped,
// which no menu entry reproduces. That gesture is untouched below — this element is
// slotted into `<px-viewport>` instead of into the shell, and nothing else changed.
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

export class Toolbar extends Element {

    /* No surface, no border and no padding of its own: the group it sits in is already a
       pill on the panel surface, and a box inside that box is what the Inspector's search
       field taught us not to draw (ui/menu.js). The buttons are `.ghost` from the shared
       sheet, so they are the same control as Frame selection beside them — the only thing
       this element adds is the grab cursor and the drag state, which are what these three
       buttons do and the other two do not. */
    static styles = sheet(`
        :host {
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
            -webkit-user-select: none;
            user-select: none;
            touch-action: none;
        }

        .ghost { cursor: grab; }
        .ghost:active { cursor: grabbing; }
        .ghost.dragging { background: var(--px-accent-muted); color: var(--px-accent); }
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
            class: 'ghost',
            type: 'button',
            title: `${kind.label} — drag into the scene, or tap to place at the centre`,
            'aria-label': kind.label,
            onpointerdown: event => this.#begin(event, kind),
            onpointermove: event => this.#move(event),
            onpointerup: event => this.#drop(event),
            onpointercancel: () => this.#cancel()
        }, icon(kind.icon ?? 'object', IconSize.SM))));
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

        const { scene, selection, subject, viewport } = this.#context;

        // Dropped on the scene: exactly where the pointer let go. Tapped, or dropped
        // anywhere else: the centre of what the creator is currently looking at, which is
        // the only defensible guess.
        const point = dragged && viewport.containsClient(event.clientX, event.clientY)
            ? viewport.worldAt(event.clientX, event.clientY)
            : viewport.worldCentre();

        if (dragged && !viewport.containsClient(event.clientX, event.clientY)) return;

        const created = createObject(scene, {
            kind: drag.kind.id,
            x: Math.round(point.x),
            y: Math.round(point.y)
        });

        // Announced, so a resource selected in Project steps aside for the object that was
        // just made (ADR-0032).
        if (subject) subject.object(created);
        else selection.set(created);
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
// against #fff's 2.6:1). It stays 32 px and keeps the larger glyph even though the button
// it leaves is now a 22 px control: the ghost is what the creator is aiming with, out on
// the scene and away from the pointer's own hotspot, and shrinking it to match the button
// would make the thing being placed harder to see than the thing that launched it. No
// shadow: depth is a surface step here, and the two shadows the Editor allows itself are
// the menu and the narrow-mode drawer (ui/styles.js).
function createGhost(kind) {
    const ghost = el('div', { class: 'px-drag-ghost' }, icon(kind.icon ?? 'object', IconSize.MD));
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
