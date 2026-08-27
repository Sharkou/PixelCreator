// Where the keyboard is going — the one question every key handler in the Editor asks
// before it acts.
//
// THERE WAS ONE RULE AND THREE COPIES OF IT. `editor.js`, `windows/project.js` and
// `windows/graph.js` each carried the same six lines, and `project.js` said so in a comment:
// "the same guard `editor.js` and `windows/graph.js` use, for the same reason". Three copies
// of a rule is three chances for it to drift, and the arrival of a fourth caller — the
// keyboard feeding a running game (ADR-0014) — is what made keeping them apart untenable.
// A key that a creator typed into a text box must not also be a jump.
//
// IT WALKS INTO SHADOW ROOTS. Every field in this Editor lives inside a custom element's
// shadow root, and `document.activeElement` stops at the host: asked while a creator is
// typing into the Inspector, it answers `px-inspector` and never the `<input>`. So the
// answer is followed down until it stops moving.

/**
 * The element the keyboard is actually going to, shadow roots included.
 *
 * @returns {Element|null} The deepest focused element, or null when there is none
 */
export function focused() {
    let element = globalThis.document?.activeElement ?? null;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
}

/**
 * Whether the creator is typing, in which case a key belongs to the field and to nothing
 * else — not to a shortcut, and not to a running game.
 *
 * @returns {boolean} True when a text control has focus
 */
export function isEditing() {
    const element = focused();

    if (!element) return false;
    if (element.isContentEditable) return true;
    return element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA';
}
