// The Editor's icon set, as inline SVG — Modern Pixel.
//
// No icon font. Legacy pulled the whole of Font Awesome — five weights, twenty webfont
// files — and ADR-0006 flags icon fonts as a Shadow DOM problem anyway: a font loaded on
// the document styles the document, and a glyph inside a shadow root only works because
// the font family happens to be inherited. Inline SVG has no such question, adds no
// request, and colours itself with `currentColor`.
//
// TWO SIZES, AND ONLY TWO. 16 px in a row or a control, 20 px for the few places that
// need presence — a toolbar entry, an empty state. Anything else is snapped to one of
// them, because a 16-unit grid drawn at 13 px puts every stroke between two device
// pixels, which is what made the set look soft and unaligned. The call sites still pass
// their historical numbers; they are normalised here, and each window drops its literal
// as it is rebuilt.
//
// THE STROKE IS CONSTANT ON SCREEN, NOT IN THE GRID. `stroke-width` is a user-space
// length, so a fixed 1.4 rendered as 0.96 px at 11 px and 2.3 px at 26 px — the same set
// looked hairline in the Inspector and heavy in an empty state. It is now derived from
// the drawn size so every glyph lands at the same 1.5 px on screen, which is also the
// weight of the Editor's borders.
//
// The set is small and stays small: an icon is added when a control needs one, never
// because a library has it.

/** The only two sizes an icon is ever drawn at. */
export const IconSize = { SM: 16, MD: 20 };

/** Rendered stroke weight, in CSS pixels — the same as a border. */
const STROKE = 1.5;

/** The grid every glyph is drawn on. */
const GRID = 16;

const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

const PATHS = {
    // Object kinds
    object: `<path d="M3 5.5V3.5h2M11 3.5h2v2M13 10.5v2h-2M5 12.5H3v-2" ${S}/>`
        + `<circle cx="8" cy="8" r="1.35" ${F}/>`,
    rectangle: `<rect x="2.5" y="4" width="11" height="8" rx="1" ${S}/>`,
    circle: `<circle cx="8" cy="8" r="5" ${S}/>`,
    camera: `<path d="M1.8 5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1z" ${S}/>`
        + `<path d="M9.8 8 14.2 5.5v5L9.8 10.5z" ${S}/>`,
    sprite: `<rect x="2.5" y="3.5" width="11" height="9" rx="1" ${S}/>`
        + `<path d="M2.7 10.5 6 7.5l2.4 2.2L10.4 8l2.9 2.6" ${S}/>`
        + `<circle cx="5.6" cy="6.1" r="0.9" ${F}/>`,
    particles: `<circle cx="4" cy="11.5" r="1.5" ${F}/><circle cx="8.2" cy="7.6" r="1.1" ${F}/>`
        + `<circle cx="12" cy="4.2" r="0.9" ${F}/><circle cx="11.6" cy="9.6" r="0.7" ${F}/>`
        + `<circle cx="6.4" cy="4.4" r="0.7" ${F}/>`,
    tilemap: `<rect x="2.5" y="2.5" width="11" height="11" rx="1" ${S}/>`
        + `<path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" ${S}/>`,
    component: `<path d="M8 1.8 13.7 5v6L8 14.2 2.3 11V5z" ${S}/><path d="M2.3 5 8 8.2 13.7 5" ${S}/>`
        + `<path d="M8 8.2v6" ${S}/>`,

    // Windows
    hierarchy: `<path d="M3 3.5h4M3 3.5v9h3M6 8h4" ${S}/><path d="M6 3.5v4.5" ${S}/>`
        + `<path d="M10 2.2h3.2v2.6H10zM10 6.7h3.2v2.6H10zM10 11.2h3.2v2.6H10z" ${S}/>`
        + `<path d="M6 12.5h4" ${S}/>`,
    inspector: `<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" ${S}/>`
        + `<circle cx="6" cy="4.5" r="1.7" ${S}/><circle cx="10.5" cy="8" r="1.7" ${S}/>`
        + `<circle cx="5" cy="11.5" r="1.7" ${S}/>`,
    folder: `<path d="M1.8 12.2V4.3a.8.8 0 0 1 .8-.8h3l1.5 1.8h6.1a.8.8 0 0 1 .8.8v6.1a.8.8 0 0 1-.8.8H2.6a.8.8 0 0 1-.8-.8z" ${S}/>`,
    // Redrawn: the old glyph spanned y 3.5 to 9.6, so it sat 1.45 units above the centre
    // of its own box and read as misaligned next to every other icon. The bounds now
    // straddle y = 8 like the rest of the set.
    timeline: `<path d="M1.8 8h12.4" ${S}/><path d="M2.2 4.8v6.4M13.8 4.8v6.4" ${S}/>`
        + `<path d="M5.4 6.4 7 8l-1.6 1.6L3.8 8zM11.4 6.4 13 8l-1.6 1.6L9.8 8z" ${S}/>`,

    // Actions
    chevron: `<path d="M6 4l4 4-4 4" ${S}/>`,
    plus: `<path d="M8 3.5v9M3.5 8h9" ${S}/>`,
    minus: `<path d="M3.5 8h9" ${S}/>`,
    trash: `<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" ${S}/>`,
    close: `<path d="M4 4l8 8M12 4l-8 8" ${S}/>`,
    search: `<circle cx="7.2" cy="7.2" r="4.2" ${S}/><path d="M10.4 10.4 13.5 13.5" ${S}/>`,
    focus: `<path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" ${S}/>`
        + `<circle cx="8" cy="8" r="2" ${S}/>`,
    grid: `<path d="M2 6h12M2 10h12M6 2v12M10 2v12" ${S}/>`,

    // States
    eye: `<path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8z" ${S}/>`
        + `<circle cx="8" cy="8" r="1.8" ${S}/>`,
    'eye-off': `<path d="M6.3 4.1A6.8 6.8 0 0 1 8 3.8c4 0 6.5 4.2 6.5 4.2a12.4 12.4 0 0 1-2 2.4" ${S}/>`
        + `<path d="M3.7 5.2A12.2 12.2 0 0 0 1.5 8S4 12.2 8 12.2a6.7 6.7 0 0 0 2.2-.4" ${S}/>`
        + `<path d="M2.8 2.8l10.4 10.4" ${S}/>`,
    lock: `<rect x="3.5" y="7" width="9" height="6.2" rx="1.2" ${S}/>`
        + `<path d="M5.8 7V5.3a2.2 2.2 0 0 1 4.4 0V7" ${S}/>`,
    unlock: `<rect x="3.5" y="7" width="9" height="6.2" rx="1.2" ${S}/>`
        + `<path d="M5.8 7V5.3a2.2 2.2 0 0 1 4.2-.8" ${S}/>`
};

/**
 * The size an icon is actually drawn at.
 *
 * Everything below 18 is a control glyph and becomes 16; everything above is a presence
 * glyph and becomes 20. Nothing else exists, so a caller cannot reintroduce a size that
 * puts the grid off the pixel grid.
 *
 * @param {number} requested - The size a caller asked for
 * @returns {number} 16 or 20
 */
export function iconSize(requested) {
    return requested >= 18 ? IconSize.MD : IconSize.SM;
}

/**
 * Build an icon.
 *
 * The span carries the exact box so layout never depends on the SVG's intrinsic size,
 * and the SVG is a block so it cannot sit on a text baseline — the two reasons glyphs
 * looked a pixel high next to a label.
 *
 * @param {string} name - One of the known icon names
 * @param {number} [size] - Requested edge length; snapped to 16 or 20
 * @returns {HTMLElement} A span holding the SVG
 */
export function icon(name, size = IconSize.SM) {
    const edge = iconSize(size);
    // User units per CSS pixel, so the drawn weight is the same at both sizes.
    const stroke = (STROKE * GRID) / edge;

    const span = document.createElement('span');
    span.className = 'icon';
    span.setAttribute('aria-hidden', 'true');
    span.style.width = `${edge}px`;
    span.style.height = `${edge}px`;
    // Constant markup from the table above, never a caller's string.
    span.innerHTML = `<svg viewBox="0 0 ${GRID} ${GRID}" width="${edge}" height="${edge}"`
        + ` stroke-width="${stroke}">${PATHS[name] ?? PATHS.object}</svg>`;
    return span;
}

/** Component type name -> icon, for types the engine ships. */
const COMPONENT_ICONS = {
    Transform: 'object',
    RectangleRenderer: 'rectangle',
    Sprite: 'sprite',
    ParticleSystem: 'particles',
    Tilemap: 'tilemap',
    Camera: 'camera'
};

/**
 * The icon for a component type.
 *
 * A component may name its own through `static icon` (CONVENTIONS.md). None of the
 * shipped ones does — the convention was written for Font Awesome class names, which
 * this Editor no longer uses — so the table above stands in, and a type nobody knows
 * gets the generic component glyph rather than nothing.
 *
 * @param {Function|object} component - A component class or instance
 * @param {string} type - Its type name
 * @returns {string} An icon name
 */
export function iconForComponent(component, type) {
    const declared = (typeof component === 'function' ? component : component?.constructor)?.icon;
    if (typeof declared === 'string' && declared in PATHS) return declared;
    return COMPONENT_ICONS[type] ?? 'component';
}

/**
 * The icon that best describes an object, from what it carries.
 * @param {object} object - The object
 * @returns {string} An icon name
 */
export function iconForObject(object) {
    if (object.hasComponent('Camera')) return 'camera';
    if (object.hasComponent('Sprite')) return 'sprite';
    if (object.hasComponent('ParticleSystem')) return 'particles';
    if (object.hasComponent('Tilemap')) return 'tilemap';
    if (object.hasComponent('RectangleRenderer')) return 'rectangle';
    return 'object';
}
