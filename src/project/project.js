// Project — the manifest, and the pipeline its mutations travel through (ADR-0020).
//
// A project is a name, an identity, and an ordered list of Resources. Nothing else: the
// payloads live in the ResourceStore and are read by identifier, on demand.
//
// A SECOND PIPELINE, NOT A SECOND SYSTEM. Creating a resource is not a mutation of a
// scene, and a scene pipeline's `resolve` looks identifiers up among its Objects — it
// cannot resolve a resource. So the project owns an `Operations` of its own: same class,
// same contract, same anti-echo, a different `resolve`. That is the same machine
// instantiated twice, exactly as a detached Object already instantiates its own
// (core/object.js), and it is what gives resource edits replication and undo for free.
//
// WHAT A PROJECT IS NOT. It is not the Editor: no selection, no open tabs, no view state.
// Which tabs were open belongs to a workspace — a throwaway artefact whose loss costs
// nothing — and never to the project (ADR-0017, ADR-0020).
//
// LAYERING. This module imports the Core and nothing else. Not the DOM, not the Runtime,
// not the Editor: a headless server has to load the same project as a browser, which is
// what ADR-0011 requires of an authoritative server, and what putting loading inside the
// Editor would have made impossible.

import {
    Operations,
    OperationType,
    Origin,
    addResourceOperation,
    applyProperty,
    moveResourceOperation,
    createId,
    makeReactive,
    removeResourceOperation,
    setPropertyOperation
} from '../core/mod.js';
import { ResourceKind, createResource } from './resource.js';
import { canMove, descendantsOf, uniqueResourceName } from './folders.js';
import { MemoryResourceStore } from './store.js';

/**
 * Bumped when the manifest shape changes.
 *
 * 2: `path` — an indicative string — became `parent`, a link to a folder Resource, and
 * every entry carries `created` / `modified` (ADR-0025). No migration is written: there
 * are no format-1 projects to preserve (ARCHITECTURE.md §10).
 */
export const MANIFEST_VERSION = 2;

export class Project {

    #id;
    #name;
    #store;
    #operations;

    /** ResourceId -> the reactive manifest entry, in manifest order. */
    #resources = new Map();

    /**
     * Create a project.
     * @param {string} [name] - Display name
     * @param {object} [options] - Options
     * @param {string} [options.id] - Existing identifier, used when loading
     * @param {object} [options.store] - Where payloads live; in memory by default
     * @param {object} [options.authority] - Object exposing check(operation) => decision
     */
    constructor(name = '', { id, store = new MemoryResourceStore(), authority } = {}) {
        this.#id = id ?? createId();
        this.#name = name;
        this.#store = store;
        this.#operations = new Operations({
            authority,
            resolve: target => this.#resources.get(target.object) ?? null
        });

        this.#registerHandlers();
    }

    get id() {
        return this.#id;
    }

    get name() {
        return this.#name;
    }

    set name(name) {
        this.#name = name;
    }

    /**
     * The store payloads are read from and written to.
     * @returns {object} The store
     */
    get store() {
        return this.#store;
    }

    /**
     * The pipeline every manifest mutation travels through.
     * @returns {Operations} The pipeline
     */
    get operations() {
        return this.#operations;
    }

    /**
     * The manifest entries, in order, optionally of one kind.
     * @param {string} [kind] - One of ResourceKind
     * @returns {object[]} The entries
     */
    resources(kind) {
        const all = [...this.#resources.values()];
        return kind ? all.filter(resource => resource.kind === kind) : all;
    }

    /**
     * Look a manifest entry up.
     * @param {string} id - The ResourceId
     * @returns {object|null} The entry, or null
     */
    get(id) {
        return this.#resources.get(id) ?? null;
    }

    /**
     * Tell whether the project declares a resource.
     * @param {string} id - The ResourceId
     * @returns {boolean} True when declared
     */
    has(id) {
        return this.#resources.has(id);
    }

    /**
     * Read a resource's payload.
     *
     * Lazy and by identifier: opening a project reads the manifest, never the payloads.
     *
     * @param {string} id - The ResourceId
     * @returns {Promise<any>|any} The payload, or null
     */
    read(id) {
        return this.#store.read(id);
    }

    /**
     * The resources a folder holds, in manifest order.
     * @param {string|null} [parent] - The folder's id, or null for the top level
     * @returns {object[]} The entries
     */
    children(parent = null) {
        return this.resources().filter(resource => (resource.parent ?? null) === (parent ?? null));
    }

    /**
     * Declare a resource and store its payload, as one ADD_RESOURCE operation.
     *
     * @param {object} spec - The resource, as createResource() takes it
     * @param {any} [payload] - Its content
     * @param {object} [options] - Options
     * @param {number} [options.index] - Rank in the manifest
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object|null} The manifest entry, or null when refused
     */
    add(spec, payload = null, { index, actor, batch } = {}) {
        const resource = spec.id && spec.kind && spec.revision ? spec : createResource(spec);

        const result = this.#operations.submit(addResourceOperation({
            resource,
            payload,
            index: index ?? null,
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied ? this.get(resource.id) : null;
    }

    /**
     * Undeclare a resource, as one REMOVE_RESOURCE operation.
     *
     * The payload travels with the operation, which is what lets the removal be undone —
     * and what makes deleting a component definition recoverable rather than final.
     *
     * @param {string} id - The ResourceId
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when the resource was removed
     */
    remove(id, { actor, batch } = {}) {
        const resource = this.#resources.get(id);
        if (!resource) return false;

        const result = this.#operations.submit(removeResourceOperation({
            resource: snapshot(resource),
            payload: this.#store.read(id),
            index: this.resources().indexOf(resource),
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * Change a field of a manifest entry, as one SET_PROPERTY operation.
     *
     * Renaming a resource is this, and nothing else: `name` is a display field that
     * nothing references, so no payload is rewritten and no reference breaks (ADR-0020).
     * The same holds for a Component's displayed name, which lives in its definition
     * payload rather than here (ADR-0021).
     *
     * @param {string} id - The ResourceId
     * @param {string} prop - Field name
     * @param {any} value - New value
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object} { applied, operation, decision }
     */
    setProperty(id, prop, value, { actor, batch } = {}) {
        const resource = this.#resources.get(id);
        if (!resource) return { applied: false, operation: null, decision: null };
        if (prop === 'id') throw new Error('Project.setProperty: a ResourceId is immutable (ADR-0020)');
        if (resource[prop] === value) return { applied: false, operation: null, decision: null };

        return this.#operations.submit(setPropertyOperation({
            target: { object: id, component: null },
            prop,
            value,
            previous: resource[prop],
            origin: Origin.EDITOR,
            actor,
            batch
        }));
    }

    /**
     * Write a payload and bump the resource's revision.
     *
     * `revision` is what tells `Behaviors` a graph changed and the Editor that a panel has
     * to be rebuilt. It is deliberately NOT stored on instances: that is what keeps
     * structural reconciliation simple (ADR-0021).
     *
     * @param {string} id - The ResourceId
     * @param {any} payload - The content
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups this into a larger history entry, for a
     *   gesture that creates a resource AND writes its first payload
     * @returns {object|null} The manifest entry, or null when the resource is unknown
     */
    save(id, payload, { actor, batch } = {}) {
        const resource = this.#resources.get(id);
        if (!resource) return null;

        const group = batch ?? createId();
        this.#store.write(snapshot(resource), payload);
        this.setProperty(id, 'revision', resource.revision + 1, { actor, batch: group });
        // Batched with the revision, so a save is one history entry and `modified` never
        // drifts from the revision it belongs to.
        this.setProperty(id, 'modified', Date.now(), { actor, batch: group });
        return resource;
    }

    /**
     * Declare a folder, named so it does not collide with its siblings.
     *
     * A folder is a Resource with no payload, so this is `add()` with one kind fixed and a
     * name chosen: there is no second creation path, and no second identity scheme
     * (ADR-0025).
     *
     * @param {object} [options] - Options
     * @param {string} [options.name] - Displayed name; "New Folder" by default
     * @param {string|null} [options.parent] - The folder it goes in
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object|null} The manifest entry, or null when refused
     */
    addFolder({ name = 'New Folder', parent = null, actor, batch } = {}) {
        return this.add(
            { kind: ResourceKind.FOLDER, name: uniqueResourceName(this, name, parent), parent },
            null,
            { actor, batch }
        );
    }

    /**
     * Move a resource into a folder, as one SET_PROPERTY operation.
     *
     * Moving is a change of one field, so it needs no operation of its own: it replicates,
     * it inverts, and it lands in the same history as a rename (ADR-0024). What it does
     * NOT do is touch the payload or the identity — which is the whole reason the
     * hierarchy is a link rather than a path (ADR-0025).
     *
     * @param {string} id - The ResourceId
     * @param {string|null} parent - The destination folder's id, or null for the top level
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when the resource moved
     */
    move(id, parent = null, { index = null, actor, batch } = {}) {
        const resource = this.#resources.get(id);
        if (!resource) return false;

        const previousParent = resource.parent ?? null;
        const previousIndex = this.indexOf(id);
        const destination = parent ?? null;
        // Appending is `index: null`, and it is not the same as "the rank it already has":
        // a drop with no rank means the end of the list, wherever that is now.
        const to = index === null || index === undefined ? null : index;

        if (destination === previousParent && (to === null || to === previousIndex)) return false;

        const result = this.#operations.submit(moveResourceOperation({
            resource: id,
            parent: destination,
            index: to,
            previousParent,
            previousIndex,
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * The rank a resource holds among its siblings.
     * @param {string} id - The ResourceId
     * @returns {number} The rank, or -1 when the project does not declare it
     */
    indexOf(id) {
        const resource = this.#resources.get(id);
        if (!resource) return -1;
        return this.children(resource.parent ?? null).indexOf(resource);
    }

    /**
     * Remove a resource and everything under it, as one batch.
     *
     * THE POLICY, STATED: deleting a folder deletes what it holds. Orphaning the children
     * to the top level would silently rearrange a project somebody was tidying; leaving
     * them under a folder that no longer exists would lose them outright. One batch means
     * one `Ctrl Z` brings the whole branch back, payloads included (ADR-0024).
     *
     * Children go first, so the inverse restores parents first: an entry that names a
     * folder must never arrive before the folder does.
     *
     * @param {string} id - The ResourceId
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @returns {number} How many resources were removed
     */
    removeTree(id, { actor } = {}) {
        const resource = this.#resources.get(id);
        if (!resource) return 0;

        const batch = createId();
        // Children first, so the inverse restores parents first. Nothing else has to be
        // collected: a Component and its graph are ONE resource (ADR-0026), so there is no
        // payload-level ownership left to chase.
        const doomed = [...descendantsOf(this, resource), resource].reverse();

        let removed = 0;
        for (const entry of doomed) {
            if (this.remove(entry.id, { actor, batch })) removed++;
        }
        return removed;
    }

    /**
     * The manifest, as it is persisted.
     * @returns {object} A plain, JSON-safe structure
     */
    serialize() {
        return {
            format: MANIFEST_VERSION,
            id: this.#id,
            name: this.#name,
            resources: this.resources().map(snapshot)
        };
    }

    /**
     * Rebuild a project from a manifest.
     * @param {object} data - Data produced by serialize()
     * @param {object} [options] - Options
     * @param {object} [options.store] - Where payloads live
     * @param {object} [options.authority] - Authority for the project's pipeline
     * @returns {Project} The project
     */
    static deserialize(data, { store, authority } = {}) {
        if (data?.format !== MANIFEST_VERSION) {
            throw new Error(`Project.deserialize: unsupported manifest format ${data?.format}`);
        }

        const project = new Project(data.name ?? '', { id: data.id, store, authority });
        // Declared, not added: rebuilding a manifest is construction, not an intent. Going
        // through `add()` would submit an ADD_RESOURCE per entry — numbering operations
        // nobody authored — and, because that operation carries a payload, it would write
        // `null` over the payload the store already holds. Opening a project reads the
        // manifest and NOTHING else (ADR-0020); the Scene rebuilds the same way, through
        // `scene.add()` rather than through its pipeline.
        for (const resource of data.resources ?? []) project.#declare(resource);
        return project;
    }

    #registerHandlers() {
        // A `parent` naming a missing folder, something that is not a folder, the entry
        // itself, or one of its own descendants is REFUSED. Here rather than only in
        // move(), because a replicated operation never goes through move() and a manifest
        // with a cycle holds a branch reachable from nothing (ADR-0019 §5, ADR-0025).
        this.#operations.register(OperationType.SET_PROPERTY, (operation, target) => {
            if (operation.prop === 'parent' && !canMove(this, target.id, operation.value)) return false;
            applyProperty(target, operation.prop, operation.value, operation.origin);
        });

        this.#operations.register(OperationType.ADD_RESOURCE, operation => {
            if (this.#resources.has(operation.resource.id)) return false;

            const entry = this.#declare(operation.resource, operation.index);
            this.#store.write(snapshot(entry), operation.payload);
            return true;
        }, { resolveTarget: false });

        // Filing and ranking are one mutation, so they are one operation and one inverse
        // (ADR-0026). The guard is here rather than only in move(), because a replicated
        // operation never goes through move().
        this.#operations.register(OperationType.MOVE_RESOURCE, operation => {
            const id = operation.target.object;
            const entry = this.#resources.get(id);
            if (!entry) return false;
            if (!canMove(this, id, operation.parent)) return false;

            const destination = operation.parent ?? null;
            const staying = (entry.parent ?? null) === destination;
            if (staying && (operation.index === null || operation.index === this.indexOf(id))) return false;

            // A plain write: the manifest's own primitive, which produces no Operation, so
            // applying a replicated move sends nothing back (ADR-0019 §4).
            applyProperty(entry, 'parent', destination, operation.origin);
            this.#place(entry, operation.index);
            return true;
        }, { resolveTarget: false });

        this.#operations.register(OperationType.REMOVE_RESOURCE, operation => {
            const id = operation.target.object;
            if (!this.#resources.has(id)) return false;

            this.#resources.delete(id);
            this.#store.delete(id);
            return true;
        }, { resolveTarget: false });
    }

    /**
     * Put an entry in the manifest, storage untouched.
     * @param {object} resource - The manifest entry, as plain data
     * @param {number} [index] - Rank in the manifest
     * @returns {object} The reactive entry the project now holds
     */
    #declare(resource, index) {
        const entry = makeReactive({ ...resource });
        this.#insert(entry, index);
        return entry;
    }

    /**
     * Put an entry at a rank AMONG ITS SIBLINGS, rewriting the manifest's order.
     *
     * The manifest is one flat ordered list holding every folder's contents, so a rank
     * inside a folder has to be turned into a position in that list. The rule is: land
     * immediately before the sibling currently holding the rank, and at the end of the
     * folder's run when there is none — which keeps a folder's children contiguous enough
     * to read and, more importantly, keeps two machines agreeing on the order.
     *
     * A Map has no splice, so a reorder is a rewrite, exactly as it is for an Object's
     * components (core/object.js). It is O(n) on a list a creator can read.
     *
     * @param {object} entry - The reactive manifest entry, already carrying its parent
     * @param {number|null} index - Rank among siblings; appended when null
     */
    #place(entry, index) {
        const siblings = this.children(entry.parent ?? null).filter(other => other !== entry);
        const at = index === null || index === undefined
            ? siblings.length
            : Math.max(0, Math.min(index, siblings.length));

        const before = siblings[at] ?? null;
        const entries = [...this.#resources].filter(([id]) => id !== entry.id);
        const position = before
            ? entries.findIndex(([id]) => id === before.id)
            : this.#endOfRun(entries, entry, siblings);

        entries.splice(position === -1 ? entries.length : position, 0, [entry.id, entry]);
        this.#resources.clear();
        for (const [id, value] of entries) this.#resources.set(id, value);
    }

    /**
     * Where a folder's run of children ends, for an entry that appends.
     *
     * After the last sibling when there is one; just after the folder itself when the
     * folder is empty — so a resource dropped into an empty folder does not land at the
     * far end of the manifest, where nothing else about it is.
     */
    #endOfRun(entries, entry, siblings) {
        const last = siblings.at(-1);
        if (last) return entries.findIndex(([id]) => id === last.id) + 1;

        const parent = entry.parent ?? null;
        if (!parent) return entries.length;

        const folder = entries.findIndex(([id]) => id === parent);
        return folder === -1 ? entries.length : folder + 1;
    }

    #insert(entry, index) {
        // `index` is a rank among siblings here too, so adding and moving mean the same
        // thing by the same word.
        this.#place(entry, index);
    }
}

/** A manifest entry as plain data, with no reactive wrapper riding along. */
function snapshot(resource) {
    return globalThis.Object.freeze({ ...resource });
}
