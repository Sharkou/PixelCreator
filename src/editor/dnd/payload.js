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
    COMPONENT: 'component',
    /** One declared property of a component, carried out of the Inspector. */
    PROPERTY: 'property'
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
 * A drag of a component out of the Inspector.
 *
 * THE TYPE IS THE IDENTITY, and it is of PROJECT scope — a class name for a shipped
 * component, a `ResourceId` for a `.px` (ADR-0021). That is what a rule stores, and it is
 * why a Component may be named inside a graph where an Object may not (ADR-0034 §3.2).
 *
 * The label travels beside it because a `ResourceId` is unreadable, and the ghost has to
 * say what is being carried. It is presentation: nothing resolves it and nothing stores it.
 *
 * @param {object} object - The object carrying it
 * @param {string} type - The component type
 * @param {string} [label] - What a creator reads; the type itself when absent
 * @returns {object} The payload
 */
export function componentPayload(object, type, label) {
    return { kind: DragKind.COMPONENT, object, type, label: label ?? null };
}

/**
 * A drag of one declared property out of the Inspector.
 *
 * TWO IDENTITIES OF PROJECT SCOPE, AND NOTHING ELSE. A property is named by the Component
 * TYPE that declares it and by its own stable id (ADR-0021, ADR-0027 §4) — both belong to
 * the project, which is what lets them enter a `.px` where an `ObjectId` may not
 * (ADR-0034 invariant 1). The Object the Inspector happened to be showing is of SCENE scope
 * and is deliberately absent: nothing downstream needs it, so nothing carries it.
 *
 * AND THE OBJECT IT WAS READ OFF, AS A NAME. The Inspector knows which Object it is showing,
 * and a creator dragging `Transform.rotation` off Player means Player's rotation — so the
 * gesture carries it, and the drop can aim the node without a second drag and a wire
 * (ADR-0039 §3). It is the same shape `objectPayload()` uses and for the same reason: what
 * travels is a name and an identity, what LANDS in the `.px` is a socket named after it. The
 * `ObjectId` is carried for the length of the drag and written nowhere (ADR-0034 §1).
 *
 * @param {string} component - The Component type declaring the property
 * @param {string} property - The property's stable id
 * @param {string} [label] - What a creator reads; a `ResourceId` is not one
 * @param {object} [object] - The Object the property was read off, when there is one
 * @returns {object} The payload
 */
export function propertyPayload(component, property, label, object = null) {
    return {
        kind: DragKind.PROPERTY,
        component,
        property,
        label: label ?? null,
        object: object ? { id: object.id, name: object.name ?? '' } : null
    };
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
            return { label: payload.label || payload.type || 'Component', icon: 'component' };
        case DragKind.PROPERTY:
            return { label: payload.label || payload.property || 'Property', icon: 'properties' };
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
    CONTENT: 'content',
    /**
     * The canvas a `.px` is wired on.
     *
     * IT IS A ZONE SO THAT IT CAN REFUSE. Nothing is dropped on a graph yet — every gesture
     * ADR-0034 §3.7 lists is still refused, each for its own reason — and a target that no
     * rule mentions produces silence, which ADR-0026 §6 names the worst possible answer to a
     * gesture. Declaring the zone is what turns that silence into a sentence.
     */
    GRAPH: 'graph'
};
