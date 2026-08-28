// One press-drag-release, with an ending that is guaranteed.
//
// THERE WERE SIXTEEN OF THESE AND FOUR COPIES OF THE SAME HELPER. `capture()` and
// `release()` were written out, character for character, in `windows/inspector.js`,
// `windows/hierarchy.js`, `windows/project.js` and `windows/graph.js` — and not one of the
// sixteen drag sites listened for `lostpointercapture`. A file with four identical copies of
// a helper has four places to fix a bug in, and this bug was in all of them.
//
// THE FAILURE IS ALWAYS THE SAME SHAPE: a gesture that starts and never ends. The pointer
// goes somewhere the listener is not, the platform takes the capture away, the window loses
// focus, the element is redrawn out from under the press — and the panel is left holding a
// drag nobody is making. What a creator sees is a component stuck half-lifted, a ghost that
// will not go away, a cursor that stays a grabbing hand, and rows that never slide back.
//
// SO THE ENDING IS THE PRIMITIVE'S JOB, NOT THE CALLER'S. `end` runs exactly once, for every
// way a gesture can stop:
//
//   pointerup             the ordinary release
//   pointercancel         the platform took the pointer (touch became a scroll)
//   lostpointercapture    the capture went away — most often because the element was redrawn
//   window blur           the window lost focus mid-drag (alt-tab, devtools, a native menu)
//
// The last two are the ones nobody writes by hand, and they are the two that made the bug
// intermittent: a panel that redraws on every model change loses its captured element
// whenever anything else in the scene moves.
//
// CAPTURE IS TAKEN AT THE PRESS, NOT AT THE THRESHOLD. Waiting until the pointer has
// travelled leaves a window in which the moves go to whatever is under the cursor, so a
// gesture that starts near the edge of a panel can lose its first few moves — and the
// release with them.
//
// IT DOES NOT KNOW WHAT A DRAG MEANS. Reordering, carrying a payload out of a panel, panning
// a canvas and scrubbing a number are four different intentions; what they share is exactly
// this lifecycle, and nothing else. So this file has no notion of rank, payload or preview.

/**
 * Take pointer capture, tolerating a pointer the platform no longer knows about.
 *
 * Capture is a convenience — it keeps the moves coming when the pointer leaves the element
 * it started on — and not what makes a gesture work. A pointer that is already gone must
 * not throw its way out of the handler and abandon the release.
 *
 * @param {HTMLElement} element - The element to capture on
 * @param {number} pointerId - The pointer
 */
export function capturePointer(element, pointerId) {
    try {
        element.setPointerCapture(pointerId);
    } catch {
        // Nothing to capture. The gesture still resolves from the events it does receive.
    }
}

/**
 * Give pointer capture back, if it was ever taken.
 * @param {HTMLElement} element - The element that captured
 * @param {number} pointerId - The pointer
 */
export function releasePointer(element, pointerId) {
    try {
        if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
    } catch {
        // The element is gone, or the pointer is. Either way there is nothing to give back.
    }
}

/**
 * Watch one handle for a press that may become a drag.
 *
 * @param {HTMLElement} handle - The element a press starts on
 * @param {object} handlers - What to do
 * @param {Function} [handlers.start] - (event) => boolean; false refuses the press
 * @param {Function} [handlers.move] - (event, gesture) => void, once past the threshold
 * @param {Function} [handlers.end] - ({ event, cancelled, travelled }) => void, exactly once
 * @param {number} [handlers.threshold] - Pixels before `move` is called at all
 * @returns {Function} Stops watching
 */
export function onDrag(handle, { start, move, end, threshold = 3 } = {}) {
    let active = null;

    const finish = (event, cancelled) => {
        const gesture = active;
        if (!gesture) return;

        // CLEARED FIRST, so an `end` that redraws — and every one of them does — cannot
        // re-enter this and end the same gesture twice.
        active = null;
        for (const off of gesture.listeners) off();
        releasePointer(handle, gesture.pointerId);

        end?.({ event, cancelled, travelled: gesture.travelled, gesture });
    };

    const onPointerDown = event => {
        if (event.button > 0) return;
        // A SECOND PRESS ENDS THE FIRST. Two live gestures on one handle is a state nothing
        // downstream is written for, and it is reachable whenever an ending was missed.
        if (active) finish(event, true);
        if (start?.(event) === false) return;

        capturePointer(handle, event.pointerId);

        const gesture = {
            pointerId: event.pointerId,
            from: { x: event.clientX, y: event.clientY },
            travelled: false,
            listeners: []
        };
        active = gesture;

        // `addEventListener` IS ASKED FOR RATHER THAN ASSUMED. The window is not a DOM node
        // and a headless build has none at all; a gesture that cannot hear about a lost
        // focus is still a gesture, so the binding is skipped rather than thrown over.
        const bind = (target, name, handler, options) => {
            if (typeof target?.addEventListener !== 'function') return;
            target.addEventListener(name, handler, options);
            gesture.listeners.push(() => target.removeEventListener(name, handler, options));
        };

        bind(handle, 'pointermove', moved);
        bind(handle, 'pointerup', released);
        bind(handle, 'pointercancel', cancelled);
        // THE TWO NOBODY WRITES BY HAND, and the two that made this intermittent.
        bind(handle, 'lostpointercapture', cancelled);
        bind(globalThis, 'blur', cancelled);
    };

    const moved = event => {
        const gesture = active;
        if (!gesture || event.pointerId !== gesture.pointerId) return;

        if (!gesture.travelled) {
            const far = Math.abs(event.clientX - gesture.from.x) >= threshold
                || Math.abs(event.clientY - gesture.from.y) >= threshold;
            if (!far) return;
            gesture.travelled = true;
        }

        move?.(event, gesture);
    };

    const released = event => {
        if (active && event.pointerId === active.pointerId) finish(event, false);
    };

    const cancelled = event => {
        // `blur` carries no pointerId, so it ends whatever is live.
        if (active && (event?.pointerId === undefined || event.pointerId === active.pointerId)) {
            finish(null, true);
        }
    };

    handle.addEventListener('pointerdown', onPointerDown);

    return () => {
        handle.removeEventListener('pointerdown', onPointerDown);
        finish(null, true);
    };
}

/**
 * A click that must not be treated as one, because it is the tail of a drag.
 *
 * THE LATCH THIS REPLACES WAS A TRAP LEFT ARMED. A single panel-wide boolean was set when a
 * drag ended and cleared by *the next click on a foldable thing* — which might be a
 * different section, on a different object, minutes later. So a creator who reordered a
 * component and then, later, clicked a header to fold it found the click swallowed, and
 * clicking again worked. Intermittent, and impossible to attribute.
 *
 * WHAT IS REMEMBERED IS AN ELEMENT, NOT A FLAG, and it is forgotten on the very next press.
 * A trap that disarms itself before the next interaction cannot outlive the gesture that
 * set it.
 */
export class ClickGuard {

    #element = null;

    /** Swallow the next click on this element, if one comes at all. @param {HTMLElement} element - The element */
    arm(element) {
        this.#element = element ?? null;
    }

    /** Forget any armed click. Called on the next press, so nothing survives it. */
    disarm() {
        this.#element = null;
    }

    /**
     * Whether this click is the tail of the drag that just ended.
     * @param {HTMLElement} element - The element the click landed on
     * @returns {boolean} True when the click should be ignored
     */
    swallows(element) {
        if (!this.#element) return false;
        const armed = this.#element === element || this.#element?.contains?.(element);
        this.#element = null;
        return Boolean(armed);
    }
}
