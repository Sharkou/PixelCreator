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

/** The grid every glyph is drawn on. Exported for the one caller that draws in SVG. */
export const ICON_GRID = 16;
const GRID = ICON_GRID;

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
    // THE PROTOTYPE'S DRAWING, VERBATIM — three nodes and the edges between them
    // (`design/icons.js`, `graph`). The Editor had invented two boxes and a wire, which
    // read as a flowchart rather than as a node graph, and `design/prototype.js` settles
    // it twice: the asset `walk.px` carries `glyph: 'graph'`, and the Add Component menu
    // lists "Behavior Graph" with the same one. A `.px` IS a behaviour graph, so that is
    // the glyph a `.px` wears.
    graph: `<circle cx="4" cy="4.5" r="1.8" ${S}/><circle cx="12" cy="7.6" r="1.8" ${S}/>`
        + `<circle cx="5.2" cy="12" r="1.8" ${S}/><path d="M5.7 5.3 10.3 7M10.7 9 6.6 10.9" ${S}/>`,
    // A SCENE IS STACKED PLANES, and it is the prototype's answer rather than the
    // Editor's: `design/prototype.js` gives `arena.scene` the `layers` glyph. The frame
    // this file used to draw said "a picture", which is what an image already says.
    //
    // A SCENE RESOURCE IS STILL NOT THE HIERARCHY WINDOW. The window's glyph says "the
    // tree of what is in the scene"; this one says "a scene, as a thing you can open".
    layers: `<path d="M8 2.2 14 5.4 8 8.6 2 5.4z" ${S}/><path d="m2 8.6 6 3.2 6-3.2" ${S}/>`
        + `<path d="m2 11.4 6 3.2 6-3.2" ${S}/>`,
    image: `<rect x="2" y="3" width="12" height="10" rx="1.2" ${S}/>`
        + `<path d="M2.4 11.2 6 7.7l2.4 2.2L10.4 8l3.2 3" ${S}/>`
        + `<circle cx="5.6" cy="5.9" r="1" ${F}/>`,

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
    // Three dots: the menu that holds what a panel can do beyond its one primary action.
    more: `<circle cx="4" cy="8" r="1.15" ${F}/><circle cx="8" cy="8" r="1.15" ${F}/>`
        + `<circle cx="12" cy="8" r="1.15" ${F}/>`,
    share: `<circle cx="11.8" cy="4.2" r="2" ${S}/><circle cx="4.2" cy="8" r="2" ${S}/>`
        + `<circle cx="11.8" cy="11.8" r="2" ${S}/>`
        + `<path d="M6 7 10 5M6 9l4 2" ${S}/>`,
    // The prototype's `audio`: two arcs rather than one, which is what tells a speaker
    // from a muted one at 16 px.
    sound: `<path d="M3 6.2h2.3L8.4 3.6v8.8L5.3 9.8H3z" ${S}/>`
        + `<path d="M10.6 6.1a2.8 2.8 0 0 1 0 3.8M12.4 4.5a5.2 5.2 0 0 1 0 7" ${S}/>`,
    // `.js` behaviour, the other half of ADR-0009. Drawn now because the resource table
    // below has a row for it the moment a `.js` kind exists.
    script: `<path d="M4 2.5h5.4L12.4 5.6v7.9H4z" ${S}/><path d="M9.2 2.6v3.1h3.1" ${S}/>`
        + `<path d="M6 8.4h4.2M6 10.6h3" ${S}/>`,
    minus: `<path d="M3.5 8h9" ${S}/>`,
    // Two columns of dots: the universal "carry me" mark, and the only draggable handle
    // in the Inspector.
    grip: `<circle cx="6.2" cy="4.4" r="1.05" ${F}/><circle cx="9.8" cy="4.4" r="1.05" ${F}/>`
        + `<circle cx="6.2" cy="8" r="1.05" ${F}/><circle cx="9.8" cy="8" r="1.05" ${F}/>`
        + `<circle cx="6.2" cy="11.6" r="1.05" ${F}/><circle cx="9.8" cy="11.6" r="1.05" ${F}/>`,
    trash: `<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" ${S}/>`,
    close: `<path d="M4 4l8 8M12 4l-8 8" ${S}/>`,
    search: `<circle cx="7.2" cy="7.2" r="4.2" ${S}/><path d="M10.4 10.4 13.5 13.5" ${S}/>`,
    focus: `<path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" ${S}/>`
        + `<circle cx="8" cy="8" r="2" ${S}/>`,
    grid: `<path d="M2 6h12M2 10h12M6 2v12M10 2v12" ${S}/>`,
    // WHAT A THING DECLARES versus WHAT IS TRUE OF IT. The Inspector drew both its
    // Properties section and its Details section with the window's own glyph, so the two
    // read as the same kind of list — and they are opposites: one is the schema a creator
    // writes, the other is what the store knows. A list with a stub on each line for the
    // declaration; an "i" for the facts.
    properties: `<path d="M6 4.6h7.4M6 8h7.4M6 11.4h5" ${S}/>`
        + `<path d="M2.6 4.6h.9M2.6 8h.9M2.6 11.4h.9" ${S}/>`,
    info: `<circle cx="8" cy="8" r="6" ${S}/><path d="M8 7.4v3.6" ${S}/>`
        + `<circle cx="8" cy="5.1" r="0.95" ${F}/>`,

    // --- shapes of a value (ADR-0023) ------------------------------------------------
    //
    // A PROPERTY'S TYPE IS A THING A CREATOR PICKS, so it gets a glyph like everything else
    // they pick. The same seven appear on a `.px` property's badge, in the Type dropdown and
    // beside a graph node's ports — one drawing per idea, wherever the idea shows up.
    'type-number': `<path d="M5.6 3 4.2 13M11.8 3l-1.4 10" ${S}/><path d="M2.8 6.2h10.4M2.2 9.8h10.4" ${S}/>`,
    'type-int': `<path d="M4 5.6 6 4.4v7.2M4 11.6h4.2" ${S}/>`
        + `<path d="M9.6 6.4a1.9 1.9 0 1 1 3.4 1.2l-3.4 4h3.8" ${S}/>`,
    'type-text': `<path d="M3.4 4.2h9.2M8 4.2v7.6M6 11.8h4" ${S}/>`,
    'type-boolean': `<rect x="1.8" y="4.6" width="12.4" height="6.8" rx="3.4" ${S}/>`
        + `<circle cx="10.8" cy="8" r="1.9" ${F}/>`,
    'type-color': `<path d="M8 2.4 12 7a4.6 4.6 0 1 1-8 0z" ${S}/>`,
    'type-enum': `<path d="M6.4 4.6h7M6.4 8h7M6.4 11.4h7" ${S}/>`
        + `<circle cx="3.4" cy="4.6" r="1.1" ${F}/><circle cx="3.4" cy="8" r="1.1" ${F}/>`
        + `<circle cx="3.4" cy="11.4" r="1.1" ${F}/>`,
    'type-list': `<rect x="2.4" y="3" width="11.2" height="10" rx="1" ${S}/>`
        + `<path d="M5 6.2h6M5 9.8h6" ${S}/>`,
    // A reference: two links, because what it holds is a pointer and not a value.
    'type-resource': `<path d="M6.6 9.4 9.4 6.6" ${S}/>`
        + `<path d="M8.6 4.6 10 3.2a2.6 2.6 0 0 1 3.7 3.7l-1.4 1.4" ${S}/>`
        + `<path d="M7.4 11.4 6 12.8a2.6 2.6 0 0 1-3.7-3.7l1.4-1.4" ${S}/>`,

    // --- node categories (ADR-0027) --------------------------------------------------
    //
    // ONE GLYPH PER CATEGORY, not one per node type. Twenty drawings would be twenty things
    // to recognise; eight say what KIND of thing a node is, which is the question a creator
    // asks while the picker is open. A node type that wants its own may still declare one.
    'node-event': `<path d="M9.2 1.8 4 8.6h3.4L6.8 14.2 12 7.4H8.6z" ${S}/>`,
    'node-flow': `<path d="M2.6 8h6.6" ${S}/><path d="M8.4 4.8 12.4 8l-4 3.2z" ${S}/>`,
    'node-property': `<path d="M8.6 2.4H13v4.4l-6.2 6.2a1.2 1.2 0 0 1-1.7 0L2.4 10.3a1.2 1.2 0 0 1 0-1.7z" ${S}/>`
        + `<circle cx="10.7" cy="5.3" r="1" ${F}/>`,
    'node-value': `<path d="M5.6 3.2H4.4a1.2 1.2 0 0 0-1.2 1.2v2.4L2 8l1.2 1.2v2.4a1.2 1.2 0 0 0 1.2 1.2h1.2" ${S}/>`
        + `<path d="M10.4 3.2h1.2a1.2 1.2 0 0 1 1.2 1.2v2.4L14 8l-1.2 1.2v2.4a1.2 1.2 0 0 1-1.2 1.2h-1.2" ${S}/>`,
    'node-math': `<path d="M3 5.2h4M5 3.2v4" ${S}/><path d="M9 5.2h4" ${S}/>`
        + `<path d="M3.4 11.4h3.2M9.4 9.6l3.2 3.2M12.6 9.6l-3.2 3.2" ${S}/>`,
    'node-compare': `<path d="M6.4 4.4 2.6 8l3.8 3.6" ${S}/><path d="M9.6 4.4 13.4 8l-3.8 3.6" ${S}/>`,
    'node-logic': `<circle cx="6.2" cy="8" r="3.8" ${S}/><circle cx="9.8" cy="8" r="3.8" ${S}/>`,
    'node-debug': `<rect x="5" y="5.4" width="6" height="7.2" rx="3" ${S}/>`
        + `<path d="M5 8H2.4M11 8h2.6M5.6 5.6 4 4M10.4 5.6 12 4M5.6 11.6 4 13.2M10.4 11.6 12 13.2" ${S}/>`,

    // Transport (ADR-0029), FILLED, as `design/icons.js` draws them. A transport is the
    // one place in this chrome where the control is the shape: a hollow triangle reads as
    // an outline of Play, and the prototype is right to make it solid.
    play: `<path d="M4.5 3.2 12.8 8l-8.3 4.8z" ${F}/>`,
    pause: `<path d="M5 3.4h2.1v9.2H5zM8.9 3.4H11v9.2H8.9z" ${F}/>`,
    stop: `<rect x="4.2" y="4.2" width="7.6" height="7.6" rx="0.6" ${F}/>`,

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
 * Resource kind -> icon.
 *
 * A RESOURCE IS NOT A WINDOW, and the two must not share a glyph: `hierarchy` means the
 * window that lists a scene's objects, `scene` means a scene you can open. They were the
 * same drawing, which read as "this row is the Hierarchy" (ADR-0025).
 *
 * An image is an asset with a picture in it, so `asset` resolves to the picture glyph;
 * a kind with no entry falls back to the generic document, which is honest rather than
 * arbitrary.
 */
const RESOURCE_ICONS = {
    folder: 'folder',
    // `design/prototype.js`: `arena.scene` carries `layers`, `walk.px` carries `graph`.
    // The Editor used to draw a `.px` with the Component cube — which is the glyph of a
    // CAPABILITY AN OBJECT HAS, not of a file a creator opens. The two are different
    // things and now look different: `iconForComponent()` keeps the cube.
    scene: 'layers',
    component: 'graph',
    graph: 'graph',
    asset: 'image'
};

/**
 * The four families of glyph, and why they must not be shared.
 *
 * A RESOURCE is a thing in the Project panel — `folder`, `layers`, `graph`, `image`.
 * A WINDOW is a panel of the Editor — `hierarchy`, `inspector`, `folder`, `timeline`.
 * A COMPONENT is a capability an object has — `component`, `sprite`, `rectangle`, …
 * A NODE is a step in a behaviour, drawn by its CATEGORY — `node-event`, `node-math`, …
 *
 * They overlapped twice and both times it read as a bug: a `.px` row wearing the Add
 * Component cube, and every entry of the node menu wearing the graph canvas's own glyph
 * (ADR-0026 §11, ADR-0030 §5). `folder` is the one deliberate sharing — the Project window
 * IS a folder — and it is the exception that the table above makes visible.
 *
 * THERE IS NO PREFAB GLYPH, and that is not an oversight: `design/icons.js` draws none,
 * and prefabs are not designed (ADR-0026 §7). Inventing one would be the first half of a
 * format nobody has decided.
 */
export const ICON_FAMILIES = globalThis.Object.freeze({
    resource: globalThis.Object.freeze({ ...RESOURCE_ICONS }),
    window: globalThis.Object.freeze({
        hierarchy: 'hierarchy',
        inspector: 'inspector',
        project: 'folder',
        timeline: 'timeline'
    })
});

/**
 * The icon for a resource, from its kind.
 * @param {object|string} resource - A manifest entry, or a kind
 * @returns {string} An icon name
 */
export function iconForResource(resource) {
    const kind = typeof resource === 'string' ? resource : resource?.kind;
    return RESOURCE_ICONS[kind] ?? 'component';
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

/**
 * Property type -> icon.
 *
 * The Core's own eight (ADR-0023), each with one drawing. Used on a `.px` property's
 * badge, in the Type dropdown, and beside a graph node's data ports — so the shape of a
 * value looks the same wherever a creator meets it.
 */
const PROPERTY_TYPE_ICONS = {
    objectref: 'object',
    number: 'type-number',
    int: 'type-int',
    boolean: 'type-boolean',
    string: 'type-text',
    color: 'type-color',
    enum: 'type-enum',
    resource: 'type-resource',
    array: 'type-list'
};

/**
 * The icon for a shape of value.
 * @param {string} type - One of PropertyType, or ANY_TYPE
 * @returns {string} An icon name
 */
export function iconForPropertyType(type) {
    return PROPERTY_TYPE_ICONS[type] ?? 'node-value';
}

/**
 * Node category -> icon.
 *
 * Keyed by the category a definition declares (core/graph/nodes.js). A category nobody
 * anticipated falls back to the generic node glyph rather than to nothing, which is what
 * keeps the picker readable when a new group appears.
 */
const NODE_CATEGORY_ICONS = {
    Events: 'node-event',
    Flow: 'node-flow',
    Properties: 'node-property',
    Values: 'node-value',
    Math: 'node-math',
    Compare: 'node-compare',
    Logic: 'node-logic',
    Debug: 'node-debug'
};

/**
 * The icon for a node, from the category it declares.
 *
 * A NODE IS NOT ITS GRAPH, AND NEITHER IS ITS RESOURCE. `graph` means "the canvas a `.px`
 * is wired on", `component` means "a `.px` you can open", and these mean "what kind of
 * node this is". The three were one drawing, which made the create menu read as twenty
 * copies of the window it was opened from (ADR-0026 §11).
 *
 * @param {object|string} node - A node definition, or a category name
 * @returns {string} An icon name
 */
export function iconForNode(node) {
    if (typeof node === 'string') return NODE_CATEGORY_ICONS[node] ?? 'node-value';

    const declared = node?.icon;
    if (typeof declared === 'string' && declared in PATHS) return declared;
    return NODE_CATEGORY_ICONS[node?.category] ?? 'node-value';
}

/**
 * The raw drawing of an icon, for a caller that is already inside an SVG.
 *
 * `icon()` returns an HTML `<span>` wrapping an `<svg>`, which is right everywhere except
 * on the graph canvas — that one IS an SVG, and an HTML element inside it renders as
 * nothing. So the paths are handed over and the canvas places them itself, on the same
 * 16-unit grid (`ICON_GRID`) with a stroke width it scales for the size it draws at.
 *
 * @param {string} name - One of the known icon names
 * @returns {string} SVG markup, drawn on a 16x16 grid
 */
export function iconPaths(name) {
    return PATHS[name] ?? PATHS.object;
}
