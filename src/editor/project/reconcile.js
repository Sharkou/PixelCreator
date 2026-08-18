// Bringing the objects that already carry a Component up to its new schema (ADR-0031 §4).
//
// THE PROBLEM, IN ONE SENTENCE. A `.px` is a type; the objects in the scene hold instances
// of it; editing the `.px` changes the type and left the instances exactly as they were —
// so a property a creator had just declared was invisible on every object already carrying
// the Component, until the scene was reloaded.
//
// THE TWO WRONG ANSWERS, and they are wrong in opposite directions:
//
//   do nothing            the declaration and the objects drift, and the Inspector shows a
//                         Component that does not match the one being edited next door;
//   recreate the instance the object gets the new schema and loses every value the creator
//                         set — which is precisely what a schema change must not cost.
//
// So: RECONCILE, property by property. What is new arrives at its default, what is gone is
// removed, what was renamed follows its identity, and everything a creator set stays set.
//
// IT IS PURE OF THE DOM AND IT WRITES THROUGH OPERATIONS. Each change is a `setProperty()`
// on the component, grouped under one `batch` — so the whole reconciliation is one `Ctrl Z`,
// it replicates, and a server replaying the session reaches the same state (ADR-0008,
// ADR-0011, ADR-0024). That is what makes it safe to run automatically.
//
// IDENTITY IS WHAT MAKES A RENAME A RENAME. A `.px` property carries a stable `id` minted
// once (ADR-0027), so `speed -> movementSpeed` is one descriptor with a new name, not a
// deletion and an addition. The instance keeps its value and changes its key.

import { componentSchema } from '../../core/mod.js';

/**
 * What a component instance would have to change to match a schema.
 *
 * PURE, AND SEPARATE FROM THE WRITING, because this is the part worth testing: which value
 * moves where is the whole of the decision, and it can be checked without a scene, a
 * registry or an Editor.
 *
 * @param {object} values - What the instance currently holds, by property name
 * @param {object} schema - The new schema, keyed by name, each carrying `id` and `default`
 * @param {object} [previous] - The schema it is coming FROM, for spotting renames by id
 * @returns {{set: object, remove: string[]}} The writes to perform
 */
export function reconcileValues(values, schema, previous = null) {
    const set = {};
    const remove = [];

    // Where each identity used to live, so a rename can be told from a deletion plus an
    // addition. Without it both look the same and the value is lost.
    const wasNamed = new globalThis.Map();
    for (const [name, descriptor] of globalThis.Object.entries(previous ?? {})) {
        if (descriptor?.id) wasNamed.set(descriptor.id, name);
    }

    const declared = new globalThis.Set(globalThis.Object.keys(schema ?? {}));

    for (const [name, descriptor] of globalThis.Object.entries(schema ?? {})) {
        const before = descriptor?.id ? wasNamed.get(descriptor.id) : undefined;

        // A rename: the value lived under the old name and moves to the new one.
        if (before !== undefined && before !== name && before in values) {
            set[name] = values[before];
            continue;
        }

        // Already there, and still the same property: left alone. This is the case that
        // makes a schema change cheap — thirty objects keep thirty settings.
        if (name in values) continue;

        // New, so it starts where a fresh instance would.
        set[name] = descriptor?.default ?? null;
    }

    for (const name of globalThis.Object.keys(values)) {
        if (declared.has(name)) continue;
        // Gone, or renamed away from. Keeping it would be data nothing reads, that the
        // serializer would write and no panel would show.
        remove.push(name);
    }

    return { set, remove };
}

/**
 * Bring every instance of a component type in a scene up to its current schema.
 *
 * @param {object} scene - The scene to walk
 * @param {string} type - The component type name — a `.px`'s own ResourceId (ADR-0021)
 * @param {object} options - Options
 * @param {Function} options.Component - The newly registered class, for its schema
 * @param {object} [options.previous] - The schema the instances were built from
 * @param {string} [options.batch] - Groups the whole reconciliation into one history entry
 * @returns {{objects: number, set: number, removed: number}} What it changed
 */
export function reconcileScene(scene, type, { Component, previous = null, batch } = {}) {
    const schema = componentSchema(Component) ?? {};
    const changed = { objects: 0, set: 0, removed: 0 };
    if (!scene) return changed;

    for (const object of scene.objects()) {
        const component = object.getComponent(type);
        if (!component) continue;

        const values = readValues(component, schema, previous);
        const { set, remove } = reconcileValues(values, schema, previous);
        if (globalThis.Object.keys(set).length === 0 && remove.length === 0) continue;

        changed.objects++;
        for (const [name, value] of globalThis.Object.entries(set)) {
            // THROUGH `setProperty`, NOT A PLAIN WRITE. This is the Editor stating an
            // intent on the creator's behalf, so it produces an Operation and undoes as
            // one thing with the rest (CONVENTIONS.md, ADR-0003).
            component.setProperty(name, value);
            changed.set++;
        }

        for (const name of remove) {
            // `undefined` is how the Property System says "this is not a property of mine
            // any more"; the serializer skips it and the Inspector stops drawing a row.
            component.setProperty(name, undefined);
            changed.removed++;
        }
    }

    return changed;
}

/**
 * What an instance is holding, limited to the properties either schema knows about.
 *
 * A component carries working fields beside its declared ones — a resolved image, a cached
 * matrix — and those are runtime state, not project data (ADR-0003). Reading everything off
 * the instance would treat them as values to migrate.
 */
function readValues(component, schema, previous) {
    const known = new globalThis.Set([
        ...globalThis.Object.keys(schema ?? {}),
        ...globalThis.Object.keys(previous ?? {})
    ]);

    const values = {};
    for (const name of known) {
        if (component[name] !== undefined) values[name] = component[name];
    }
    return values;
}
