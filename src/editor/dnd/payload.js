// What is being dragged, as data (ADR-0026).
//
// ONE VOCABULARY FOR EVERY DRAG IN THE EDITOR. Legacy had a `Dnd` class of static state
// that windows read from each other — the renderer itself read `Dnd.hovering`, which is
// the coupling `tools/layers/run.js` still reports as its one known violation. Here a drag
// is a value: what it carries, where it came from, and nothing about the DOM.
//
// A payload names a SOURCE and a THING, never a target and never a gesture:
//
//   files       one or more files from outside the browser (Explorer, Finder, a desktop)
//   resource    a manifest entry being dragged out of the Project panel
//   object      a scene object being dragged out of the Hierarchy
//   component   a component being reordered inside the Inspector
//
// The rules that say what a drop MEANS live next door, in `rules.js`, and they are pure
// too. That separation is the whole design: a window turns pointer events into a payload
// and a target, asks whether the drop is legal, and performs it — no window contains a
// line of "if this is an image then create a sprite".

/** The sources a drag can come from. */
export const DragKind = {
    FILES: 'files',
    RESOURCE: 'resource',
    OBJECT: 'object',
    COMPONENT: 'component'
};

/**
 * A drag of files from outside the browser.
 *
 * `entries` are `{ name, mime, payload }` — already read, because a rule must be able to
 * decide and to act without touching a `File` or a `FileReader`. Reading them is the
 * window's job (`dnd/files.js`), and it is the only part of this that needs a DOM.
 *
 * @param {Array<{name: string, mime: string, payload: any}>} entries - The files, read
 * @returns {object} The payload
 */
export function filesPayload(entries) {
    return { kind: DragKind.FILES, entries: [...entries] };
}

/**
 * A drag of a resource out of the Project panel.
 * @param {object} resource - The manifest entry
 * @returns {object} The payload
 */
export function resourcePayload(resource) {
    return { kind: DragKind.RESOURCE, resource };
}

/**
 * A drag of an object out of the Hierarchy.
 * @param {object} object - The scene object
 * @returns {object} The payload
 */
export function objectPayload(object) {
    return { kind: DragKind.OBJECT, object };
}

/**
 * A drag of a component inside the Inspector.
 * @param {object} object - The object carrying it
 * @param {string} type - The component type
 * @returns {object} The payload
 */
export function componentPayload(object, type) {
    return { kind: DragKind.COMPONENT, object, type };
}

/** Where a drop lands. A zone, plus whatever that zone needs to name a place. */
export const DropZone = {
    /** The Project panel: a folder, or a row within it. */
    PROJECT: 'project',
    /** The scene surface: a world point. */
    SCENE: 'scene',
    /** The Hierarchy: the tree, optionally a parent row. */
    HIERARCHY: 'hierarchy',
    /** One property of one component, in the Inspector. */
    PROPERTY: 'property',
    /** The Content section of a resource being inspected. */
    CONTENT: 'content'
};
