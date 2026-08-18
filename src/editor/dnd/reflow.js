// Where every item sits while a move is only being previewed (ADR-0028 §1).
//
// THE PREVIEW IS DERIVED, NEVER STORED. Nothing here mutates a list, produces an Operation
// or touches the model: it takes the sizes a list currently has and a pending move, and
// answers how far each item would slide. The window applies those offsets as transforms
// and drops them the moment the gesture ends — so cancelling is not an undo, it is simply
// not asking again. That is what lets a flat list reorganise under the pointer without a
// single write, which ADR-0028 requires and which `legacy/editor/misc/sorter.js` got wrong
// by moving the real elements as the pointer crossed them.
//
// FLAT LISTS ONLY, ON PURPOSE. A tree asks two questions at once — which parent, and at
// what rank — and a target that moves while it is being aimed at makes the expensive
// mistake easy (ADR-0028 §1). The Hierarchy therefore keeps its indicator and this module
// is never called from it.
//
// The arithmetic is the whole of it: carrying item `from` to rank `to` slides everything
// between them by exactly the carried item's size, in the opposite direction, and slides
// the carried item by the total size of what it passed.

/**
 * How far each item slides while a move is previewed.
 *
 * @param {number[]} sizes - Each item's length along the axis, in order
 * @param {number} from - The rank being carried
 * @param {number} to - The rank it would land at, counting the carried item itself
 * @returns {number[]} One offset per item, in the same order; zero where nothing moves
 */
export function previewOffsets(sizes, from, to) {
    const offsets = sizes.map(() => 0);
    if (!valid(sizes, from) || !valid(sizes, to) || from === to) return offsets;

    const carried = sizes[from];

    if (to > from) {
        // Everything it passes comes back by its size; it advances by their total.
        let travelled = 0;
        for (let i = from + 1; i <= to; i++) {
            offsets[i] = -carried;
            travelled += sizes[i];
        }
        offsets[from] = travelled;
        return offsets;
    }

    let travelled = 0;
    for (let i = to; i < from; i++) {
        offsets[i] = carried;
        travelled += sizes[i];
    }
    offsets[from] = -travelled;
    return offsets;
}

/**
 * The order the list would have, once the previewed move is real.
 *
 * Used to check the preview against the model rather than to drive the DOM: if these two
 * ever disagree, the offsets are lying to the creator.
 *
 * @param {number} count - How many items the list holds
 * @param {number} from - The rank being carried
 * @param {number} to - The rank it would land at
 * @returns {number[]} The original ranks, in their previewed order
 */
export function previewOrder(count, from, to) {
    const order = Array.from({ length: count }, (_, i) => i);
    if (!valid(order, from) || !valid(order, to) || from === to) return order;

    const [carried] = order.splice(from, 1);
    order.splice(to, 0, carried);
    return order;
}

/**
 * The rank the pointer is over, in a list laid out along one axis.
 *
 * Measured against each item's midpoint, which is what makes the list feel like it swaps
 * rather than waits: crossing half of a neighbour is the moment the creator has decided.
 *
 * @param {number} position - The pointer's coordinate along the axis
 * @param {Array<{start: number, size: number}>} boxes - Each item's extent, in order
 * @returns {number} A rank between 0 and boxes.length - 1
 */
export function rankAt(position, boxes) {
    if (boxes.length === 0) return 0;

    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (position < box.start + box.size / 2) return i;
    }
    return boxes.length - 1;
}

function valid(list, index) {
    return Number.isInteger(index) && index >= 0 && index < list.length;
}
