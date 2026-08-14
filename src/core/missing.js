// MissingComponent — what a Component of an unknown type deserializes into (ADR-0021).
//
// Losing a whole scene because one definition file is absent is the worst behaviour an
// editor can have. A creator who deletes a `.pxc` by accident, or opens a project whose
// component resources have not loaded yet, must still get their scene back.
//
// So an unknown type does not throw. It produces a placeholder that:
//
//   - keeps its type name, so the slot is still identified;
//   - keeps every serialized value, byte for byte, so restoring the definition restores
//     the project intact;
//   - keeps its rank in the ordered collection (ADR-0018);
//   - never runs — no `update`, no `draw`, nothing for the runtime to call;
//   - says what it is, so the Inspector can show it rather than pretend.
//
// It is NOT a second kind of Component. It is an ordinary duck-typed component whose only
// peculiarity is that it carries data it cannot interpret.

/** Type name -> its placeholder class, so one missing type is one class. */
const CLASSES = new globalThis.Map();

/**
 * Build a placeholder for a component type nothing can resolve.
 *
 * @param {string} type - The type name that was not found
 * @param {object} [values] - The serialized values to preserve
 * @returns {object} The placeholder instance
 */
export function missingComponent(type, values = {}) {
    const component = new (missingClass(type))();
    for (const [key, value] of globalThis.Object.entries(values ?? {})) {
        component[key] = value;
    }
    return component;
}

/**
 * The placeholder class for a type name, created once.
 * @param {string} type - The type name
 * @returns {Function} The class
 */
export function missingClass(type) {
    const cached = CLASSES.get(type);
    if (cached) return cached;

    // `static type` is what keys the component (ADR-0004), so the placeholder occupies
    // exactly the slot the real component would have — and serializing it writes the
    // same type name back out.
    const Missing = class {
        static type = type;
        static missing = true;
        static label = type;
        static icon = 'warning';
        static category = 'Missing';
    };

    globalThis.Object.defineProperty(Missing, 'name', { value: `Missing(${type})` });
    CLASSES.set(type, Missing);
    return Missing;
}

/**
 * Tell whether a component is a placeholder for a type that could not be resolved.
 * @param {Function|object} component - A component class or instance
 * @returns {boolean} True when it is a placeholder
 */
export function isMissingComponent(component) {
    const ctor = typeof component === 'function' ? component : component?.constructor;
    return ctor?.missing === true;
}
