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

import { iconForResource } from '../ui/icons.js';

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
 *
 * IT CARRIES THE IDENTITY, NOT THE OBJECT, and that is a difference from
 * `resourcePayload()` rather than an inconsistency with it. A resource's rules decide from
 * what the entry IS — its kind, its mime — so the entry has to travel. An Object is decided
 * on by the PROPERTY it is dropped on, so the only thing a rule needs is the `ObjectId` it
 * will store; carrying nothing else is what makes it impossible for a rule to write a live
 * Object into a scene value, which is the invariant ADR-0034 §3.5 states and ADR-0036
 * closed at the other end of the same boundary.
 *
 * The name travels beside it because the ghost has to say what is being carried. It is a
 * label and never an identity: nothing resolves it and nothing stores it (ADR-0010).
 *
 * @param {object} object - The scene object
 * @returns {object} The payload
 */
export function objectPayload(object) {
    return { kind: DragKind.OBJECT, id: object?.id ?? null, name: object?.name ?? '' };
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

/**
 * What a drag is carrying, in words a creator can read.
 *
 * The ghost that follows the pointer has to name the thing being carried, and that name
 * is a fact about the payload rather than about any window — the Hierarchy, the Project
 * panel and the Inspector all show the same one for the same drag. Pure, so the wording
 * is testable without a pointer.
 *
 * @param {object} payload - A payload from this module
 * @returns {{label: string, icon: string}} What to show while it is in flight
 */
export function describePayload(payload) {
    switch (payload?.kind) {
        case DragKind.FILES: {
            const count = payload.entries?.length ?? 0;
            const first = payload.entries?.[0]?.name;
            return {
                label: count === 1 && first ? first : count + ' files',
                icon: 'image'
            };
        }
        case DragKind.RESOURCE:
            // The ghost shows what the RESOURCE is, not a generic folder: a creator
            // carrying an image should see an image (ADR-0026 §11).
            return { label: payload.resource?.name || 'Resource', icon: iconForResource(payload.resource) };
        case DragKind.OBJECT:
            return { label: payload.name || 'Object', icon: 'object' };
        case DragKind.COMPONENT:
            return { label: payload.type || 'Component', icon: 'component' };
        default:
            return { label: 'Item', icon: 'object' };
    }
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
    /** The component list of an object, in the Inspector: what a `.px` attaches to. */
    COMPONENTS: 'components',
    /** The Content section of a resource being inspected. */
    CONTENT: 'content'
};
