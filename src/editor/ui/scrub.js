// Dragging a label sideways to change the number next to it.
//
// The third way of setting a value, beside typing it and stepping it, and the one that
// suits the moment when you are looking at the scene rather than at the field. Blender
// and Unity both do this; Legacy had none of it.
//
// IT LIVES HERE BECAUSE TWO CONTROLS NEED IT. `<px-number>` scrubs from the X / Y prefix
// inside a paired field, and `<px-field>` scrubs from the property label of a lone
// number — the same gesture, on two elements that cannot share a shadow root. Without
// this the behaviour existed on half the numeric fields and not the other half, which is
// worse than not having it.
//
// It owns no value. It reads one, writes one, and knows nothing about the Property
// System or about units.
//
// THE SCREEN EDGE USED TO END THE GESTURE, AND THAT WAS THE WHOLE BUG. The value came from
// `event.clientX - start`, so a drag that reached the edge of the display stopped producing
// new numbers: the pointer had nowhere left to go, and a creator wanting 400 more had to
// let go, come back, and drag again. Pointer Lock is the answer the platform gives — the
// cursor is taken off screen entirely and the mouse reports RELATIVE movement, so the drag
// is as long as the creator's arm rather than as long as the monitor. It is what Blender
// does natively and what Figma does on the web.
//
// ACCUMULATED DELTAS, NOT A DISTANCE FROM AN ANCHOR, because the lock arrives late. The
// request is asynchronous and can be refused outright — a browser without it, a page that
// has just released one, a creator pressing Esc mid-drag — so the gesture must be correct
// in both modes AND across the moment it changes. Every move adds a delta to one running
// total: `movementX` while locked, the distance since the previous event while not. The
// cursor freezes where the lock took it, so the fallback re-anchors there by itself and
// nothing jumps.
//
// NOTHING TELEPORTS THE CURSOR. Warping it back to the middle of the screen is the other
// way this is done, and it is a hack: it fights the operating system, it breaks on the
// accessibility settings that watch pointer motion, and it strands the cursor somewhere
// the creator did not leave it if the drag ends badly.

/** Pixels of horizontal drag worth one step. */
export const SCRUB_PER_STEP = 4;

/**
 * Make an element scrub a number.
 *
 * @param {HTMLElement} handle - The element to drag
 * @param {object} binding - How to read and write the value
 * @param {Function} binding.read - Returns the number the drag starts from
 * @param {Function} binding.write - Receives the number the drag has reached
 * @param {Function} [binding.step] - Returns what one step is worth; 1 by default
 * @returns {Function} Detach function
 */
export function attachScrub(handle, { read, write, step = () => 1 }) {
    let drag = null;

    // ANY LOCK DURING OUR DRAG IS OURS: the gesture is exclusive, and asking whether the
    // lock is on this exact element is a question shadow DOM answers badly — the cursor
    // belongs to the host, not to the span inside it.
    const locked = () => Boolean(handle.ownerDocument?.pointerLockElement);

    const down = event => {
        if (event.button > 0) return;
        event.preventDefault();
        handle.setPointerCapture?.(event.pointerId);
        drag = { last: event.clientX, travelled: 0, base: numberOrZero(read()), steps: 0 };
        handle.classList.add('scrubbing');
        // REFUSAL IS NOT A FAILURE OF THE GESTURE. Older browsers return nothing, newer
        // ones a promise that rejects when the page has just released a lock; either way
        // the drag carries on reading the cursor, only bounded by the screen again.
        try {
            handle.requestPointerLock?.()?.catch?.(() => {});
        } catch {
            // Same answer: scrub without it.
        }
    };

    const move = event => {
        if (!drag) return;

        drag.travelled += locked() ? numberOrZero(event.movementX) : event.clientX - drag.last;
        drag.last = event.clientX;

        const steps = Math.round(drag.travelled / SCRUB_PER_STEP);
        // Only when the value would actually change: a drag reports hundreds of moves
        // for the same rounded result, and each one would be an Operation.
        if (steps === drag.steps) return;
        drag.steps = steps;
        write(drag.base + steps * numberOrOne(step()));
    };

    const up = event => {
        if (!drag) return;
        if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        drag = null;
        handle.classList.remove('scrubbing');
        // The cursor comes back where it was taken, which is the handle the creator is
        // still pointing at.
        if (locked()) handle.ownerDocument?.exitPointerLock?.();
    };

    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);

    return () => {
        handle.removeEventListener('pointerdown', down);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
    };
}

function numberOrZero(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberOrOne(value) {
    return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : 1;
}
