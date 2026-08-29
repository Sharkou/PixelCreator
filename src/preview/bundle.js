// A whole project, as one JSON value that can cross a window, a disk or a network.
//
// THE FRONTIER, AND IT IS A FORMAT RATHER THAN AN OBJECT (ADR-0042 §2). The Editor and the
// game client are two applications that share no memory and no imports; what passes between
// them is this. That is the property which keeps the design from being a dead end: the day a
// bundle arrives over HTTP instead of out of a browser store, nothing here changes and
// nothing in the preview client learns about it.
//
// PURE, AND WITHOUT A DOM. A headless server that arbitrates a game (ADR-0011) has to open
// exactly what a browser opens, so opening a bundle may not touch a canvas, a window or a
// storage API — it produces a Project and a Scene and hands them back.
//
// A GAME IS A PROJECT, NOT A SCENE. The `.px` files ARE the behaviour (ADR-0015) and the
// images ARE the rendering, so a scene on its own is not playable. What travels is the
// manifest, every payload it names, and which scene to open.

import { MemoryResourceStore, Project, ResourceKind } from '../project/mod.js';

/** Bumped when the shape below changes in a way an older reader cannot survive. */
export const BUNDLE_FORMAT = 1;

/**
 * Everything a runtime needs to play this project.
 *
 * @param {object} project - The Project to bundle
 * @param {object} store - The ResourceStore holding its payloads
 * @param {object} [options] - Options
 * @param {string} [options.scene] - Which scene to open; the first one otherwise
 * @returns {object} A plain, JSON-safe bundle
 */
export function bundleProject(project, store, { scene = null } = {}) {
    const manifest = project.serialize();
    const payloads = {};

    for (const entry of manifest.resources ?? []) {
        // READ THROUGH THE STORE, NEVER OFF THE ENTRY. A manifest entry is metadata; the
        // payload is what the store holds, and a resource may legitimately have none yet
        // (an empty folder, a scene never saved). Absent is not the same as empty, so it
        // is left out rather than written as null.
        const payload = store?.read?.(entry.id) ?? null;
        if (payload !== null && payload !== undefined) payloads[entry.id] = payload;
    }

    return {
        format: BUNDLE_FORMAT,
        id: manifest.id,
        name: manifest.name,
        manifest,
        payloads,
        // WHICH SCENE THE GAME STARTS ON. A project may hold several, and "the first one"
        // is a fallback rather than a rule — a published game will say so explicitly.
        scene: scene ?? firstSceneOf(manifest)
    };
}

/**
 * Rebuild a project from a bundle.
 *
 * @param {object} bundle - As `bundleProject()` produced it
 * @returns {{project: object, store: object, scene: string|null, name: string}} The project
 */
export function openBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') {
        throw new Error('openBundle: this is not a bundle');
    }
    if (bundle.format !== BUNDLE_FORMAT) {
        // FATAL ON ITS OWN, like a graph from an unknown version (ADR-0027): nothing below
        // can be trusted to mean what it says in a shape this build has never seen.
        throw new Error(`openBundle: unsupported bundle format ${bundle.format}`);
    }

    const store = new MemoryResourceStore();
    const project = Project.deserialize(bundle.manifest, { store });

    for (const [id, payload] of globalThis.Object.entries(bundle.payloads ?? {})) {
        const entry = project.get(id);
        if (entry) store.write(entry, payload);
    }

    return { project, store, scene: bundle.scene ?? null, name: bundle.name ?? 'Untitled' };
}

/** The first scene a manifest lists, which is where a game starts unless it says otherwise. */
function firstSceneOf(manifest) {
    return (manifest.resources ?? []).find(entry => entry.kind === ResourceKind.SCENE)?.id ?? null;
}
