// What a running session needs resolved before it can run (ADR-0061 §4).
//
// THE SAME BOUNDARY THE PREVIEW CLIENT DRAWS, DRAWN INSIDE THE EDITOR. A `Runtime.step()`
// may not wait on storage — that is the constraint the whole prefab design turns on — so
// anything a simulation reaches for by `ResourceId` has to be in memory before the first
// step. In the game client that happens when a bundle is opened (`preview/client.js`); here
// it happens when Play is pressed, because that is the moment an Editor stops being an
// editor and starts being a game.
//
// TWO TABLES, ONE REASON. A prefab definition and a sound payload are different things to a
// creator and the same thing to this file: a Resource the simulation will name by identity
// and cannot read for itself. Keeping them apart would mean two refresh passes over one
// manifest and two places to forget.
//
// IT IS NOT A CACHE, AND IT DOES NOT WATCH. `revision` says whether a payload has changed
// since it was read (ADR-0020 §7), so a refresh re-reads only what moved and drops what has
// been deleted. Nothing subscribes to anything: a session is resolved at the door, and a
// `.prefab` edited while a game is running is the next run's business — which is the same
// answer `Behaviors` gives for a `.px` edited mid-frame.
//
// THE AUDIO OUTPUT IS BUILT HERE BECAUSE THIS IS WHERE THE PAYLOADS ARE. `HtmlAudioOutput`
// takes a resolver and nothing else; giving it one that reads the store would put an
// asynchronous call under a synchronous contract, and giving the Runtime the store would put
// storage behind a runtime API (ADR-0020 §5).

import { PrefabRegistry } from '../../core/mod.js';
import { ResourceKind } from '../../project/mod.js';
import { HtmlAudioOutput } from '../../runtime/mod.js';

/**
 * Build the two resolved tables a Runtime is given, and the pass that fills them.
 *
 * @param {object} context - What it reads
 * @param {object} context.project - The project whose payloads are resolved
 * @param {Function} [context.onError] - Called with `{ resource, error }` instead of throwing
 * @param {Function} [context.createAudioElement] - Builds one sound; the browser's by default
 * @returns {{prefabs: PrefabRegistry, audio: object, sounds: Map, refresh: Function}} The session
 */
export function createSession({ project, onError, createAudioElement } = {}) {
    const prefabs = new PrefabRegistry();
    /** ResourceId -> the payload a sound is played from. */
    const sounds = new globalThis.Map();
    /** ResourceId -> the revision the payload was read at. */
    const revisions = new globalThis.Map();

    const audio = new HtmlAudioOutput({
        resolve: id => sounds.get(id) ?? null,
        create: createAudioElement
    });

    /**
     * Read whatever has changed, forget whatever has gone.
     *
     * @returns {Promise<{prefabs: number, sounds: number}>} How many of each are resolved
     */
    const refresh = async () => {
        if (!project) return { prefabs: prefabs.size, sounds: sounds.size };

        const seen = new globalThis.Set();

        for (const resource of project.resources()) {
            const wanted = resource.kind === ResourceKind.PREFAB
                || (resource.kind === ResourceKind.ASSET && (resource.mime ?? '').startsWith('audio/'));
            if (!wanted) continue;

            seen.add(resource.id);
            if (revisions.get(resource.id) === resource.revision) continue;

            try {
                const payload = await project.read(resource.id);
                if (payload === null || payload === undefined) continue;

                if (resource.kind === ResourceKind.PREFAB) prefabs.set(resource.id, payload);
                else sounds.set(resource.id, payload);
                revisions.set(resource.id, resource.revision);
            } catch (error) {
                // ONE BROKEN PAYLOAD MUST NOT STOP A GAME FROM STARTING, in the spirit of
                // ADR-0012: it is reported and skipped, and a `Spawn Prefab` aimed at it
                // answers nothing at run time — which is already what a node whose target is
                // gone does (ADR-0034 §3.4).
                if (!onError) throw error;
                onError({ resource, error });
            }
        }

        // A RESOURCE THAT HAS BEEN DELETED IS FORGOTTEN, or a game would go on spawning a
        // prefab the Project panel no longer shows.
        for (const id of [...revisions.keys()]) {
            if (seen.has(id)) continue;
            revisions.delete(id);
            prefabs.delete(id);
            sounds.delete(id);
        }

        return { prefabs: prefabs.size, sounds: sounds.size };
    };

    return { prefabs, audio, sounds, refresh };
}
