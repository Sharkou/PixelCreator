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
    createId,
    makeReactive,
    removeResourceOperation,
    setPropertyOperation
} from '../core/mod.js';
import { createResource } from './resource.js';
import { MemoryResourceStore } from './store.js';

/** Bumped when the manifest shape changes. */
export const MANIFEST_VERSION = 1;

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
     * @returns {object|null} The manifest entry, or null when the resource is unknown
     */
    save(id, payload, { actor } = {}) {
        const resource = this.#resources.get(id);
        if (!resource) return null;

        this.#store.write(snapshot(resource), payload);
        this.setProperty(id, 'revision', resource.revision + 1, { actor });
        return resource;
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
        for (const resource of data.resources ?? []) project.add(resource);
        return project;
    }

    #registerHandlers() {
        this.#operations.register(OperationType.ADD_RESOURCE, operation => {
            if (this.#resources.has(operation.resource.id)) return false;

            const entry = makeReactive({ ...operation.resource });
            this.#insert(entry, operation.index);
            this.#store.write(snapshot(entry), operation.payload);
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

    #insert(entry, index) {
        if (index === null || index === undefined || index >= this.#resources.size) {
            this.#resources.set(entry.id, entry);
            return;
        }

        const entries = [...this.#resources];
        entries.splice(Math.max(0, index), 0, [entry.id, entry]);
        this.#resources.clear();
        for (const [id, value] of entries) this.#resources.set(id, value);
    }
}

/** A manifest entry as plain data, with no reactive wrapper riding along. */
function snapshot(resource) {
    return globalThis.Object.freeze({ ...resource });
}
