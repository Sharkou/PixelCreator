// The projects this browser holds, and which one to open (ADR-0065 §4).
//
// THE SMALLEST THING THAT IS NOT A LIE. "New Project" and "Open Project" are the two verbs an
// editor cannot do without once anything persists, and everything past them — a dashboard,
// thumbnails, folders of projects, sharing — is a product nobody has designed. So this is
// three functions and a remembered identifier, and the Editor opens the last project a
// creator touched the way every editor of this kind does.
//
// IT DEGRADES RATHER THAN REFUSING. A private window, a browser with storage disabled, a
// quota that is full: `available()` answers no, the library falls back to a `MemoryResourceStore`,
// and the Editor works exactly as it did before this file existed — for as long as the tab is
// open. Saying so is the point; a blank screen with a console error is not a fallback.
//
// WHICH PROJECT WAS LAST OPEN IS NOT PROJECT DATA (ADR-0020 §3). It is workspace state — an
// artefact whose loss costs nothing — so it lives in `localStorage` beside no project at all,
// and a browser that has none simply opens the most recently modified project instead.

import { Project } from '../../project/project.js';
import { MemoryResourceStore } from '../../project/store.js';
import { MemoryArea, PersistentResourceStore, listProjects } from '../../project/persistence.js';
import { IndexedDbArea, available } from '../../project/indexeddb.js';

/** Where the last opened project's identity is remembered. */
export const LAST_OPENED = 'pixel-creator:last-project';

/**
 * What is remembered when a creator asked for a NEW project.
 *
 * FORGETTING WHICH ONE WAS OPEN IS NOT THE SAME AS ASKING FOR ANOTHER (ADR-0069 §6). With
 * nothing remembered, `resume()` falls back to the most recently modified project — which is
 * exactly right for a browser that lost its local storage, and exactly wrong for `New
 * Project`: the creator pressed it, the page reloaded, and the project they already had came
 * straight back. So the intention is written down rather than erased.
 */
export const NEW_PROJECT = '@new';

/**
 * Open the library this browser can offer.
 *
 * @param {object} [options] - Options
 * @param {object} [options.area] - A key-value area; IndexedDB by default, memory as fallback
 * @param {Function} [options.onError] - Called when storage refuses, instead of throwing
 * @returns {Promise<object>} The library
 */
export async function openLibrary({ area = null, onError = null } = {}) {
    let store = area;
    let persistent = Boolean(area);

    if (!store) {
        try {
            if (available()) {
                store = await IndexedDbArea.open();
                persistent = true;
            }
        } catch (error) {
            onError?.(error);
        }
    }

    // MEMORY IS NOT A FAILURE MODE, IT IS THE ONE THIS EDITOR ALREADY HAD. Everything below
    // works against it; what a creator loses is the project when the tab closes, which is
    // exactly where this repository was yesterday.
    if (!store) store = new MemoryArea();

    // NAMED, so `resume()` can answer "a new one" with the very same `create()` a menu calls
    // rather than with a second copy of it (ADR-0069 §6).
    const library = {
        area: store,

        /** Whether what is saved will still be here tomorrow. */
        get persistent() {
            return persistent;
        },

        /**
         * Every project this browser holds, newest first.
         * @returns {Promise<object[]>} `{ id, name, modified, resources }`
         */
        projects: () => listProjects(store),

        /**
         * Declare a new, empty project.
         *
         * @param {string} [name] - What to call it
         * @returns {Promise<{project: object, store: object, fresh: boolean}>} The project
         */
        create: async (name = 'Untitled Project') => {
            const project = new Project(name);
            const resources = new PersistentResourceStore(store, project.id);

            await resources.saveManifest(project.serialize());
            remember(project.id);

            // `fresh` IS WHAT TELLS THE SHELL TO BUILD A STARTER SCENE. A project that was
            // just declared has no scene at all, and opening one that is not there would be
            // an empty grid with nothing to click.
            return { project: withStore(project, resources), store: resources, fresh: true };
        },

        /**
         * Open a project that is already there.
         *
         * @param {string} id - The project's identity
         * @returns {Promise<{project: object, store: object, fresh: boolean}|null>} The project
         */
        open: async id => {
            if (!id) return null;

            const resources = new PersistentResourceStore(store, id);
            const manifest = await resources.manifest();
            if (!manifest?.id || (manifest.resources ?? []).length === 0) return null;

            const project = Project.deserialize(manifest, { store: resources });
            remember(project.id);
            return { project, store: resources, fresh: false };
        },

        /**
         * Open the last project, the newest one, or make one.
         *
         * THE ONE CALL A SHELL MAKES AT START-UP. Three answers in order of what a creator
         * expects: what they were last working on, what they most recently touched, and — the
         * first time anyone runs this — something new to work in.
         *
         * @param {object} [options] - Options
         * @param {string} [options.name] - What a brand new project is called
         * @returns {Promise<{project: object, store: object, fresh: boolean}>} The project
         */
        resume: async ({ name = 'Untitled Project' } = {}) => {
            const last = recall();
            // Asked for, and therefore honoured before anything is looked up.
            if (last === NEW_PROJECT) return library.create(name);
            if (last) {
                const opened = await openOne(store, last);
                if (opened) return opened;
            }

            const [newest] = await listProjects(store);
            if (newest) {
                const opened = await openOne(store, newest.id);
                if (opened) return opened;
            }

            const project = new Project(name);
            const resources = new PersistentResourceStore(store, project.id);
            await resources.saveManifest(project.serialize());
            remember(project.id);

            return { project: withStore(project, resources), store: resources, fresh: true };
        },

        /**
         * Forget a project entirely.
         * @param {string} id - The project's identity
         * @returns {Promise<boolean>} True when something was removed
         */
        remove: async id => {
            if (!id) return false;
            await new PersistentResourceStore(store, id).destroy();
            if (recall() === id) remember(null);
            return true;
        }
    };

    return library;
}

async function openOne(area, id) {
    const resources = new PersistentResourceStore(area, id);
    const manifest = await resources.manifest();
    if (!manifest?.id || (manifest.resources ?? []).length === 0) return null;

    return { project: Project.deserialize(manifest, { store: resources }), store: resources, fresh: false };
}

/**
 * A project bound to a store.
 *
 * `new Project()` TAKES ITS STORE AT CONSTRUCTION and `Project.deserialize()` is given one,
 * so a freshly created project has to be rebuilt around its store rather than handed one
 * afterwards. It has no resources yet, so the round trip costs nothing and there is no second
 * way to attach a store to a project.
 */
function withStore(project, store) {
    return Project.deserialize(project.serialize(), { store });
}

/** Remember which project was open, or forget. */
function remember(id) {
    try {
        if (id) globalThis.localStorage?.setItem(LAST_OPENED, id);
        else globalThis.localStorage?.removeItem(LAST_OPENED);
    } catch {
        // A private window refuses to store this. It is a convenience, not project data:
        // the library falls back to the most recently modified project and nothing is lost.
    }
}

/** Which project was open last, or null. */
function recall() {
    try {
        return globalThis.localStorage?.getItem(LAST_OPENED) ?? null;
    } catch {
        return null;
    }
}

/**
 * A library that keeps nothing, for a test or a host with no storage at all.
 * @returns {Promise<object>} A library over memory
 */
export function memoryLibrary() {
    return openLibrary({ area: new MemoryArea() });
}

export { MemoryResourceStore };
