// Copying an Object that is already in a Scene, back into that same Scene.
//
// THIS IS ONE OF THE TWO THINGS `Spawn` CAN INSTANTIATE, AND IT IS NOT THE PREFAB. A live
// Object is a complete description of an instance — its components, its values, its
// children, its order — so a copy is made from a model that is already there, and no second
// model of what an Object is has to be invented (ADR-0056). The other one is a Resource, and
// it is resolved before the simulation starts rather than inside a step (ADR-0061 §4):
// `core/prefab.js`, which shares every line of the machinery below through
// `core/instantiate.js`.
//
// IT IS A ROUND TRIP THROUGH THE FORMAT, DELIBERATELY. `serializeObject()` already knows
// exactly which fields belong to an Object and `restoreSubtree()` already knows how to put
// one back — links, ranks and all, because that is what undoing a deletion runs. A bespoke
// walk would be a SECOND opinion about what an Object is made of, and it would drift the
// first time a field is added to one. Legacy had that second opinion and it was called
// `copy()`: it walked the write-only `$prop` accessors and wiped `components`, `childs` and
// `image` to undefined (core/serialize.js).
//
// A REFERENCE THAT POINTED INSIDE THE SUBTREE FOLLOWS THE COPY; ONE THAT POINTED OUTSIDE
// DOES NOT (ADR-0056 §6). Duplicating a turret whose barrel names its own base must give a
// barrel naming the COPY's base — otherwise two turrets share one base and the second one is
// wired to the first. Duplicating a bullet that names the player must still name the player,
// because the player was never copied. The two cases are one rule: an identity is rewritten
// exactly when it is in the table of identities this duplication drew.
//
// AND IT IS THE ONE PLACE A PREFAB ANSWERS DIFFERENTLY. A prefab LEAVES the scene, so a
// reference pointing outside its subtree names an Object the prefab may be instantiated
// without — which is why `createPrefab()` clears it at authoring time and says so, rather
// than writing a dependency on one scene into a project-scoped Resource (ADR-0061 §6).

import { createId } from './id.js';
import { describeSubtree, instantiateRecords } from './instantiate.js';

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
 * WHO MINTS THE IDENTITIES IS THE CALLER'S BUSINESS (ADR-0057 §3). Duplicating from the
 * Editor is an authoring act and draws from the platform CSPRNG like every other identity;
 * duplicating from a graph is a CONSEQUENCE OF A STEP, and a server and a client running that
 * step have to agree on what was created — so the Runtime passes its own seeded source. The
 * Core does not choose between the two and does not learn what a simulation is: it takes a
 * factory and defaults to the ordinary one.
 *
 * @param {object} scene - The Scene holding the model, and receiving the copy
 * @param {object} source - The Object to copy; must belong to `scene`
 * @param {object} [options] - Options
 * @param {string|null} [options.parent] - Parent id for the copy; the model's own by default
 * @param {number} [options.index] - Rank among its new siblings; appended when omitted
 * @param {Function} [options.createId] - Mints one identity; `core/id.js`'s by default
 * @returns {object|null} The copy, or null when there was nothing to copy
 */
export function duplicateObject(scene, source, { parent, index, createId: mint = createId } = {}) {
    // A MODEL THAT IS NOT IN THIS SCENE IS NOT A MODEL. A detached Object, a handle to
    // something already destroyed, or nothing at all: all three answer null, and none of
    // them is a fault (ADR-0034 §3.4).
    if (!source?.id || !scene?.has?.(source)) return null;

    return instantiateRecords(scene, describeSubtree(source), {
        parent: parent === undefined ? source.parent?.id ?? null : parent,
        index,
        createId: mint
    });
}
