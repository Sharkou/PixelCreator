// Copying an Object that is already in a Scene, back into that same Scene.
//
// THIS IS WHAT "SPAWN" INSTANTIATES, AND IT IS NOT A PREFAB. There is no prefab format
// (ADR-0026 §7), and there cannot be one in the Runtime: a Resource is resolved through
// asynchronous storage that neither the Core nor the Runtime reaches (ADR-0020, ADR-0034
// §3.2), so a node that instantiated a `ResourceId` would have to wait in the middle of a
// simulation step. What CAN be instantiated inside a step is something the Scene already
// holds — and a live Object is a complete description of an instance: its components, its
// values, its children, its order. So a copy is made from a model, and no second model of
// what an Object is has to be invented (ADR-0056).
//
// IT IS A ROUND TRIP THROUGH THE FORMAT, DELIBERATELY. `serializeObject()` already knows
// exactly which fields belong to an Object and `restoreSubtree()` already knows how to put
// one back — links, ranks and all, because that is what undoing a deletion runs. A bespoke
// walk would be a SECOND opinion about what an Object is made of, and it would drift the
// first time a field is added to one. Legacy had that second opinion and it was called
// `copy()`: it walked the write-only `$prop` accessors and wiped `components`, `childs` and
// `image` to undefined (core/serialize.js).
//
// EVERY IDENTITY IS FRESH, AND THE WHOLE SUBTREE IS REMAPPED TOGETHER. A copy is a new
// Object, not the same one twice — `Scene.add()` refuses a duplicate id outright — so the
// ids are drawn before anything is rebuilt and the `children` lists are rewritten through
// the same table. Remapping child by child as the tree is walked would leave a parent
// pointing at an id that had not been drawn yet.
//
// WHAT IS COPIED VERBATIM: every component value, `objectref` values included. A copy of a
// bullet that pointed at the player still points at the player, which is the reading a
// creator expects. A reference that pointed INSIDE the copied subtree still points at the
// original subtree; remapping those would need the schema of every component to know which
// values are identities, and that is a decision this file does not take on its own
// (ADR-0056 §6).

import { createId } from './id.js';
import { restoreSubtree } from './rebuild.js';
import { serializeObject } from './serialize.js';

/**
 * Put a copy of an Object, and of everything under it, into the Scene that holds it.
 *
 * WHERE THE COPY LANDS: beside its model, last among its siblings. Beside, because
 * `Transform` is a position in the PARENT's space (ADR-0002) — a copy that joined the roots
 * would silently change coordinate space and appear somewhere the model never was. Last,
 * because appending is the one rank that is a function of the state rather than of a guess.
 *
 * NO OPERATION IS PRODUCED. It writes through `Scene`'s own primitives, which is what
 * ADR-0034 invariant 5 requires of anything a node can reach, and what makes a spawn a
 * simulation output rather than an authored intent (ADR-0003, ADR-0019).
 *
 * @param {object} scene - The Scene holding the model, and receiving the copy
 * @param {object} source - The Object to copy; must belong to `scene`
 * @param {object} [options] - Options
 * @param {string|null} [options.parent] - Parent id for the copy; the model's own by default
 * @param {number} [options.index] - Rank among its new siblings; appended when omitted
 * @returns {object|null} The copy, or null when there was nothing to copy
 */
export function duplicateObject(scene, source, { parent, index } = {}) {
    // A MODEL THAT IS NOT IN THIS SCENE IS NOT A MODEL. A detached Object, a handle to
    // something already destroyed, or nothing at all: all three answer null, and none of
    // them is a fault (ADR-0034 §3.4).
    if (!source?.id || !scene?.has?.(source)) return null;

    const originals = subtreeOf(source);
    const fresh = new globalThis.Map(originals.map(object => [object.id, createId()]));

    const written = originals.map(object => {
        const data = serializeObject(object);
        data.id = fresh.get(object.id);
        data.parent = fresh.get(data.parent) ?? null;
        data.children = data.children.map(id => fresh.get(id)).filter(Boolean);
        return data;
    });

    const [root, ...subtree] = written;
    const holder = parent === undefined ? source.parent?.id ?? null : parent;

    const restored = restoreSubtree(
        scene,
        { object: root, subtree, parent: holder, index: index ?? null },
        { registry: scene.registry }
    );

    return restored ? scene.get(root.id) ?? null : null;
}

/**
 * An Object and its descendants, the object first and depth first under it.
 *
 * The same walk `hierarchyOrder()` performs on a whole Scene, rooted at one object instead
 * of at the root list — and it is written here rather than reached for because a subtree is
 * not a scene, and `hierarchyOrder()` would answer with every object of the scene.
 *
 * @param {object} object - The root of the subtree
 * @returns {object[]} The objects, in canonical order
 */
function subtreeOf(object) {
    const ordered = [object];
    for (const child of object.children) ordered.push(...subtreeOf(child));
    return ordered;
}
