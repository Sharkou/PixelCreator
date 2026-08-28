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
// AND IT BINDS THE OTHER HALF OF THE `.px` (ADR-0015, ADR-0016). A Component is properties
// AND behaviour, and this used to install only the first: the type appeared in Add
// Component, an object carried it, and the graph a creator had just wired ran nowhere,
// because nothing in the live Editor ever called `behaviors.bind()`. `project/graphs.js`
// already pairs `defineComponent()` with it for a headless load; the same pairing belongs
// here, for a session where the payload comes from a model being edited rather than from
// the store. The `behaviors` host is PASSED IN and never imported, exactly as that module
// requires — the shell owns both objects and hands one to the other.
//
// AND IT RECONCILES WHAT IS ALREADY IN THE SCENE (ADR-0031 §4). Re-installing swaps the
// class the registry hands out, which only helps the NEXT instance; the objects already
// carrying the old one used to keep it until the scene was reloaded. So installing now
// walks the scene and brings each instance up to the new schema — new properties at their
// default, removed ones dropped, renamed ones following their identity, and every value a
// creator set left exactly where it was. `reconcile.js` decides what moves; this decides
// when.

import { createId, defineComponent } from '../../core/mod.js';
import { ResourceKind, bindGraph } from '../../project/mod.js';
import { reconcileScene } from './reconcile.js';

/**
 * Install `.px` definitions into a component registry, on demand.
 *
 * @param {object} context - What it works on
 * @param {object} context.project - The project the definitions live in
 * @param {object} context.registry - The ComponentRegistry to fill
 * @param {object} [context.workspace] - Consulted first, so an OPEN `.px` installs the
 *   model being edited rather than the payload last written to the store
 * @param {object} [context.scene] - The open scene, whose instances are reconciled
 * @param {object} [context.behaviors] - The runtime's Behaviors host, when there is one
 * @returns {{install: Function, refresh: Function, types: Function}} The installer
 */
export function createDefinitions({ project, registry, workspace = null, scene = null, behaviors = null }) {
    /** ResourceId -> the revision the registered class was built from. */
    const installed = new globalThis.Map();

    /** The `.px` models being followed, so a schema edit reaches the objects carrying it. */
    const watched = new globalThis.Set();

    /**
     * ResourceId -> the LIVE schema record its class was built with (ADR-0031 §4).
     *
     * ONE CLASS PER TYPE, FOR THE SESSION. Registering a NEW class on every edit was the
     * subtle half of the migration problem: an instance carries its class, and
     * `componentSchema(instance)` reads `instance.constructor.schema` — so the objects
     * already in the scene went on declaring the old schema while their values had already
     * been reconciled. The Inspector wrote a value and then drew no row for it.
     *
     * `defineComponent()` closes over the properties record it is given AND exposes it as
     * `static schema`, so mutating that one record in place updates both what a new
     * instance is built with and what an old instance reports. Same reference, so nothing
     * has to be kept in step.
     *
     * The identity of a type IS its ResourceId (ADR-0021); two classes for one type was
     * always the anomaly.
     */
    const schemas = new globalThis.Map();

    /**
     * The operations that change what a Component IS, rather than what its graph does.
     *
     * A node moving is an edit of the `.px` and changes no instance; declaring a property
     * changes every object carrying one. Re-registering a class on every graph nudge would
     * rebuild it sixty times during a drag, so the filter is the point.
     */
    const changesSchema = operation => operation.type === 'ADD_PROPERTY'
        || operation.type === 'REMOVE_PROPERTY'
        || (operation.type === 'SET_PROPERTY'
            && ['name', 'type', 'default', 'values', 'of'].includes(operation.prop));

    /**
     * Follow a `.px` being edited, so its instances keep up (ADR-0031 §4).
     *
     * WITHOUT THIS THE RECONCILIATION NEVER RUNS. `install()` is called when something asks
     * to USE a definition — the Add Component menu, a drop — and a creator declaring a
     * property is doing neither. So the model announces, and this re-installs; the scene
     * catches up on the same microtask, which is what makes declaring a property visible on
     * the objects that already carry the Component.
     *
     * @param {string} id - The `.px` resource
     * @param {object} model - Its live ComponentDefinition
     */
    function watch(id, model) {
        if (!model || watched.has(id)) return;
        watched.add(id);

        model.operations.on('operation', operation => {
            if (!changesSchema(operation)) return;
            // On a microtask: a type change is two writes under one batch (ADR-0027), and
            // rebuilding between them would install a schema that existed for no one.
            globalThis.queueMicrotask(() => install(id));
        });
    }

    // AND THE MODEL IS FOLLOWED THE MOMENT IT EXISTS, NOT ONLY WHEN SOMETHING INSTALLS.
    //
    // `install()` could only arm the watch above with a model in hand, and the order the
    // Editor actually produces is the other one: `Add Component ▸ Custom Component` creates
    // the `.px`, installs it and attaches it to an Object while nothing is open — so there
    // was no model — and the creator opens the file afterwards to declare its properties.
    // Nothing was watching by then, so the Objects already carrying the Component kept the
    // empty schema: the Inspector drew "No properties", and an `objectref` socket declared
    // this way could never be pointed at an Object at all (ADR-0031 §4).
    //
    // The Workspace announces a model the moment it makes one — attached or open, since a
    // `.px`'s properties are edited from a selection as well as from its canvas — and the
    // watch is idempotent, so a `.px` attached twice is followed once.
    workspace?.on?.('attached', ({ resource, model }) => {
        if (resource?.kind === ResourceKind.COMPONENT) watch(resource.id, model);
    });

    /**
     * Register the type a `.px` declares, and answer its name.
     *
     * @param {string} id - The `.px` resource's identifier
     * @param {object} [options] - Options
     * @param {boolean} [options.reconcile] - Bring the scene's instances up to the new
     *   schema; true by default, and false only for a first install with nothing to fix
     * @returns {Promise<string|null>} The component type name, or null when it is not one
     */
    async function install(id, { reconcile = true } = {}) {
        const resource = project.get(id);
        if (!resource || resource.kind !== ResourceKind.COMPONENT) return null;

        const revision = resource.revision ?? 0;
        // A model being edited is ahead of the store: a creator who declares a property
        // and drops the `.px` on an object expects the property to be there.
        const attached = workspace?.attached?.(id) ?? null;
        if (!attached && installed.get(id) === revision && registry.has(id)) return id;

        const definition = attached ? attached.serialize() : await project.read(id);
        if (!definition) return null;

        // The schema the instances in the scene were built from, read BEFORE the registry
        // is overwritten — it is what tells a rename from a deletion plus an addition.
        // The schema the instances in the scene were built from, COPIED before the live
        // record is rewritten — it is what tells a rename from a deletion plus an addition,
        // and it is about to be mutated out from under us.
        const live = schemas.get(id) ?? null;
        const before = live ? { ...live } : null;
        if (attached) watch(id, attached);

        const properties = definition.properties ?? {};
        let Component = registry.has(id) ? registry.get(id) : null;

        if (live && Component) {
            // Mutated, not replaced: same record, same class, same instances.
            for (const name of globalThis.Object.keys(live)) delete live[name];
            globalThis.Object.assign(live, properties);
            Component.label = definition.label || id;
            Component.definition = definition;
        } else {
            const record = { ...properties };
            schemas.set(id, record);
            Component = defineComponent({ ...definition, type: id, properties: record });
            registry.register(Component, { replace: true });
        }

        installed.set(id, revision);

        // THE BEHAVIOUR, BOUND WITH THE SCHEMA. A graph is data to the Core and to the
        // Project, and a value to the Runtime: `bindGraph()` reads the one the class now
        // carries and hands it over (project/graphs.js). It is a fresh payload on every
        // pass, so `Behaviors` sees a new identity and replaces the running behaviour on
        // the next step, which is the invalidation ADR-0016 §7 describes.
        if (behaviors) await bindGraph(project, Component, behaviors);

        // ONE BATCH FOR THE WHOLE RECONCILIATION, so a creator who did not like what
        // declaring a property did to their scene takes it back in one gesture.
        if (reconcile && before && scene) {
            reconcileScene(scene, id, { Component, previous: before, batch: createId() });
        }

        return id;
    }

    /**
     * Re-read every installed `.px`, so what runs is what is on screen.
     *
     * WHY IT EXISTS AT ALL, AND WHY IT IS NOT AN OBSERVER. `install()` runs when something
     * asks to USE a definition, and again when an edit changes its SCHEMA — moving a node
     * or drawing a wire is neither, deliberately, because re-registering a class on every
     * nudge of a drag would rebuild it sixty times a second. So a graph edited after the
     * type was installed leaves the bound behaviour behind, and the only moment that
     * matters is the one where the simulation is about to run it.
     *
     * A MODEL BEING EDITED WINS OVER THE STORE, through `install()`'s own rule: a creator
     * who wires a graph and presses Play expects THAT graph to run, saved or not.
     *
     * @returns {Promise<string[]>} The types that were re-read, in installation order
     */
    async function refresh() {
        const ids = types();
        for (const id of ids) await install(id);
        return ids;
    }

    /** The `.px` types installed in this session, in installation order. */
    function types() {
        return [...installed.keys()];
    }

    return { install, refresh, types };
}
