// Making a `.px` an attachable Component type, in an Editor session.
//
// THE PRIMITIVE EXISTED AND NOTHING CALLED IT. `project/graphs.js` already answers "who
// turns a definition into a type" — the Project layer reads the payload, the Core's
// `defineComponent()` turns it into an ordinary class, and the caller registers it. What
// was missing was the caller: the Editor created `.px` resources and never installed one,
// so a Component a creator had just written did not appear in Add Component and could not
// be dropped onto an object. It was a file with nowhere to go.
//
// ON DEMAND, NOT ON A SCHEDULE. Installing every `.px` at start-up would read the whole
// project before the first frame; installing on every edit would rebuild a class on each
// keystroke of a property rename. So a definition is installed when something asks to USE
// it — the Add Component menu, a drop onto an object — and re-installed when the resource
// it came from has changed since. `revision` is exactly the signal ADR-0020 keeps for that.
//
// THE IDENTITY IS THE RESOURCE (ADR-0021). A `.px`'s `type` is its own ResourceId, so
// installing twice is idempotent and `replace: true` is a reload rather than a collision —
// the guard exists to catch two unrelated classes claiming one name, which cannot happen
// when the name is an identity nobody else can mint (ADR-0016 §6).
//
// WHAT THIS DELIBERATELY DOES NOT DO: migrate instances. Re-installing swaps the class the
// registry hands out, so objects that already carry the old one keep it until the scene is
// reloaded. Deciding what a schema change means for a live instance — drop the value, keep
// it, coerce it — is a real question and it is not this module's to answer.

import { defineComponent } from '../../core/mod.js';
import { ResourceKind } from '../../project/mod.js';

/**
 * Install `.px` definitions into a component registry, on demand.
 *
 * @param {object} context - What it works on
 * @param {object} context.project - The project the definitions live in
 * @param {object} context.registry - The ComponentRegistry to fill
 * @param {object} [context.workspace] - Consulted first, so an OPEN `.px` installs the
 *   model being edited rather than the payload last written to the store
 * @returns {{install: Function, types: Function}} The installer
 */
export function createDefinitions({ project, registry, workspace = null }) {
    /** ResourceId -> the revision the registered class was built from. */
    const installed = new globalThis.Map();

    /**
     * Register the type a `.px` declares, and answer its name.
     *
     * @param {string} id - The `.px` resource's identifier
     * @returns {Promise<string|null>} The component type name, or null when it is not one
     */
    async function install(id) {
        const resource = project.get(id);
        if (!resource || resource.kind !== ResourceKind.COMPONENT) return null;

        const revision = resource.revision ?? 0;
        // A model being edited is ahead of the store: a creator who declares a property
        // and drops the `.px` on an object expects the property to be there.
        const attached = workspace?.attached?.(id) ?? null;
        if (!attached && installed.get(id) === revision && registry.has(id)) return id;

        const definition = attached ? attached.serialize() : await project.read(id);
        if (!definition) return null;

        registry.register(defineComponent({ ...definition, type: id }), { replace: true });
        installed.set(id, revision);
        return id;
    }

    /** The `.px` types installed in this session, in installation order. */
    function types() {
        return [...installed.keys()];
    }

    return { install, types };
}
