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
// A REFERENCE THAT POINTED INSIDE THE SUBTREE FOLLOWS THE COPY; ONE THAT POINTED OUTSIDE
// DOES NOT (ADR-0056 §6). Duplicating a turret whose barrel names its own base must give a
// barrel naming the COPY's base — otherwise two turrets share one base and the second one is
// wired to the first. Duplicating a bullet that names the player must still name the player,
// because the player was never copied. The two cases are one rule: an identity is rewritten
// exactly when it is in the table of identities this duplication drew.
//
// THE RULE IS ASKED OF THE SCHEMA, NEVER OF THE VALUE. What is rewritten is a property whose
// DECLARED type is `objectref`, or a list whose declared element type is — nothing else is
// looked at. A string that merely looks like an identifier is a string (ADR-0023: the type
// is what a value MEANS), and scanning values for things shaped like ids would rewrite a
// player's name the day someone called their level `abcdefghjkmnpq`.

import { createId } from './id.js';
import { declaredProperties } from './definition.js';
import { PropertyType, elementOf } from './properties/types.js';
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

    // THE WHOLE TABLE IS DRAWN BEFORE A SINGLE FIELD IS REWRITTEN, and that is what makes
    // the rewrite independent of the order anything is walked, restored or linked in. A
    // parent naming a child, a child naming its parent, two siblings naming each other and a
    // cycle between two Components are all the same lookup in a table that is already
    // complete — there is no pass that could reach a reference before its target had an
    // identity, because no identity is drawn during the pass.
    const originals = subtreeOf(source);
    const fresh = new globalThis.Map(originals.map(object => [object.id, createId()]));

    const declarations = new globalThis.Map();
    const written = originals.map(object => {
        const data = serializeObject(object);
        data.id = fresh.get(object.id);
        data.parent = fresh.get(data.parent) ?? null;
        data.children = data.children.map(id => fresh.get(id)).filter(Boolean);
        data.components = data.components.map(entry => ({
            type: entry.type,
            values: remapValues(entry.values, declaredBy(scene, entry.type, declarations), fresh)
        }));
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
 * What a Component type declares, read once per type per duplication.
 *
 * THE CANONICAL READER, NOT A SECOND ONE. `declaredProperties()` is what the graph, the
 * property picker and the Inspector already ask, and it answers for a hand-written class
 * (`static schema`) and for a `.px` (its definition's `properties`) with one call — which is
 * exactly why a `.px` needs no special case here.
 *
 * A TYPE THE REGISTRY CANNOT RESOLVE DECLARES NOTHING, and its values are therefore carried
 * verbatim. That is the same answer `MissingComponent` gives everywhere else: a placeholder
 * keeps every value byte for byte precisely because nothing can interpret them (ADR-0021),
 * and guessing which of them are identities would be the heuristic this file refuses.
 *
 * @param {object} scene - The Scene whose registry resolves the type
 * @param {string} type - The Component type name
 * @param {Map} cache - Per-duplication memo, so a type is read once for a whole subtree
 * @returns {object[]} The property descriptors, possibly empty
 */
function declaredBy(scene, type, cache) {
    if (cache.has(type)) return cache.get(type);

    const Component = scene.registry?.get?.(type) ?? null;
    const declared = Component ? declaredProperties(Component) : [];
    cache.set(type, declared);
    return declared;
}

/**
 * One Component's serialized values, with the references into this subtree redirected.
 *
 * Returns the values it was given when nothing changed, so a component that declares no
 * reference — which is nearly all of them — costs one loop over its declarations and no
 * allocation.
 *
 * @param {object} values - Serialized values, as `serializeComponent()` wrote them
 * @param {object[]} declarations - What the type declares
 * @param {Map} fresh - old ObjectId -> new ObjectId, for this subtree
 * @returns {object} The values to restore from
 */
function remapValues(values, declarations, fresh) {
    let remapped = values;

    for (const property of declarations) {
        if (!values || !globalThis.Object.hasOwn(values, property.name)) continue;

        const value = values[property.name];
        const next = remapReference(property, value, fresh);
        if (next === value) continue;

        if (remapped === values) remapped = { ...values };
        remapped[property.name] = next;
    }

    return remapped;
}

/**
 * One value, redirected if its declaration says it is an identity and the table holds it.
 *
 * FOUR ANSWERS, AND THREE OF THEM ARE "LEAVE IT ALONE":
 *
 *   inside the subtree   the copy's identity — the reference follows the copy
 *   outside it           unchanged, because the target was never copied
 *   `null` or absent     unchanged; nothing is not a reference to anything
 *   pointing at nothing  unchanged, because a dead reference is a state of the scene and
 *                        not a thing to repair (ADR-0034 §3.4) — and it is indistinguishable
 *                        from an external one here, which is the honest reading: this
 *                        function knows what was copied, never what exists
 *
 * A LIST IS THE SAME RULE ONE LEVEL DOWN, and one level is as far as it goes: `elementOf()`
 * refuses an element that is itself a list (ADR-0031 §3), so `array<objectref>` is the
 * deepest shape a declaration can reach and there is nothing below it to recurse into. The
 * list is rebuilt rather than written through — the array `serializeObject()` handed over is
 * the one the MODEL holds, and writing into it would edit the original (invariant 8).
 *
 * @param {object} property - The declared property descriptor
 * @param {any} value - What the component held
 * @param {Map} fresh - old ObjectId -> new ObjectId
 * @returns {any} The value to store on the copy
 */
function remapReference(property, value, fresh) {
    if (property.type === PropertyType.OBJECTREF) return fresh.get(value) ?? value;

    if (elementOf(property)?.type === PropertyType.OBJECTREF && globalThis.Array.isArray(value)) {
        return value.some(item => fresh.has(item)) ? value.map(item => fresh.get(item) ?? item) : value;
    }

    return value;
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
