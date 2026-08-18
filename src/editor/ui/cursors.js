// The cursors a drag draws, as pixels.
//
// WHY NOT `copy` AND `no-drop`. A drag in this Editor is a pointer gesture, not an HTML5
// one (ADR-0026 §6), so the browser draws no badge of its own — the system cursors are the
// only ones available, and they are drawn by the operating system in its own style. On
// Windows that is a smooth arrow with a green plus; next to an interface whose every glyph
// is on a 16-unit grid it looks like a foreign object dropped onto the screen.
//
// PIXELS ARE THE GRAMMAR (ui/styles.js). The mark, the selection handles and the
// transparency checker are already drawn as hard cells; the cursor is the one the creator
// looks at for the whole of a gesture, so it is the last place to hand the drawing to
// someone else. These are three 24x24 sprites: the arrow, and a badge that says what
// releasing here would do.
//
//   carry     the arrow alone, while nothing under it answers
//   accept    a dashed square — "this lands here", the same dashes every drop zone wears
//   refuse    a struck-through circle
//
// THE DASHED SQUARE IS NOT DECORATION. It is the same mark a drop target draws around
// itself (ADR-0028 §3), shrunk to cursor size: the badge and the outline it is pointing at
// are one statement, so a creator learns the convention once.
//
// SVG rather than PNG, and inlined as a data URL rather than fetched: a cursor that
// arrives a frame late is a cursor that flickers, and `shape-rendering: crispEdges` keeps
// the cells hard at any device ratio.

/** The grid every cursor sprite is drawn on. */
const SIZE = 24;

/** Where the pointer actually is, inside the sprite. */
const HOTSPOT = { x: 2, y: 2 };

/** The arrow: a filled pixel wedge with a dark rim, as `design/icons.js` draws the mark. */
const ARROW = '<path d="M2 1.5 2 16.5 6 12.8 8.6 18.6 11.6 17.2 9 11.6 14.2 11.2Z" '
    + 'fill="#f0f2f6" stroke="#2b2f37" stroke-width="1.4" stroke-linejoin="miter"/>';

/**
 * A cursor sprite, as a CSS `cursor` value.
 * @param {string} badge - The markup drawn beside the arrow
 * @returns {string} A `url(...) x y, fallback` cursor value
 */
function sprite(badge, fallback) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" `
        + `viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">${ARROW}${badge}</svg>`;

    // Encoded rather than base64: a data URL of SVG is shorter and readable in dev tools,
    // and `#` and `<` are the only characters a CSS url() cannot take raw.
    const encoded = svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'");
    return `url("data:image/svg+xml,${encoded}") ${HOTSPOT.x} ${HOTSPOT.y}, ${fallback}`;
}

/** A dashed square: what a drop zone outlines itself with, at cursor size. */
const ACCEPT_BADGE = '<g fill="none" stroke="#2b2f37" stroke-width="2">'
    + '<path d="M9 13h4M15 13h4M19 15v3M19 20v3M17 23h-4M11 23H9M9 21v-3M9 16v-1"/></g>';

/** A struck-through circle: the one shape that means "not here" in every interface. */
const REFUSE_BADGE = '<g fill="none" stroke="#f0555c" stroke-width="2.2">'
    + '<circle cx="15.5" cy="17.5" r="5"/><path d="m12 21 7-7"/></g>';

/** The three states a drag can be in, as CSS cursor values. */
export const DRAG_CURSORS = globalThis.Object.freeze({
    carry: sprite('', 'grabbing'),
    accept: sprite(ACCEPT_BADGE, 'copy'),
    refuse: sprite(REFUSE_BADGE, 'no-drop')
});

/**
 * The rules that put those cursors on the shell.
 *
 * WRITTEN AS A STRING AND INTERPOLATED, because the element under the pointer lives in a
 * shadow root the document's sheet cannot reach — and it is already asserting a cursor of
 * its own (`default` on a row, `pointer` on a button, `crosshair` on a port). During a drag
 * all of those are wrong: what the pointer is OVER matters, not what it would do if
 * clicked. Hence the descendant selector and the `!important`.
 *
 * @returns {string} CSS
 */
export function dragCursorRules() {
    return `
    .shell.dragging, .shell.dragging * { cursor: ${DRAG_CURSORS.carry} !important; }
    .shell.dragging-copy, .shell.dragging-copy * { cursor: ${DRAG_CURSORS.accept} !important; }
    .shell.dragging-refused, .shell.dragging-refused * { cursor: ${DRAG_CURSORS.refuse} !important; }
`;
}
