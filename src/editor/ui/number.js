// A number as TEXT: what a field may show, and what it may be caught holding on the way.
//
// Two functions, and they are inverses of each other. `format()` turns a value into the
// characters a box displays; `admits()` says whether characters a box now contains could
// still become a value. A control that displayed something its own rule refused would be
// unable to re-parse what it had just written, so they belong in one file and are read
// together.
//
// SEPARATE FROM `<px-number>` BECAUSE THE RULE IS NOT A DOM QUESTION, and half of
// `src/editor/` cannot be loaded without a browser (`tools/check-exports.js` says so at
// length). The interaction is testable by eye; the grammar is testable by machine, and
// the regression that produced it — one letter emptying a field — is a grammar failure.

/**
 * What a number looks like ON THE WAY to being one.
 *
 * NOT `Number.isFinite`, WHICH IS THE WHOLE POINT. `-`, `1.`, `1e` and `1e-` are all
 * halfway to a value and must survive in the box; `12a` is not on the way to anything. The
 * empty string is allowed too: clearing a field before retyping it is how people type.
 *
 * The exponent is admitted because `format()` can PRODUCE one — a very small number reads
 * as `1e-7` — and a control that refused to accept what it had just displayed would be
 * unable to re-parse its own value.
 */
const PARTIAL_NUMBER = /^[-+]?[0-9]*\.?[0-9]*(?:[eE][-+]?[0-9]*)?$/;

/** The same, for a field that only holds whole numbers: no point, no exponent. */
const PARTIAL_INTEGER = /^[-+]?[0-9]*$/;

/**
 * Whether a box holding this text is still on its way to a number.
 *
 * THE RULE IS ABOUT THE RESULT, NOT THE KEYSTROKE. `-` is legal at the front and nowhere
 * else, `.` once and only where decimals are allowed, and a pasted `12px` is refused for
 * the same reason a typed `p` is. Judging the whole string is what makes one rule cover
 * typing, pasting, dropping and dictation alike.
 *
 * A BOUND IS A PROMISE THE CONTROL CAN KEEP EARLY. A field whose minimum is zero will clamp
 * `-5` to `0` the moment it is read, so letting the sign be typed only to take it away is a
 * control arguing with the person using it.
 *
 * @param {string} text - What the box would contain
 * @param {object} [config] - The field's rules
 * @param {boolean} [config.integer] - Whole numbers only
 * @param {number|null} [config.min] - Lower bound, when there is one
 * @returns {boolean} True when the entry may stand
 */
export function admits(text, { integer = false, min = null } = {}) {
    const shape = integer ? PARTIAL_INTEGER : PARTIAL_NUMBER;
    if (!shape.test(text)) return false;
    if (!text.startsWith('-')) return true;
    return min === null || min < 0;
}

/**
 * The number a box is holding, or null when it is not holding one yet.
 *
 * `Number('')` IS ZERO, AND THAT IS THE BUG THIS EXISTS TO KEEP OUT. Clearing a field is how
 * people retype it, so an empty box means "nothing yet" — but the language reads it as the
 * value 0, and a control that believed that told a panel the position was 0 while the object
 * sat at 200. Every other half-typed entry already answered NaN; the empty string was the
 * one that answered a plausible lie.
 *
 * @param {string} text - What the box contains
 * @returns {number|null} The value, or null when the entry is not one yet
 */
export function parse(text) {
    const trimmed = globalThis.String(text ?? '').trim();
    if (trimmed === '') return null;
    const value = globalThis.Number(trimmed);
    return globalThis.Number.isFinite(value) ? value : null;
}

/**
 * The characters a field shows for a value.
 *
 * TWELVE SIGNIFICANT DIGITS, WHICH IS WHERE BINARY FLOAT NOISE STARTS. A position nudged by
 * 0.1 three times is 0.30000000000000004, and a panel full of that is unreadable. Nothing
 * is rounded in the model — only what is drawn.
 *
 * Not-a-number shows as nothing, and the control is responsible for never asking.
 *
 * @param {number|null} value - The value
 * @returns {string} What to display
 */
export function format(value) {
    if (!globalThis.Number.isFinite(value)) return '';
    return globalThis.String(globalThis.Number(value.toPrecision(12)));
}
