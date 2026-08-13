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

    const down = event => {
        if (event.button > 0) return;
        event.preventDefault();
        handle.setPointerCapture?.(event.pointerId);
        drag = { from: event.clientX, base: numberOrZero(read()), steps: 0 };
        handle.classList.add('scrubbing');
    };

    const move = event => {
        if (!drag) return;
        const steps = Math.round((event.clientX - drag.from) / SCRUB_PER_STEP);
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
