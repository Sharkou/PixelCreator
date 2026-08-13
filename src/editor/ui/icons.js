// The Editor's icon set, as inline SVG.
//
// No icon font. Legacy pulled the whole of Font Awesome — five weights, twenty webfont
// files — and ADR-0006 flags icon fonts as a Shadow DOM problem anyway: a font loaded on
// the document styles the document, and a glyph inside a shadow root only works because
// the font family happens to be inherited. Inline SVG has no such question, adds no
// request, and colours itself with `currentColor`.
//
// The set is small and stays small: an icon is added when a control needs one, never
// because a library has it.

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
    object: `<rect x="2.5" y="2.5" width="11" height="11" rx="2" ${STROKE}/>`,
    rectangle: `<rect x="2.5" y="4.5" width="11" height="7" rx="1" ${STROKE}/>`,
    camera: `<path d="M1.5 5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1z" ${STROKE}/>`
        + `<path d="M9.5 8 14 5.5v5L9.5 10.5z" ${STROKE}/>`,
    component: `<path d="M8 1.5 14 5v6l-6 3.5L2 11V5z" ${STROKE}/><path d="M2 5l6 3.5L14 5" ${STROKE}/>`
        + `<path d="M8 8.5V14.5" ${STROKE}/>`,
    chevron: `<path d="M6 4l4 4-4 4" ${STROKE}/>`,
    plus: `<path d="M8 3.5v9M3.5 8h9" ${STROKE}/>`,
    trash: `<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" ${STROKE}/>`,
    close: `<path d="M4 4l8 8M12 4l-8 8" ${STROKE}/>`,
    eye: `<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" ${STROKE}/>`
        + `<circle cx="8" cy="8" r="1.8" ${STROKE}/>`,
    'eye-off': `<path d="M6.2 3.8A6.6 6.6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-2 2.5"  ${STROKE}/>`
        + `<path d="M3.6 5A12 12 0 0 0 1.5 8S4 12.5 8 12.5a6.5 6.5 0 0 0 2.3-.4" ${STROKE}/>`
        + `<path d="M2.5 2.5l11 11" ${STROKE}/>`,
    focus: `<path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" ${STROKE}/>`
        + `<circle cx="8" cy="8" r="2" ${STROKE}/>`,
    grid: `<path d="M2 6h12M2 10h12M6 2v12M10 2v12" ${STROKE}/>`
};

/**
 * Build an icon.
 * @param {string} name - One of the known icon names
 * @param {number} [size] - Edge length in pixels
 * @returns {HTMLElement} A span holding the SVG
 */
export function icon(name, size = 14) {
    const span = document.createElement('span');
    span.className = 'icon';
    span.setAttribute('aria-hidden', 'true');
    // Constant markup from the table above, never a caller's string.
    span.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}">${PATHS[name] ?? PATHS.object}</svg>`;
    return span;
}

/**
 * The icon that best describes an object, from what it carries.
 *
 * Presentation only. A component may declare `static icon` (CONVENTIONS.md) and none of
 * the shipped ones does yet, so this reads the component set instead of inventing a
 * registry the engine does not have.
 *
 * @param {object} object - The object
 * @returns {string} An icon name
 */
export function iconForObject(object) {
    if (object.hasComponent('Camera')) return 'camera';
    if (object.hasComponent('RectangleRenderer') || object.hasComponent('Sprite')) return 'rectangle';
    return 'object';
}
