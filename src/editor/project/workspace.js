// Workspace — what the Editor has open, and where it saves it.
//
// THE PIECE THAT WAS MISSING BETWEEN THE EDITOR AND THE PROJECT LAYER. `project/` owns
// identity, storage and loading (ADR-0020); the Editor owned a bare `Scene` built in
// `start()` and had nowhere to put it. This holds the two together and adds exactly what
// ADR-0020 says is Editor state and never project data:
//
//   which resources are open      OpenEditors, not `Document`s
//   whether one has unsaved work  derived from its pipeline's 'operation' event
//   the undo stack                one per resource, keyed by ResourceId (ADR-0024)
//
// NONE OF THAT IS SERIALIZED INTO THE PROJECT. A workspace is a throwaway artefact whose
// loss costs nothing — the exact opposite of `scene.current` in Legacy, which put IDE
// state in the model and had five modules reading it (ADR-0017).
//
// SEVERAL RESOURCES MAY BE OPEN, AND THAT IS THE POINT OF THE MAP (ADR-0027). A scene and
// the `.px` whose graph a creator is wiring are open at once, each with its own model, its
// own pipeline and its own undo stack. What is deliberately NOT here is a docking manager
// or a tab model: which of the open editors a window shows is a question for the window,
// and `Layout` already answers questions of that kind.
//
// ONE SCENE AT A TIME, still. Every window is bound to a Scene, so swapping one means
// rebinding the shell; until that is worth building, opening a second scene closes the
// first — and says so through the same 'closed' event a deliberate close raises.
//
// ATTACHED IS NOT OPEN. Selecting a `.px` in the Project panel gives the Inspector a live
// model to edit its properties with; that ATTACHES the resource — it gets a model and an
// undo stack — without any window presenting it. Only `open()` marks a resource as
// presented, and only a presented resource refuses to be deleted. Without the distinction,
// clicking a Component once would make it undeletable.
//
// WHY `dirty` IS DERIVED AND NOT A FLAG. Every mutation of the model that was authored
// travels through a pipeline as an Operation, so "there is unsaved work" is "an operation
// was announced since the last save". A flag set by hand would be a second source of truth,
// and the first thing to go stale.

import { ComponentDefinition, Emitter, nodes as defaultNodes } from '../../core/mod.js';
import {
    Project,
    ResourceKind,
    addScene,
    isDescendantOf,
    loadScene,
    saveScene
} from '../../project/mod.js';
import { Histories } from '../history.js';

/** What a kind of resource opens as, and how it is read, written and named. */
const EDITORS = {
    [ResourceKind.SCENE]: {
        noun: 'scene',
        load: (project, id, { registry }) => loadScene(project, id, { registry }),
        save: (project, id, model, options) => saveScene(project, id, model, options),
        /** One scene at a time: every window is bound to it (see the header). */
        exclusive: true
    },
    [ResourceKind.COMPONENT]: {
        noun: 'Component',
        // A `.px` IS the Component and its graph (ADR-0026), so one payload becomes one
        // live model — properties and nodes sharing a pipeline, and therefore a stack.
        load: async (project, id, { nodes }) => ComponentDefinition.deserialize(
            await project.read(id) ?? { type: id },
            { registry: nodes }
        ),
        save: (project, id, model, options) => project.save(id, model.serialize(), options),
        exclusive: false
    }
};

export class Workspace {

    #project;
    #histories;
    #nodes;
    #emitter = new Emitter();

    /** ResourceId -> `{ resource, kind, model, history, unsubscribe, open, dirty }`. */
    #editors = new Map();

    /** The editor a window is presenting and the shortcuts act on, or null. */
    #active = null;

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
    #context = null;

    /**
     * @param {object} [options] - Options
     * @param {object} [options.project] - The project to work in; a new one by default
     * @param {string|null} [options.actor] - Whose operations the stacks record
     * @param {object} [options.nodes] - The NodeRegistry a `.px` graph is read against
     */
    constructor({ project = new Project('Untitled Project'), actor = null, nodes = defaultNodes } = {}) {
        this.#project = project;
        this.#nodes = nodes;
        this.#histories = new Histories({ actor });
        // The manifest is a resource like the ones it lists, so it gets its own stack.
        this.#histories.for(project.id, project.operations);
        this.#context = project.id;

        // A selected resource that is removed — by this creator, by a collaborator, or by
        // an undo — stops being selected, and whatever was editing it is released. Without
        // this the Inspector would go on editing something the project no longer declares,
        // which is the incoherent state a panel-owned selection always ends up in.
        project.operations.on('operation', operation => {
            this.#context = project.id;
            if (operation.type !== 'REMOVE_RESOURCE') return;

            const id = operation.target.object;
            if (id === this.#selected) this.select(null);
            if (this.#editors.has(id)) this.close(id);
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

    /** The NodeRegistry a `.px` graph's ports are read against. */
    get nodes() {
        return this.#nodes;
    }

    /**
     * What the creator is working in: 'project' for the manifest, otherwise the kind of the
     * resource the last intent was authored on.
     *
     * @returns {string} The context
     */
    get context() {
        if (this.#context === this.#project.id) return 'project';
        return this.#editors.get(this.#context)?.kind ?? 'project';
    }

    /**
     * The stack an undo should act on right now.
     * @returns {object|null} The History, or null when there is none
     */
    get activeHistory() {
        return this.#histories.get(this.#context) ?? this.projectHistory;
    }

    /** The open scene's model, or null. */
    get scene() {
        return this.#editorOfKind(ResourceKind.SCENE)?.model ?? null;
    }

    /** The manifest entry the active editor came from, or null. */
    get resource() {
        return this.#editors.get(this.#active)?.resource ?? null;
    }

    /** The model the active editor holds — a Scene, a ComponentDefinition — or null. */
    get model() {
        return this.#editors.get(this.#active)?.model ?? null;
    }

    /** The active editor's undo stack, or null. */
    get history() {
        return this.#editors.get(this.#active)?.history ?? null;
    }

    /** Whether the active editor carries work that is not in the store. */
    get dirty() {
        return this.#editors.get(this.#active)?.dirty ?? false;
    }

    /** The resources a window is presenting, in the order they were opened. */
    opened() {
        return [...this.#editors.values()].filter(editor => editor.open).map(editor => editor.resource);
    }

    /** The active editor's ResourceId, or null. */
    get activeId() {
        return this.#active;
    }

    /**
     * The live model attached to a resource, without attaching one.
     * @param {string} id - The ResourceId
     * @returns {object|null} The model, or null when nothing is attached
     */
    attached(id) {
        return this.#editors.get(id)?.model ?? null;
    }

    /**
     * Whether a window is presenting a resource.
     * @param {string} id - The ResourceId
     * @returns {boolean} True when it is open
     */
    isOpen(id) {
        return this.#editors.get(id)?.open === true;
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
        if (next) this.#context = this.#project.id;
        this.#emitter.emit('selection', { id: next, resource: this.selected, previous });
        return next;
    }

    /**
     * Whether a resource can be deleted right now.
     *
     * WHAT IS OPEN CANNOT BE, and the reason is not squeamishness: a window is bound to
     * that model, so removing the resource it came from would leave the Editor editing
     * something the project no longer declares. Closing the editor is the gesture that
     * makes it safe, and it exists — so this refuses and says which gesture to make.
     *
     * @param {string|object} resource - The resource, or its id
     * @returns {{allowed: boolean, reason: string|null}} The verdict
     */
    canRemove(resource) {
        const id = typeof resource === 'string' ? resource : resource?.id ?? null;
        if (!id || !this.#project.has(id)) return { allowed: false, reason: 'It is not in this project.' };

        for (const editor of this.#editors.values()) {
            if (!editor.open) continue;

            const noun = EDITORS[editor.kind]?.noun ?? 'resource';
            if (id === editor.resource.id) {
                return { allowed: false, reason: `This ${noun} is open. Close it before deleting it.` };
            }
            // A FOLDER TAKES ITS CONTENTS, so a folder holding an open resource is the same
            // refusal one level up. Without this the guard is decorative: dragging the open
            // scene into a folder and deleting the folder would delete it anyway.
            if (isDescendantOf(this.#project, id, editor.resource.id)) {
                return { allowed: false, reason: `It holds the open ${noun}. Close the ${noun} first.` };
            }
        }

        return { allowed: true, reason: null };
    }

    /**
     * Subscribe to workspace changes.
     *
     *   'opened'    { resource, kind, model, scene }  a resource became open
     *   'closed'    { resource, kind, model, scene }  it stopped being open
     *   'dirty'     { resource, dirty }               there is, or is no longer, unsaved work
     *   'saved'     { resource, model }               the store now holds what the model holds
     *   'selection' { id, resource, previous }        another resource is selected, or none
     *   'active'    { resource, id }                  a different editor is the active one
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
        this.#adopt(resource, scene, { open: true });
        return resource;
    }

    /**
     * Open a resource in an editor, reading it back from the project.
     *
     * @param {string} id - The ResourceId
     * @param {object} [options] - Options
     * @param {object} [options.registry] - Component registry used to resolve type names
     * @returns {Promise<object|null>} The model, or null when there is nothing to open
     */
    async open(id, options = {}) {
        const editor = await this.#attach(id, options);
        if (!editor) return null;

        if (!editor.open) {
            editor.open = true;
            this.#emitter.emit('opened', this.#payload(editor));
        }
        this.activate(id);
        return editor.model;
    }

    /**
     * Give a resource a live model and an undo stack, without presenting it.
     *
     * This is what the Inspector uses to edit a `.px`'s properties from a selection: the
     * model exists, its edits are undoable, and nothing claims the resource is open.
     *
     * @param {string} id - The ResourceId
     * @param {object} [options] - Options, as open() takes them
     * @returns {Promise<object|null>} The model, or null when the kind has no editor
     */
    async attach(id, options = {}) {
        return (await this.#attach(id, options))?.model ?? null;
    }

    /**
     * Make an already-open editor the one the shortcuts act on.
     * @param {string} id - The ResourceId
     * @returns {boolean} True when the active editor changed
     */
    activate(id) {
        if (!this.#editors.has(id) || this.#active === id) return false;

        this.#active = id;
        this.#context = id;
        this.#emitter.emit('active', { id, resource: this.resource });
        return true;
    }

    /**
     * Write an editor's model to the store.
     *
     * @param {object} [options] - Options
     * @param {string} [options.id] - Which editor; the active one by default
     * @param {string} [options.actor] - Who authored the intent
     * @returns {boolean} True when something was written
     */
    save({ id = this.#active, actor } = {}) {
        const editor = this.#editors.get(id);
        if (!editor) return false;

        EDITORS[editor.kind].save(this.#project, editor.resource.id, editor.model, { actor });
        this.#setDirty(editor, false);
        this.#emitter.emit('saved', { resource: editor.resource, model: editor.model, scene: this.#sceneOf(editor) });
        return true;
    }

    /**
     * Close an editor, releasing its model and its undo stack.
     *
     * Unsaved work is NOT saved on the way out and NOT silently dropped either: the caller
     * asks `dirty` first and decides. A workspace that saved by itself would make an undo
     * stack the only record of what a creator meant to keep.
     *
     * @param {string} [id] - Which editor; the active one by default
     * @returns {boolean} True when an editor was closed
     */
    close(id = this.#active) {
        const editor = this.#editors.get(id);
        if (!editor) return false;

        editor.unsubscribe();
        this.#histories.close(editor.resource.id);
        this.#editors.delete(editor.resource.id);

        if (this.#active === editor.resource.id) {
            // Whatever is left, so a close does not leave the shortcuts pointing at nothing.
            this.#active = [...this.#editors.keys()].at(-1) ?? null;
            if (this.#context === editor.resource.id) this.#context = this.#active ?? this.#project.id;
        }

        if (editor.dirty) this.#emitter.emit('dirty', { resource: editor.resource, dirty: false });
        this.#emitter.emit('closed', this.#payload(editor));
        return true;
    }

    /** Close every open editor, in the order they were opened. */
    closeAll() {
        for (const id of [...this.#editors.keys()]) this.close(id);
    }

    async #attach(id, { registry } = {}) {
        const existing = this.#editors.get(id);
        if (existing) return existing;

        const resource = this.#project.get(id);
        if (!resource) return null;

        const entry = EDITORS[resource.kind];
        if (!entry) return null;

        const model = await entry.load(this.#project, id, { registry, nodes: this.#nodes });
        if (!model) return null;

        return this.#adopt(resource, model, { open: false });
    }

    #adopt(resource, model, { open }) {
        const entry = EDITORS[resource.kind];
        // One scene at a time: every window is bound to it, so a second one replaces it.
        if (entry.exclusive) {
            const current = this.#editorOfKind(resource.kind);
            if (current) this.close(current.resource.id);
        }

        const history = this.#histories.for(resource.id, model.operations);
        // "Unsaved work" is exactly "an authored operation since the last write". Applied
        // operations — replicated ones — emit nothing, so a model kept in step by the
        // network is not reported as locally modified, which is correct: there is nothing
        // of this creator's to lose.
        const editor = { resource, kind: resource.kind, model, history, dirty: false, open: false, unsubscribe: null };
        editor.unsubscribe = model.operations.on('operation', () => {
            this.#context = resource.id;
            this.#setDirty(editor, true);
        });

        this.#editors.set(resource.id, editor);
        this.#active = resource.id;

        if (open) {
            editor.open = true;
            this.#emitter.emit('opened', this.#payload(editor));
        }
        return editor;
    }

    #editorOfKind(kind) {
        return [...this.#editors.values()].find(editor => editor.kind === kind) ?? null;
    }

    #sceneOf(editor) {
        return editor.kind === ResourceKind.SCENE ? editor.model : null;
    }

    #payload(editor) {
        return {
            resource: editor.resource,
            kind: editor.kind,
            model: editor.model,
            scene: this.#sceneOf(editor)
        };
    }

    #setDirty(editor, dirty) {
        if (editor.dirty === dirty) return;
        editor.dirty = dirty;
        this.#emitter.emit('dirty', { resource: editor.resource, dirty });
    }
}
