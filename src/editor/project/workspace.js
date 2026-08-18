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
import { Project, addScene, isDescendantOf, loadScene, saveScene } from '../../project/mod.js';
import { Histories } from '../history.js';

export class Workspace {

    #project;
    #histories;
    #emitter = new Emitter();

    /** The open scene: `{ resource, scene, history, unsubscribe }`, or null. */
    #open = null;
    #dirty = false;

    // WHICH RESOURCE IS SELECTED, kept here and not in the Project panel, because two
    // windows need the same answer: the panel highlights a row, the Inspector shows the
    // fields. A panel that owned it would be a second source of truth, and the Inspector
    // would have to reach into another element to read it.
    //
    // It is a ResourceId rather than the entry, so it cannot go stale: the entry is a live
    // reactive object that a removal drops, and holding one would keep a deleted resource
    // inspectable.
    #selected = null;

    // WHICH STACK `Ctrl Z` ACTS ON. There is one History per resource (ADR-0024), so the
    // shortcut has to name the resource being edited. The selection alone cannot: deleting
    // a resource clears it, and the undo that would put it back would then be aimed at the
    // scene. So this follows the LAST AUTHORED INTENT — the pipeline an operation was
    // announced on — which is exactly "what the creator was just doing", and it survives
    // the selection going away.
    #context = 'scene';

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

        // A selected resource that is removed — by this creator, by a collaborator, or by
        // an undo — stops being selected. Without this the Inspector would go on editing
        // something the project no longer declares, which is the incoherent state a
        // panel-owned selection always ends up in.
        project.operations.on('operation', operation => {
            this.#context = 'project';
            if (operation.type !== 'REMOVE_RESOURCE') return;
            if (operation.target.object === this.#selected) this.select(null);
        });
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

    /**
     * Which of the two stacks the creator is working in: 'scene' or 'project'.
     * @returns {string} The context
     */
    get context() {
        return this.#context;
    }

    /**
     * The stack an undo should act on right now.
     *
     * @returns {object|null} The History, or null when there is none
     */
    get activeHistory() {
        return this.#context === 'project' ? this.projectHistory : this.history;
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
     * The selected resource's manifest entry, or null.
     *
     * Resolved on every read rather than held: the answer is whatever the manifest says
     * now, so a removed resource inspects as nothing rather than as a ghost.
     *
     * @returns {object|null} The entry
     */
    get selected() {
        return this.#selected ? this.#project.get(this.#selected) : null;
    }

    /** The selected resource's identifier, or null. */
    get selectedId() {
        return this.#selected;
    }

    /**
     * Select a resource, or clear the selection.
     *
     * The same shape as the scene `Selection` (ADR-0017): Editor state, never replicated,
     * never serialized — two creators looking at one project each have their own.
     *
     * @param {string|object|null} resource - The resource, its id, or null
     * @returns {string|null} The selected identifier
     */
    select(resource) {
        const id = typeof resource === 'string' ? resource : resource?.id ?? null;
        const next = id && this.#project.has(id) ? id : null;
        if (next === this.#selected) return next;

        const previous = this.#selected;
        this.#selected = next;
        // Selecting a resource IS a statement about what is being edited; selecting
        // nothing leaves the context where it was, so an undo right after a deletion still
        // lands on the manifest.
        if (next) this.#context = 'project';
        this.#emitter.emit('selection', { id: next, resource: this.selected, previous });
        return next;
    }

    /**
     * Whether a resource can be deleted right now.
     *
     * THE OPEN SCENE CANNOT BE, and the reason is not squeamishness: every window is bound
     * to that Scene, so removing the resource it came from would leave the Editor editing
     * something the project no longer declares. Closing an editor is the gesture that
     * would make it safe, and it does not exist yet — so this refuses, and says why,
     * rather than leaving a control that half works.
     *
     * @param {string|object} resource - The resource, or its id
     * @returns {{allowed: boolean, reason: string|null}} The verdict
     */
    canRemove(resource) {
        const id = typeof resource === 'string' ? resource : resource?.id ?? null;
        if (!id || !this.#project.has(id)) return { allowed: false, reason: 'It is not in this project.' };

        const open = this.#open?.resource?.id ?? null;
        if (!open) return { allowed: true, reason: null };

        if (id === open) {
            return { allowed: false, reason: 'This scene is open. Close it before deleting it.' };
        }
        // A FOLDER TAKES ITS CONTENTS, so a folder holding the open scene is the same
        // refusal one level up. Without this the guard is decorative: dragging the open
        // scene into a folder and deleting the folder would delete it anyway.
        if (isDescendantOf(this.#project, id, open)) {
            return { allowed: false, reason: 'It holds the open scene. Close the scene first.' };
        }
        return { allowed: true, reason: null };
    }

    /**
     * Subscribe to workspace changes.
     *
     *   'opened'    { resource, scene }        a scene became the open one
     *   'closed'    { resource, scene }        it stopped being open
     *   'dirty'     { resource, dirty }        there is, or is no longer, unsaved work
     *   'saved'     { resource, scene }        the store now holds what the model holds
     *   'selection' { id, resource, previous } another resource is selected, or none
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
        const unsubscribe = scene.operations.on('operation', () => {
            this.#context = 'scene';
            this.#setDirty(true);
        });

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
