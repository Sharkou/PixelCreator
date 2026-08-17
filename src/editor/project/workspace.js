// Workspace — what the Editor has open, and where it saves it.
//
// THE PIECE THAT WAS MISSING BETWEEN THE EDITOR AND THE PROJECT LAYER. `project/` owns
// identity, storage and loading (ADR-0020); the Editor owned a bare `Scene` built in
// `start()` and had nowhere to put it. This holds the two together and adds exactly what
// ADR-0020 says is Editor state and never project data:
//
//   which resource is open        an OpenEditor, not a `Document`
//   whether it has unsaved work   derived from the pipeline's 'operation' event
//   the undo stack                one per resource, keyed by ResourceId (ADR-0024)
//
// NONE OF THAT IS SERIALIZED INTO THE PROJECT. A workspace is a throwaway artefact whose
// loss costs nothing — the exact opposite of `scene.current` in Legacy, which put IDE
// state in the model and had five modules reading it (ADR-0017).
//
// WHY `dirty` IS DERIVED AND NOT A FLAG. Every mutation of the model that was authored
// travels through the pipeline as an Operation, so "there is unsaved work" is "an
// operation was announced since the last save". A flag set by hand would be a second
// source of truth, and the first thing to go stale.
//
// The Project's own pipeline gets a stack too, so creating or renaming a resource is
// undoable — with `Ctrl Z` in the Project panel taking back a resource edit rather than a
// scene edit, which is the whole reason the stacks are per resource.

import { Emitter } from '../../core/mod.js';
import { Project, addScene, loadScene, saveScene } from '../../project/mod.js';
import { Histories } from '../history.js';

export class Workspace {

    #project;
    #histories;
    #emitter = new Emitter();

    /** The open scene: `{ resource, scene, history, unsubscribe }`, or null. */
    #open = null;
    #dirty = false;

    /**
     * @param {object} [options] - Options
     * @param {object} [options.project] - The project to work in; a new one by default
     * @param {string|null} [options.actor] - Whose operations the stacks record
     */
    constructor({ project = new Project('Untitled Project'), actor = null } = {}) {
        this.#project = project;
        this.#histories = new Histories({ actor });
        // The manifest is a resource like the ones it lists, so it gets its own stack.
        this.#histories.for(project.id, project.operations);
    }

    /** The project being edited. */
    get project() {
        return this.#project;
    }

    /** Every undo stack, keyed by ResourceId. */
    get histories() {
        return this.#histories;
    }

    /** The stack for the manifest itself. */
    get projectHistory() {
        return this.#histories.get(this.#project.id);
    }

    /** The open scene's model, or null. */
    get scene() {
        return this.#open?.scene ?? null;
    }

    /** The manifest entry the open scene came from, or null. */
    get resource() {
        return this.#open?.resource ?? null;
    }

    /** The open scene's undo stack, or null. */
    get history() {
        return this.#open?.history ?? null;
    }

    /** Whether the open scene carries work that is not in the store. */
    get dirty() {
        return this.#dirty;
    }

    /**
     * Subscribe to workspace changes.
     *
     *   'opened'  { resource, scene }   a scene became the open one
     *   'closed'  { resource, scene }   it stopped being open
     *   'dirty'   { resource, dirty }   there is, or is no longer, unsaved work
     *   'saved'   { resource, scene }   the store now holds what the model holds
     *
     * @param {string} event - Event name
     * @param {Function} listener - Called with the payload
     * @returns {Function} Unsubscribe function
     */
    on(event, listener) {
        return this.#emitter.on(event, listener);
    }

    /**
     * Declare a scene in the project and open it.
     *
     * @param {object} scene - The scene to declare
     * @param {object} [options] - Options, as addScene() takes them
     * @returns {object} The manifest entry
     */
    create(scene, options = {}) {
        const resource = addScene(this.#project, scene, options);
        this.#adopt(resource, scene, { dirty: false });
        return resource;
    }

    /**
     * Read a scene back from the project and open it.
     *
     * @param {string} id - The scene's ResourceId
     * @param {object} [options] - Options
     * @param {object} [options.registry] - Component registry used to resolve type names
     * @returns {Promise<object|null>} The scene, or null when there is no such payload
     */
    async open(id, { registry } = {}) {
        const resource = this.#project.get(id);
        if (!resource) return null;

        const scene = await loadScene(this.#project, id, { registry });
        if (!scene) return null;

        this.#adopt(resource, scene, { dirty: false });
        return scene;
    }

    /**
     * Write the open scene to the store.
     *
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @returns {boolean} True when something was written
     */
    save({ actor } = {}) {
        if (!this.#open) return false;

        saveScene(this.#project, this.#open.resource.id, this.#open.scene, { actor });
        this.#setDirty(false);
        this.#emitter.emit('saved', { resource: this.#open.resource, scene: this.#open.scene });
        return true;
    }

    /**
     * Close the open scene, releasing its undo stack.
     *
     * Unsaved work is NOT saved on the way out and NOT silently dropped either: the caller
     * asks `dirty` first and decides. A workspace that saved by itself would make an undo
     * stack the only record of what a creator meant to keep.
     *
     * @returns {boolean} True when a scene was open
     */
    close() {
        if (!this.#open) return false;

        const { resource, scene, unsubscribe } = this.#open;
        unsubscribe();
        this.#histories.close(resource.id);
        this.#open = null;
        this.#setDirty(false);

        this.#emitter.emit('closed', { resource, scene });
        return true;
    }

    #adopt(resource, scene, { dirty }) {
        this.close();

        const history = this.#histories.for(resource.id, scene.operations);
        // "Unsaved work" is exactly "an authored operation since the last write". Applied
        // operations — replicated ones — emit nothing, so a scene kept in step by the
        // network is not reported as locally modified, which is correct: there is nothing
        // of this creator's to lose.
        const unsubscribe = scene.operations.on('operation', () => this.#setDirty(true));

        this.#open = { resource, scene, history, unsubscribe };
        this.#setDirty(dirty);
        this.#emitter.emit('opened', { resource, scene });
    }

    #setDirty(dirty) {
        if (this.#dirty === dirty) return;
        this.#dirty = dirty;
        this.#emitter.emit('dirty', { resource: this.resource, dirty });
    }
}
