// What colour a node wears, and what colour a wire wears — the one palette, as data.
//
// IT LIVES APART FROM THE RENDERER BECAUSE IT IS AN ANSWER, NOT A DRAWING. `windows/graph.js`
// defines a custom element and cannot be loaded without a DOM; this table cannot be checked
// without loading it, and the one defect it ever had was silent for exactly that reason —
// `Input` had no row, so `Key` and `Pointer` fell through to the grey of `any`, a hair from
// the steel `Flow` wears, and every creator read them as belonging with `Branch`. A missing
// row is now a failing test (`palette.test.js`), which is the only way a table like this
// stays honest.
//
// THE MIDDLE LAYER'S SIBLING (see `view.js`): the model says what a node IS, this says what
// that looks like, and the renderer does as it is told.

import { ANY_TYPE, OBJECT_TYPE, PropertyType, baseTypeOf } from '../../core/mod.js';

/**
 * A category's colour, and a value type's — from ONE palette of six (ui/styles.js).
 *
 * THE CODE MUST BE READABLE, WHICH MEANS IT MUST BE SMALL. A hue per category is twenty
 * colours and no meaning: nothing is learned, and the canvas becomes a carnival. Six hues,
 * reused between "what kind of node is this" and "what travels along this wire", give a
 * creator one palette to learn and one to recognise — a Math node and a `number` port are
 * deliberately the same blue.
 *
 * They are read as custom properties rather than as literals because a shadow root sees
 * custom properties and sees nothing else of the document's sheets.
 */
export const CATEGORY_HUES = {
    Events: 'var(--px-accent)',
    // THE WORLD ARRIVING WEARS ONE COLOUR. An Event is a moment and an Input is a state
    // that lasts, which is why they stay two groups in the menu — but to the eye they are
    // the same thing: something outside the graph, reaching in. `Input` had no row here at
    // all, so `Key` and `Pointer` fell through to the grey of `any` — a hair from the steel
    // `Flow` wears, which is why a creator read them as belonging with `Branch`.
    Input: 'var(--px-accent)',
    Flow: 'var(--px-hue-flow)',
    // READING OR WRITING A PROPERTY IS NOT THE SAME AS POINTING AT SOMETHING, and until the
    // palette gained a seventh hue it could not say so: both were violet, so `Self` and
    // `Get Property On` were one colour (ui/styles.js explains why the seventh is allowed).
    Properties: 'var(--px-hue-property)',
    // VIOLET IS THE POINTER, AND IT ALWAYS WAS. A Reference node hands over an Object, and
    // this is the colour its own `object` port wears below — so a `Self` node and the socket
    // it feeds are visibly the same kind of thing (ADR-0030 §4, ADR-0034 §3.2).
    References: 'var(--px-hue-reference)',
    // A TRANSFORM NODE WEARS THE PROPERTY HUE, because that is what it writes. It is its
    // own FAMILY in the menu — "where do I look to move something" is a different question
    // from "where do I look to read a value" — but it is not its own IDEA on the canvas,
    // and an eighth colour would be the carnival this table exists to prevent (ADR-0030 §4).
    Transform: 'var(--px-hue-property)',
    Math: 'var(--px-hue-number)',
    Compare: 'var(--px-hue-number)',
    Logic: 'var(--px-hue-boolean)',
    Debug: 'var(--px-hue-any)'
};

/**
 * The category whose nodes ARE values, and therefore have no colour of their own.
 *
 * The one place ADR-0030 4's rule needed a second look: a `Number` node wearing the green
 * of `Values` while its own port wore the blue of `number` is the single object in the
 * palette that got two colours - in the very category a creator learns the vocabulary from
 * (ADR-0033 4).
 */
export const LITERAL_CATEGORY = 'Values';

export const TYPE_HUES = {
    [PropertyType.NUMBER]: 'var(--px-hue-number)',
    [PropertyType.INT]: 'var(--px-hue-number)',
    [PropertyType.BOOLEAN]: 'var(--px-hue-boolean)',
    [PropertyType.STRING]: 'var(--px-hue-text)',
    [PropertyType.COLOR]: 'var(--px-hue-reference)',
    [PropertyType.ENUM]: 'var(--px-hue-reference)',
    [PropertyType.RESOURCE]: 'var(--px-hue-reference)',
    [PropertyType.ARRAY]: 'var(--px-hue-any)',
    // A HANDLE TO AN OBJECT IS A POINTER, so it wears what every other pointer wears. It
    // used to fall through to `any` — the absence of a type — which said the opposite of
    // what an `object` port is: the most constrained data port on the canvas, compatible
    // with itself and with nothing else (ADR-0034 §3.2).
    [OBJECT_TYPE]: 'var(--px-hue-reference)',
    [ANY_TYPE]: 'var(--px-hue-any)'
};

/** Execution order is not a value, so it has a hue of its own. */
export const FLOW_HUE = 'var(--px-hue-flow)';

/**
 * The colour a node wears.
 *
 * A NODE THAT IS A VALUE WEARS THAT VALUE'S COLOUR; everything else wears its category's
 * (ADR-0030 4, amended by ADR-0033 4). It is not a convenient exception: the hue says what
 * a thing IS, and for a literal, what it is IS its type.
 *
 * @param {object|null} definition - The node type
 * @param {{inputs: object[], outputs: object[]}} [ports] - Its ports right now
 * @returns {string} A CSS colour
 */
export function nodeHue(definition, ports = null) {
    const category = definition?.category ?? 'Other';

    if (category === LITERAL_CATEGORY) {
        const produced = (ports?.outputs ?? []).find(port => port.kind !== 'flow');
        return typeHue(produced?.type);
    }

    return categoryHue(category);
}

/**
 * The colour a node category wears.
 * @param {string} category - The declared category
 * @returns {string} A CSS colour
 */
export function categoryHue(category) {
    return CATEGORY_HUES[category] ?? 'var(--px-hue-any)';
}

/**
 * The colour a data type wears.
 * A PARAMETERISED TYPE WEARS ITS BASE TYPE'S HUE, and the palette gains no row for it. A
 * `List<Number>` is a list — what makes it blue rather than green would be what it HOLDS,
 * and a hue per element type is a table that grows with the Core's type list and says
 * nothing a creator can read off six colours. `baseTypeOf()` is the Core's own way of
 * asking, so this table stays the eight shapes ADR-0023 names and no more.
 *
 * @param {string} type - A port type, as `portTypeOf()` produces one
 * @returns {string} A CSS colour
 */
export function typeHue(type) {
    return TYPE_HUES[baseTypeOf(type)] ?? 'var(--px-hue-any)';
}

