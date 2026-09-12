// A prefab: a reusable model of an Object, kept outside every Scene (ADR-0061).
//
// WHAT IT IS, IN ONE SENTENCE. A prefab is a Resource whose payload is a SERIALIZED SUBTREE
// — the very records `serializeObject()` writes and `restoreSubtree()` reads. It is not a
// third representation of an Object, not a special Scene, and not a class: the format
// already knows how to write an Object down and how to put one back, and inventing a second
// shape would be a second opinion about what an Object is made of.
//
//   Bullet.prefab   { version, root, objects: [ …serializeObject() ] }
//
// WHAT IT IS FOR. `Spawn` copies something the Scene already holds (core/duplicate.js),
// which forced every project to keep a hidden model of every bullet and every enemy parked
// off-screen — visible in the Hierarchy, simulated, collidable, and part of the saved scene.
// A prefab is the same model with none of that: it lives in the Project, it is used by
// several scenes, and instantiating it creates the FIRST instance rather than the second.
//
// IT IS NOT A LIVE LINK, AND THAT IS DELIBERATE (ADR-0061 §9). Instantiating a prefab
// produces ordinary Objects. Editing the prefab afterwards does not reach back into the
// instances, and an instance carries no memory of where it came from — there is no override,
// no revert, no "apply to prefab", and nothing in a saved scene that names a Resource it
// would break without. Unity's prefab system is a good product and it is a large one; what
// it needs first is a decision about what an override IS, and this tranche does not make it.
// A prefab here is a MODEL OF CREATION, not a system of inheritance.
//
// THE RUNTIME RESOLVES IT SYNCHRONOUSLY, AND THAT IS THE WHOLE ARCHITECTURAL CONSTRAINT
// (ADR-0061 §4). A Resource is read through asynchronous storage, and a `Runtime.step()` may
// not wait — so nothing here reaches storage and nothing here is `async`. Definitions are
// read BEFORE the simulation, by the layer that may (project/resources.js), and handed to
// the Runtime as a `ResourceRegistry`: a plain map that answers now. That registry used to
// be called `PrefabRegistry` and used to live here; it is one table for every definition
// kind now, because an animation needed the very same one (ADR-0062 §1).
//
// IDENTITIES ARE NEVER THE MODEL'S. A definition carries the ObjectIds the subtree had when
// it was authored, and they are remapped on every instantiation through the same table
// `duplicateObject()` draws (core/instantiate.js). Two instances of one prefab share no
// identity with each other and none with the definition.

import { createId } from './id.js';
import {
    declarationsFrom,
    describeSubtree,
    instantiateRecords,
    referencesObjects,
    subtreeOf
} from './instantiate.js';

/** Bumped when the shape below changes in a way an older reader cannot survive. */
export const PREFAB_FORMAT = 1;

/**
 * Write an Object and everything under it down as a reusable model.
 *
 * AN EXTERNAL REFERENCE IS CLEARED, AND THE CALLER IS TOLD WHICH (ADR-0061 §6). A property
 * of type `objectref` pointing at an Object OUTSIDE the subtree names something of SCENE
 * scope, and a prefab is of PROJECT scope: keeping it would write a dependency on one scene
 * into a Resource that several scenes use, and the identity would resolve to nothing — or,
 * far worse, to a different Object — in every scene but the one it was authored in. The
 * three honest answers were to refuse the prefab, to keep the identity, or to clear it; this
 * clears it, because refusing makes a common arrangement unauthorable and keeping it writes
 * a lie into the payload. What is reported is exactly what was cleared, so the Editor can
 * say so rather than let a creator discover it at run time.
 *
 * A REFERENCE POINTING INSIDE THE SUBTREE IS KEPT AS IT IS, and that is the same rule
 * `duplicateObject()` applies from the other end: an identity travels with the model exactly
 * when the model contains its target. It is rewritten at instantiation, not here, because
 * here there is nothing to rewrite it to.
 *
 * @param {object} object - The root of the subtree to model
 * @param {object} [options] - Options
 * @param {object} [options.registry] - ComponentRegistry resolving the types; the scene's by default
 * @param {object} [options.scene] - The Scene the object belongs to, for its registry
 * @returns {{definition: object, cleared: object[]}} The payload, and what was dropped
 */
export function createPrefab(object, { registry, scene } = {}) {
    if (!object?.id) throw new TypeError('createPrefab: an Object is required');

    const inside = new globalThis.Set(subtreeOf(object).map(entry => entry.id));
    const declares = declarationsFrom({ registry: registry ?? scene?.registry ?? object.scene?.registry ?? null });

    const cleared = [];
    const objects = describeSubtree(object).map((record, at) => ({
        ...record,
        // THE ROOT OF A PREFAB HAS NO PARENT, because a prefab has no scene to have one in.
        // Keeping the authored parent would name an Object that is not in the payload — the
        // very thing this function exists to refuse. Every other record keeps its link, which
        // points INSIDE the subtree by construction.
        parent: at === 0 ? null : record.parent,
        components: (record.components ?? []).map(entry => ({
            type: entry.type,
            values: detachValues(entry.values, declares(entry.type), inside, {
                onCleared: property => cleared.push({
                    object: record.name || record.id,
                    component: entry.type,
                    property: property.label ?? property.name
                })
            })
        }))
    }));

    return {
        definition: { version: PREFAB_FORMAT, root: objects[0].id, objects },
        cleared
    };
}

/**
 * The references that point out of a subtree, without writing anything.
 *
 * THE QUESTION THE EDITOR ASKS BEFORE IT ACTS, so a creator can be told what a prefab will
 * lose before they make one — the same list `createPrefab()` reports afterwards, reached
 * without producing a payload.
 *
 * @param {object} object - The root of the subtree
 * @param {object} [options] - `{ registry, scene }`
 * @returns {object[]} `{ object, component, property }` for each reference that leaves
 */
export function externalReferencesOf(object, options = {}) {
    return object?.id ? createPrefab(object, options).cleared : [];
}

/**
 * Build an instance of a prefab in a Scene.
 *
 * SYNCHRONOUS, AND IT TAKES THE DEFINITION RATHER THAN AN IDENTIFIER. Resolving a
 * `ResourceId` is storage, and storage is asynchronous (ADR-0020); a node that resolved one
 * inside a step would have to wait in the middle of a simulation. So the Runtime is handed
 * definitions that are already in memory, and this takes one of them.
 *
 * EVERY IDENTITY IS FRESH, through the very table `duplicateObject()` uses. Two instances of
 * one prefab therefore share nothing, and no identity of the MODEL ever reaches a Scene —
 * which is what makes a prefab usable twice in one scene and in fifty scenes at once.
 *
 * @param {object} scene - The Scene receiving the instance
 * @param {object} definition - A payload `createPrefab()` produced
 * @param {object} [options] - Options
 * @param {string|null} [options.parent] - Parent id for the instance; a root by default
 * @param {number} [options.index] - Rank among its new siblings; appended when omitted
 * @param {Function} [options.createId] - Mints one identity; `core/id.js`'s by default
 * @returns {object|null} The instance's root Object, or null when there was nothing to build
 */
export function instantiatePrefab(scene, definition, { parent = null, index, createId: mint = createId } = {}) {
    const records = recordsOf(definition);
    if (!records) return null;

    return instantiateRecords(scene, records, { parent, index, createId: mint });
}

/**
 * The records a definition holds, in the order they must be rebuilt, or null.
 *
 * A VERSION THIS BUILD DOES NOT KNOW IS FATAL ON ITS OWN, like a graph from an unknown
 * version (ADR-0027) and a bundle from one (preview/bundle.js): nothing below can be trusted
 * to mean what it says in a shape that has never been read. It answers null rather than
 * throwing, because a prefab that cannot be instantiated is a state of the running game and
 * the flow past a `Spawn` continues either way (ADR-0034 §3.4).
 *
 * @param {object} definition - The payload
 * @returns {object[]|null} The records, the root first
 */
export function recordsOf(definition) {
    if (!definition || definition.version !== PREFAB_FORMAT) return null;

    const objects = definition.objects;
    if (!globalThis.Array.isArray(objects) || objects.length === 0) return null;

    // THE ROOT IS NAMED, NOT ASSUMED TO BE FIRST — and it is first in everything this
    // repository writes. Naming it is what lets a payload survive an editor, a merge or a
    // hand edit that reordered the list, for the price of one `find`.
    const at = objects.findIndex(record => record.id === definition.root);
    if (at === -1) return null;

    return at === 0 ? objects : [objects[at], ...objects.filter((_, index) => index !== at)];
}

/**
 * One Component's values, with every reference that leaves the subtree emptied.
 *
 * @param {object} values - Serialized values
 * @param {object[]} declarations - What the type declares
 * @param {Set} inside - The ObjectIds the subtree holds
 * @param {object} options - `{ onCleared }`
 * @returns {object} The values to store in the definition
 */
function detachValues(values, declarations, inside, { onCleared }) {
    let detached = values;

    for (const property of declarations) {
        if (!values || !globalThis.Object.hasOwn(values, property.name)) continue;
        if (!referencesObjects(property)) continue;

        const value = values[property.name];
        const next = detachReference(value, inside);
        if (next === value) continue;

        if (detached === values) detached = { ...values };
        detached[property.name] = next;
        onCleared(property);
    }

    return detached;
}

/**
 * One value, with anything naming an Object outside the subtree removed.
 *
 * A LIST LOSES THE ENTRIES THAT LEAVE AND KEEPS THE ONES THAT DO NOT, rather than being
 * emptied: a turret naming its own two barrels and one distant target keeps the barrels.
 * `null` is what an emptied single reference becomes, because that is what "points at
 * nothing" already is in the format (ADR-0023).
 *
 * @param {any} value - What the component held
 * @param {Set} inside - The ObjectIds the subtree holds
 * @returns {any} The value to store, or the same value when nothing left
 */
function detachReference(value, inside) {
    if (globalThis.Array.isArray(value)) {
        const kept = value.filter(item => inside.has(item));
        return kept.length === value.length ? value : kept;
    }

    if (typeof value !== 'string' || value === '' || inside.has(value)) return value;
    return null;
}
