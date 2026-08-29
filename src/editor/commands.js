// Structural edits the Editor performs on the model.
//
// THIS IS WHERE STRUCTURAL OPERATIONS ARE PRODUCED (ADR-0019). Every function here turns
// a creator's gesture into one Operation, or into one `batch` of them — which is what
// makes it replicable, arbitrable and undoable, all three for free and none of them a
// separate feature.
//
// Property edits are deliberately NOT here. They go straight through
// `target.setProperty()` from the field that made them, because the Property System is
// already the controlled path (CONVENTIONS.md) and wrapping it would add a layer that
// only forwards.
//
// THE ONE POLICY THE EDITOR OWNS ALONE is preserving the world placement when an object
// is reparented (ADR-0022). It is composed here, as Operations, and never pushed into the
// Core: a `REPARENT` that also rewrote the Transform would have to carry five previous
// values to stay invertible, and every node recomposing its own floats would make two
// machines drift apart on rounding — the kind of desynchronisation nobody ever diagnoses.

import {
    Object,
    Transform,
    addComponentOperation,
    addObjectOperation,
    components as defaultRegistry,
    createId,
    moveComponentOperation,
    Origin,
    removeComponentOperation,
    removeObjectOperation,
    reparentOperation,
    serializeComponent,
    serializeObject,
    worldMatrix
} from '../core/mod.js';
import { Camera, RectangleRenderer } from '../runtime/mod.js';

/**
 * What the "create" menu offers, and what each entry is made of.
 *
 * Empty leads: it is the object every other kind is — a name, a Transform, nothing else —
 * and the one a creator reaches for when they are about to build something rather than
 * drop a placeholder. The order here is the order of the menu and of the creation rail.
 * It is NOT the default: `createObject()` still falls back to a rectangle, because a tool
 * dropped with no kind should leave something visible in the scene.
 */
export const OBJECT_KINDS = [
    { id: 'empty', label: 'Empty', icon: 'object', category: 'Basic' },
    { id: 'rectangle', label: 'Rectangle', icon: 'rectangle', category: 'Basic' },
    { id: 'camera', label: 'Camera', icon: 'camera', category: 'Scene' }
];

/**
 * Group order for the create menu.
 *
 * The names are the prototype's own (design/prototype.js, CREATE_OBJECT). Its Basic group
 * also lists a Circle and its Rendering group a Sprite, Particles and a Tilemap — those
 * are not creatable kinds here, and a menu entry that creates nothing is worse than a
 * short menu, so the groups hold exactly what exists.
 */
export const KIND_CATEGORIES = ['Basic', 'Rendering', 'Scene', 'Other'];

/**
 * The create menu's entries, grouped, in category order.
 * @returns {object[]} `{ heading }` and `{ id, label, icon }` entries, ready for openMenu
 */
export function createMenuItems() {
    const items = [];

    for (const category of KIND_CATEGORIES) {
        const kinds = OBJECT_KINDS.filter(kind => kind.category === category);
        if (kinds.length === 0) continue;

        items.push({ heading: category });
        for (const kind of kinds) items.push({ id: kind.id, label: kind.label, icon: kind.icon });
    }

    return items;
}

/**
 * Create an object and add it to the scene, as one ADD_OBJECT operation.
 *
 * The object is built detached, serialized, and submitted — identifier included, so every
 * node that receives the operation builds the same object with the same id rather than
 * minting its own (ADR-0019).
 *
 * @param {object} scene - The scene to add to
 * @param {object} [options] - Options
 * @param {string} [options.kind] - One of OBJECT_KINDS
 * @param {number} [options.x] - Horizontal world position
 * @param {number} [options.y] - Vertical world position
 * @param {object} [options.parent] - Object to attach the new one to
 * @param {number} [options.index] - Rank among its siblings, or among the roots
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {object|null} The new object, or null when the operation was refused
 */
export function createObject(scene, {
    kind = 'rectangle',
    x = 0,
    y = 0,
    parent = null,
    index,
    actor,
    batch
} = {}) {
    const object = new Object(uniqueName(scene, labelOf(kind)));
    object.addComponent(new Transform(x, y));

    if (kind === 'rectangle') object.addComponent(new RectangleRenderer(64, 64, '#4a4a52'));
    if (kind === 'camera') object.addComponent(new Camera());

    const result = scene.operations.submit(addObjectOperation({
        object: serializeObject(object),
        parent: parent?.id ?? null,
        index: index ?? null,
        origin: Origin.EDITOR,
        actor,
        batch
    }));

    // The handler rebuilds the object from the payload, so what joined the scene is not
    // the instance built above — asking the scene is what returns the live one.
    return result.applied ? scene.get(object.id) : null;
}

/**
 * Remove an object and everything under it, as one REMOVE_OBJECT operation.
 *
 * The subtree, the parent and the rank all travel with the operation. Without them,
 * undoing a deletion returns a stripped object at the end of the list — which is the
 * difference between an undo and an apology (ADR-0024).
 *
 * @param {object} scene - The scene
 * @param {object} object - The object to delete
 * @param {object} [options] - Options
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {boolean} True when an object was removed
 */
export function deleteObject(scene, object, { actor, batch } = {}) {
    if (!object || !scene.has(object)) return false;

    const result = scene.operations.submit(removeObjectOperation({
        object: serializeObject(object),
        subtree: descendants(object).map(serializeObject),
        parent: object.parent?.id ?? null,
        index: scene.indexOf(object),
        origin: Origin.EDITOR,
        actor,
        batch
    }));

    return result.applied;
}

/**
 * Attach a component of a registered type, as one ADD_COMPONENT operation.
 * @param {object} object - The object to attach to
 * @param {string} type - The component type name
 * @param {object} [registry] - Component registry to resolve the type in
 * @param {object} [options] - Options
 * @param {number} [options.index] - Rank in the ordered collection
 * @param {object} [options.values] - Starting values; the type's defaults when omitted
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {object|undefined} The attached component, or undefined when refused
 */
export function addComponent(object, type, registry = defaultRegistry, { index, values, actor, batch } = {}) {
    const result = object.operations.submit(addComponentOperation({
        object: object.id,
        component: type,
        index: index ?? null,
        // The defaults travel too, so a receiving node builds the same component even if
        // its own registry disagrees about what a fresh one looks like.
        values: values ?? serializeComponent(registry.create(type)),
        origin: Origin.EDITOR,
        actor,
        batch
    }));

    return result.applied ? object.getComponent(type) : undefined;
}

/**
 * Detach a component, as one REMOVE_COMPONENT operation.
 *
 * `values` and `index` travel with it, so undoing gives back the component that left
 * rather than a fresh one reset to its defaults at the end of the list.
 *
 * @param {object} object - The object to detach from
 * @param {string} type - The component type name
 * @param {object} [options] - Options
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {boolean} True when a component was detached
 */
export function removeComponent(object, type, { actor, batch } = {}) {
    const component = object.getComponent(type);
    if (!component) return false;

    const result = object.operations.submit(removeComponentOperation({
        object: object.id,
        component: type,
        index: object.componentIndex(type),
        values: serializeComponent(component),
        origin: Origin.EDITOR,
        actor,
        batch
    }));

    return result.applied;
}

/**
 * Move a component to another rank, as one MOVE_COMPONENT operation.
 *
 * Nothing is detached and no value is touched — which is exactly why this is not
 * "remove then add again", a gesture that loses both the values and the rank.
 *
 * @param {object} object - The object
 * @param {string} type - The component type name
 * @param {number} index - The rank to move it to
 * @param {object} [options] - Options
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {boolean} True when the order changed
 */
export function moveComponent(object, type, index, { actor, batch } = {}) {
    const previousIndex = object.componentIndex(type);
    if (previousIndex === -1) return false;

    const result = object.operations.submit(moveComponentOperation({
        object: object.id,
        component: type,
        index,
        previousIndex,
        origin: Origin.EDITOR,
        actor,
        batch
    }));

    return result.applied;
}

/**
 * Move an object under another parent, at a rank, keeping it where it looks (ADR-0022).
 *
 * ONE GESTURE, ONE HISTORY ENTRY, SIX OPERATIONS:
 *
 *   batch { REPARENT, SET_PROPERTY x, y, rotation, scaleX, scaleY }
 *
 * Dropping an object into another branch of the Hierarchy is a tidying gesture, not a
 * move: in Unity, Godot and Blender the object does not budge on screen, and a creator
 * arranging their tree is arranging, not repositioning. So the local values are recomputed
 * to hold the world placement — recomputed HERE, once, and sent as plain numbers, so no
 * two machines ever decompose the same matrix and disagree in the last bits.
 *
 * WHEN THE WORLD CANNOT BE HELD. Under a parent that shears — a non-uniform scale above a
 * rotation — the required local transform is not expressible as `(x, y, rotation, scaleX,
 * scaleY)`. Rather than deform the object silently, the reparent happens and the local
 * values are left alone, and the caller is told through `sheared` and `onReport`. That is
 * ADR-0012's rule applied to geometry: the system says what it could not do.
 *
 * @param {object} scene - The scene
 * @param {object} object - The object to move
 * @param {object|null} parent - The new parent, or null to make it a root
 * @param {number} [index] - Rank among the new siblings; appended when omitted
 * @param {object} [options] - Options
 * @param {boolean} [options.preserveWorld] - Hold the world placement; true by default
 * @param {string} [options.actor] - Who authored the intent
 * @param {Function} [options.onReport] - Called when the world could not be preserved
 * @returns {{applied: boolean, batch: string|null, sheared: boolean}} What happened
 */
export function reparentObject(scene, object, parent = null, index, {
    preserveWorld = true,
    actor,
    onReport
} = {}) {
    if (!object || !scene.has(object)) return { applied: false, batch: null, sheared: false };

    const batch = createId();
    const world = preserveWorld ? worldMatrix(object) : null;

    const result = scene.operations.submit(reparentOperation({
        object: object.id,
        parent: parent?.id ?? null,
        index: index ?? null,
        previousParent: object.parent?.id ?? null,
        previousIndex: scene.indexOf(object),
        origin: Origin.EDITOR,
        actor,
        batch
    }));

    if (!result.applied || !preserveWorld) {
        return { applied: result.applied, batch, sheared: false };
    }

    const transform = object.getComponent('Transform');
    if (!transform) return { applied: true, batch, sheared: false };

    const local = localPlacement(world, parent);
    if (!local || local.sheared) {
        // Reported, not corrected, and not silently deformed either: the object keeps the
        // local values it had, which is a defensible placement rather than a wrong one.
        onReport?.({
            kind: 'reparent:sheared',
            object,
            parent,
            message: `Keeping ${object.name || object.id} at its local placement: `
                + 'its new parent shears, and a sheared transform cannot be stored as '
                + 'position, rotation and scale.'
        });
        return { applied: true, batch, sheared: true };
    }

    for (const prop of ['x', 'y', 'rotation', 'scaleX', 'scaleY']) {
        transform.setProperty(prop, local[prop], { origin: Origin.EDITOR, actor, batch });
    }

    return { applied: true, batch, sheared: false };
}

/**
 * The component types that can still be added to an object.
 *
 * An Object holds at most one component per type, so what is already attached is not
 * offered again — the alternative is a menu entry that always throws.
 *
 * @param {object} object - The object
 * @param {object} [registry] - Component registry to list
 * @returns {string[]} Type names, sorted
 */
export function availableComponents(object, registry = defaultRegistry) {
    return registry.types().filter(type => !object.hasComponent(type));
}

/**
 * A name no other object in the scene is using.
 *
 * Names are not identities (ADR-0010), so duplicates are legal — they are just unhelpful
 * in a Hierarchy, which is the only reason this exists.
 *
 * @param {object} scene - The scene to look in
 * @param {string} base - The name to start from
 * @returns {string} The name to use
 */
export function uniqueName(scene, base) {
    if (scene.findByName(base).length === 0) return base;

    for (let suffix = 2; ; suffix++) {
        const candidate = `${base} ${suffix}`;
        if (scene.findByName(candidate).length === 0) return candidate;
    }
}

function labelOf(kind) {
    return OBJECT_KINDS.find(entry => entry.id === kind)?.label ?? 'Object';
}

/**
 * Every object under one, depth first, parents before their children.
 *
 * The order matters when the list is replayed by an ADD_OBJECT: a child must never be
 * restored before the parent it hangs from.
 *
 * @param {object} object - The root of the walk, itself excluded
 * @returns {object[]} The descendants
 */
export function descendants(object) {
    const found = [];
    for (const child of object.children) {
        found.push(child, ...descendants(child));
    }
    return found;
}

/**
 * The local placement an object must take under a new parent to stay where it looks.
 * @param {object} world - The world matrix to hold
 * @param {object|null} parent - The new parent, or null for the scene root
 * @returns {object|null} The decomposed placement, or null when the parent is degenerate
 */
function localPlacement(world, parent) {
    if (!parent) return world.decompose();

    const parentWorld = worldMatrix(parent);
    // A parent scaled to zero collapses everything under it; there is no local placement
    // that holds the world, and inverting would throw inside a pipeline.
    if (parentWorld.a * parentWorld.d - parentWorld.b * parentWorld.c === 0) return null;

    return parentWorld.invert().multiply(world).decompose();
}

/**
 * Point every instance of a Component type at an Object, through one of its sockets.
 *
 * THE HALF OF THE GESTURE THAT LIVES IN THE SCENE (ADR-0043). Dropping an Object on a graph
 * declares an `objectref` INPUT on the `.px` and a node that reads it — and stops there,
 * because a `.px` is of project scope and an ObjectId is of scene scope (ADR-0034 invariant
 * 1). What it left the creator to do by hand was the other half: select each Object carrying
 * the Component and choose the target in the Inspector. Nothing said so, the node looked
 * finished, and the graph did nothing — the commonest way this feature failed.
 *
 * The identity therefore goes where it is already legal: into the VALUE each attached
 * component holds, in the scene being edited. The `.px` still holds only a socket name, and
 * the same file dropped into another scene points at nothing until that scene says so.
 *
 * ONLY WHERE NOTHING IS SET. A creator who aimed door #3 at a different Player keeps it: a
 * gesture that names a default must not overwrite an answer somebody already gave.
 *
 * @param {object} scene - The scene whose instances are pointed
 * @param {object} socket - The `objectref` property descriptor, carrying its `name`
 * @param {object} options - Options
 * @param {string} options.type - The Component type the socket belongs to
 * @param {string} options.object - The ObjectId to point at
 * @param {string} [options.batch] - Groups the writes with the gesture that asked
 * @param {string} [options.actor] - Who is authoring
 * @returns {object[]} The components that were pointed
 */
export function pointSocketAt(scene, socket, { type, object, batch, actor } = {}) {
    if (!scene || !socket?.name || !type || !object) return [];

    const pointed = [];
    for (const candidate of scene.objects()) {
        const component = candidate.getComponent?.(type) ?? null;
        // `??` AND NOT `||`: an empty string is not a value this property can hold, but a
        // falsy value of some other type would be — and only "no answer yet" may be filled.
        if (!component || (component[socket.name] ?? null) !== null) continue;

        component.setProperty(socket.name, object, { batch, actor });
        pointed.push(component);
    }
    return pointed;
}
