// Putting a described subtree into a Scene, with identities of its own.
//
// ONE PIECE OF MACHINERY, TWO CALLERS, AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
// `duplicateObject()` copies something the Scene already holds; `instantiatePrefab()` builds
// something the Scene has never seen (ADR-0061 §7). They differ in where the DESCRIPTION
// comes from and in nothing else: both draw fresh identities for a whole subtree at once,
// both rewrite the references that pointed inside it, and both hand the result to
// `restoreSubtree()`. Writing that twice is how the two would come to disagree about what an
// `objectref` is the day a third caller appears.
//
// A DESCRIPTION IS WHAT `serializeObject()` WROTE. There is no third representation of an
// Object: a live one, and the records the format already defines (ADR-0061 §3). That is what
// makes a prefab the same payload as a duplication, an undo of a deletion and a saved scene.
//
// EVERY IDENTITY IS FRESH, AND THE WHOLE SUBTREE IS REMAPPED TOGETHER. The ids are drawn
// before anything is rebuilt and the `children` lists are rewritten through the same table.
// Remapping child by child as the tree is walked would leave a parent pointing at an id that
// had not been drawn yet — and a parent naming a child, a child naming its parent, two
// siblings naming each other and a cycle between two Components are all the same lookup in a
// table that is already complete.
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
 * An Object and its descendants, the object first and depth first under it.
 *
 * The same walk `hierarchyOrder()` performs on a whole Scene, rooted at one object instead
 * of at the root list — and it is written here rather than reached for because a subtree is
 * not a scene, and `hierarchyOrder()` would answer with every object of the scene.
 *
 * @param {object} object - The root of the subtree
 * @returns {object[]} The objects, in canonical order
 */
export function subtreeOf(object) {
    const ordered = [object];
    for (const child of object.children) ordered.push(...subtreeOf(child));
    return ordered;
}

/**
 * A subtree, written down the way the format already writes one.
 *
 * @param {object} object - The root of the subtree
 * @returns {object[]} The records, the root first
 */
export function describeSubtree(object) {
    return subtreeOf(object).map(serializeObject);
}

/**
 * Put described Objects into a Scene, with fresh identities and their links rewritten.
 *
 * WHO MINTS THE IDENTITIES IS THE CALLER'S BUSINESS (ADR-0057 §3). Instantiating from the
 * Editor is an authoring act and draws from the platform CSPRNG like every other identity;
 * instantiating from a graph is a CONSEQUENCE OF A STEP, and a server and a client running
 * that step have to agree on what was created — so the Runtime passes its own seeded source.
 * The Core does not choose between the two and does not learn what a simulation is: it takes
 * a factory and defaults to the ordinary one.
 *
 * NO OPERATION IS PRODUCED. It writes through `Scene`'s own primitives, which is what
 * ADR-0034 invariant 5 requires of anything a node can reach, and what makes a spawn a
 * simulation output rather than an authored intent (ADR-0003, ADR-0019).
 *
 * @param {object} scene - The Scene receiving them
 * @param {object[]} records - Serialized objects, the root first, as `describeSubtree()` wrote
 * @param {object} [options] - Options
 * @param {string|null} [options.parent] - Parent id for the root; a root of the scene by default
 * @param {number} [options.index] - Rank among its new siblings; appended when omitted
 * @param {Function} [options.createId] - Mints one identity; `core/id.js`'s by default
 * @param {Function} [options.declarationsFor] - (type) => property descriptors
 * @returns {object|null} The new root Object, or null when there was nothing to build
 */
export function instantiateRecords(scene, records, {
    parent = null,
    index,
    createId: mint = createId,
    declarationsFor
} = {}) {
    const written = freshRecords(records, {
        createId: mint,
        declarationsFor: declarationsFor ?? declarationsFrom(scene)
    });
    if (!scene || !written) return null;

    const [root, ...subtree] = written;
    const restored = restoreSubtree(
        scene,
        { object: root, subtree, parent, index: index ?? null },
        { registry: scene.registry }
    );

    return restored ? scene.get(root.id) ?? null : null;
}

/**
 * The same records, with every identity drawn again and every internal link rewritten.
 *
 * SPLIT OUT BECAUSE TWO CALLERS WANT DIFFERENT ENDINGS, and only the ending differs. A
 * Runtime writes straight into the Scene — a spawn is a simulation OUTPUT and produces no
 * Operation (ADR-0034 invariant 5). The Editor placing a prefab is an authored INTENT, so it
 * submits an `ADD_OBJECT` carrying the very same records and lets the pipeline apply them —
 * which is what makes the placement undoable and replicable (ADR-0019, ADR-0024). Remapping
 * twice, once for each, is how the two would come to disagree.
 *
 * @param {object[]} records - Serialized objects, the root first
 * @param {object} [options] - Options
 * @param {Function} [options.createId] - Mints one identity
 * @param {Function} [options.declarationsFor] - (type) => property descriptors
 * @returns {object[]|null} The rewritten records, the root first, or null when there are none
 */
export function freshRecords(records, { createId: mint = createId, declarationsFor } = {}) {
    if (!globalThis.Array.isArray(records) || records.length === 0) return null;
    if (!records[0]?.id) return null;

    const declares = declarationsFor ?? (() => []);
    const fresh = new globalThis.Map(records.map(record => [record.id, mint()]));

    return records.map(record => ({
        ...record,
        id: fresh.get(record.id),
        parent: fresh.get(record.parent) ?? null,
        children: (record.children ?? []).map(id => fresh.get(id)).filter(Boolean),
        components: (record.components ?? []).map(entry => ({
            type: entry.type,
            values: remapValues(entry.values, declares(entry.type), fresh)
        }))
    }));
}

/**
 * What a Component type declares, read once per type per instantiation.
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
 * @param {object} scene - The Scene, or anything carrying a `registry`
 * @returns {Function} (type) => the property descriptors, memoised
 */
export function declarationsFrom(scene) {
    const cache = new globalThis.Map();

    return type => {
        if (cache.has(type)) return cache.get(type);

        const Component = scene?.registry?.get?.(type) ?? null;
        const declared = Component ? declaredProperties(Component) : [];
        cache.set(type, declared);
        return declared;
    };
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
export function remapValues(values, declarations, fresh) {
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
export function remapReference(property, value, fresh) {
    if (property.type === PropertyType.OBJECTREF) return fresh.get(value) ?? value;

    if (elementOf(property)?.type === PropertyType.OBJECTREF && globalThis.Array.isArray(value)) {
        return value.some(item => fresh.has(item)) ? value.map(item => fresh.get(item) ?? item) : value;
    }

    return value;
}

/**
 * Whether a declared property carries an ObjectId, alone or in a list.
 *
 * Asked by `createPrefab()`, which has to find the references that point OUT of a subtree —
 * the mirror image of the question this file otherwise answers (ADR-0061 §6).
 *
 * @param {object} property - The declared property descriptor
 * @returns {boolean} True when the value is one or more ObjectIds
 */
export function referencesObjects(property) {
    return property?.type === PropertyType.OBJECTREF
        || elementOf(property)?.type === PropertyType.OBJECTREF;
}
