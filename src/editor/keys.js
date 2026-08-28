// The keys a creator may choose, as the adapter beside this file names them (ADR-0014 §2).
//
// WHY THE LIST LIVES HERE AND NOWHERE ELSE. `KeyboardEvent.code` is a browser vocabulary,
// and the Core is right to refuse it: a server replaying names off the network never sees a
// keyboard event to read one from, so `core/graph/standard.js` keeps the `key` param an
// opaque string and says so. But an opaque string in a text box is how a creator writes
// `Space ` with a trailing blank, or `KeyW ` as `W`, and gets a node that answers false for
// ever with nothing to show them why.
//
// `editor/input.js` IS THE SOURCE OF TRUTH, AND THIS IS ITS INVENTORY. That adapter is the
// one place in the product that produces key names — it writes `event.code` into the input
// state — so what a creator may pick is exactly what it can emit. The list is written out
// rather than discovered because there is nothing to discover it FROM: the platform exposes
// no enumeration of `code` values, and `navigator.keyboard.getLayoutMap()` answers only for
// the printable keys, only on Chromium, and only asynchronously. A finite written list of
// the values the W3C UI Events specification defines is the honest form, and its correctness
// is checked the only way it can be: a test presses every one of them through the adapter
// and asserts the runtime saw the same name.
//
// GROUPED, BECAUSE NINETY-NINE ROWS IS NOT A LIST. The dropdown this feeds is the Editor's
// own — categorised and filterable, the same one Add Component opens (ADR-0026 §10) — so a
// creator types "arr" and sees the four arrows, or opens Letters and reads A to Z.

/**
 * The groups, in the order the picker shows them, and the codes each holds.
 *
 * Order is a reading order, not an alphabet: the keys a game is most likely to bind come
 * first, and the ones a creator has to hunt for come last.
 */
const GROUPS = [
    ['Common', ['Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete']],
    ['Arrows', ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']],
    ['Letters', letters()],
    ['Digits', digits('Digit', 0, 9)],
    ['Modifiers', [
        'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
        'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock'
    ]],
    ['Navigation', ['Home', 'End', 'PageUp', 'PageDown', 'Insert']],
    ['Function', digits('F', 1, 12)],
    ['Numpad', [
        ...digits('Numpad', 0, 9),
        'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide',
        'NumpadDecimal', 'NumpadEnter'
    ]],
    ['Punctuation', [
        'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
        'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash'
    ]]
];

/** `KeyA` … `KeyZ`, in alphabetical order. */
function letters() {
    return Array.from({ length: 26 }, (item, index) => `Key${String.fromCharCode(65 + index)}`);
}

/** A run of numbered codes: `digits('F', 1, 12)` gives `F1` … `F12`. */
function digits(prefix, first, last) {
    const codes = [];
    for (let value = first; value <= last; value++) codes.push(`${prefix}${value}`);
    return codes;
}

/**
 * What a code reads as.
 *
 * DERIVED, NOT A SECOND TABLE. `KeyW` is `W` and `ArrowLeft` is `Arrow Left`, which is the
 * same humanising the rest of the Editor does to a property name — so the list carries the
 * codes it stores and nothing else, and a code added above needs no second edit here. The
 * three punctuation names are the exception, because their code says the position of a key
 * and a creator reads the mark on it.
 *
 * @param {string} code - A `KeyboardEvent.code` value
 * @returns {string} What the picker shows
 */
export function keyLabel(code) {
    const name = String(code ?? '');
    if (name in MARKS) return MARKS[name];
    if (/^Key[A-Z]$/.test(name)) return name.slice(3);
    if (/^Digit\d$/.test(name)) return name.slice(5);

    return name
        .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
        .replace(/^(Numpad) (\d)$/, '$1 $2');
}

/** The keys whose code names a position and whose keycap shows a mark. */
const MARKS = {
    Minus: '- Minus',
    Equal: '= Equal',
    BracketLeft: '[ Bracket Left',
    BracketRight: '] Bracket Right',
    Backslash: '\\ Backslash',
    Semicolon: '; Semicolon',
    Quote: '\' Quote',
    Backquote: '` Backquote',
    Comma: ', Comma',
    Period: '. Period',
    Slash: '/ Slash'
};

/**
 * Every key a creator may pick, in picker order.
 *
 * @returns {Array<{value: string, label: string, group: string}>} The options
 */
export function keyOptions() {
    return GROUPS.flatMap(([group, codes]) =>
        codes.map(code => ({ value: code, label: keyLabel(code), group })));
}

/**
 * Every key name this Editor can produce, as a set.
 *
 * Exported for the test that keeps this list and the adapter honest with one another.
 *
 * @returns {Set<string>} The codes
 */
export function keyCodes() {
    return new Set(GROUPS.flatMap(([, codes]) => codes));
}
