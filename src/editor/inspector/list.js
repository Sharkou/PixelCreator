// What editing a list of values MEANS, apart from the control that draws it.
//
// THE SAME SPLIT THE REST OF THIS PANEL LIVES BY. `inspector/schema.js` answers "what
// control, what bounds, what unit" and touches no DOM; `windows/inspector.js` builds the
// controls out of that answer. A list is the same question one level down — "what does
// adding, removing, moving and editing an element produce" — and it is worth the same
// separation, because every interesting case is an arithmetic one: a move that lands where
// it started, a removal of the last element, two elements holding the same value.
//
// EVERY OPERATION RETURNS A NEW ARRAY, and that is not tidiness. The Property System is
// reactive: a value is announced when the property is ASSIGNED, so mutating the array in
// place would change what the model holds and tell nobody — no Change, no Operation, no
// undo entry, and an Inspector that has to be told to redraw itself. It is also what keeps
// the stored array and the one a control is holding from being the same object.
//
// AN ELEMENT IS ITS POSITION, NEVER ITS VALUE. Two elements holding `"idle"` are two
// elements; a list of three zeroes has three rows. Every operation here is indexed, and
// nothing looks a value up to decide what to act on.
//
// A MOVE IS THE EDITOR'S ONE MOVE. `previewOrder()` (dnd/reflow.js) already defines what
// reordering means for every list in this Editor — splice out, then splice in — and the
// components, the declared properties and the open tabs all obey it. A second definition
// here would be a second answer to "where does it land", and the day they differed a
// creator would see one thing and get another.

import { previewOrder } from '../dnd/reflow.js';
import { fieldFor } from './schema.js';

/**
 * The key one element is bound under.
 *
 * A control reads and writes a NAMED property of a reactive record (ui/field.js), and an
 * element of an array is not one — so it is given a record of its own with a single key.
 * Exported because the control that builds those records and the descriptor that names
 * them have to agree, and agreeing by coincidence is how they stop agreeing.
 */
export const ITEM_KEY = 'value';

/**
 * A list's elements, as an array nothing else holds a reference to.
 *
 * Anything that is not an array reads as an empty list rather than as an error: a property
 * whose value has never been set, or was set to something of the wrong shape, still has to
 * draw. The Core keeps the value it was given (ADR-0027 §8); this only says what to show.
 *
 * @param {any} value - What the property holds
 * @returns {any[]} Its elements, copied
 */
export function listOf(value) {
    return globalThis.Array.isArray(value) ? [...value] : [];
}

/**
 * The list with one more element at the end.
 *
 * @param {any} value - What the property holds
 * @param {any} item - The element to add
 * @returns {any[]} A new list
 */
export function addItem(value, item = null) {
    return [...listOf(value), item];
}

/**
 * The list without the element at a position.
 *
 * A position the list does not have leaves it alone, rather than removing the last element
 * by accident: `splice(-1)` is a real answer to a nonsense question, and the wrong one.
 *
 * @param {any} value - What the property holds
 * @param {number} index - The position to drop
 * @returns {any[]} A new list
 */
export function removeItem(value, index) {
    const items = listOf(value);
    if (!holds(items, index)) return items;

    return items.filter((item, at) => at !== index);
}

/**
 * The list with the element at one position moved to another.
 *
 * @param {any} value - What the property holds
 * @param {number} from - The position being moved
 * @param {number} to - Where it lands, counted in the RESULTING order
 * @returns {any[]} A new list
 */
export function moveItem(value, from, to) {
    const items = listOf(value);
    if (!holds(items, from) || !holds(items, to)) return items;

    return previewOrder(items.length, from, to).map(rank => items[rank]);
}

/**
 * The list with one element replaced, and every other one left exactly as it was.
 *
 * @param {any} value - What the property holds
 * @param {number} index - The position to write
 * @param {any} item - What it becomes
 * @returns {any[]} A new list
 */
export function setItem(value, index, item) {
    const items = listOf(value);
    if (!holds(items, index)) return items;

    items[index] = item;
    return items;
}

/**
 * The descriptor one element is edited through.
 *
 * BUILT BY `fieldFor()`, LIKE EVERY OTHER VALUE IN THIS EDITOR. An element of a list of
 * numbers is a number: it gets the stepper, the bounds and the unit a number gets, because
 * the mapping from a declared type to a control is `fieldKindFor()` and there is no second
 * one (ADR-0023). A list of anything the Editor can already edit is therefore editable
 * without a line written for that shape.
 *
 * The label is deliberately empty: a row of a list is named by where it is, and printing
 * "Value" three times is the same word three times on a narrow panel.
 *
 * ONE ARGUMENT, BECAUSE AN ELEMENT IS A DECLARATION AND NOT A TYPE NAME. A list of numbers
 * bounded at both ends is a list of sliders; a list of choices needs the options it may
 * hold. Both are said the way a property says them (ADR-0007), so what arrives here is that
 * same record — carried on the list's own descriptor as `element` (inspector/schema.js).
 *
 * @param {object|null} element - The declaration of one element, in the ADR-0007 shape
 * @returns {object} A field descriptor
 */
export function itemFieldFor(element) {
    return fieldFor(ITEM_KEY, { ...element, label: '' });
}

/** Whether a list has something at a position. */
function holds(items, index) {
    return globalThis.Number.isInteger(index) && index >= 0 && index < items.length;
}
