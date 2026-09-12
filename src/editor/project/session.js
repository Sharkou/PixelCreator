// What a running session needs resolved before it can run (ADR-0061 §4).
//
// THE SAME BOUNDARY THE PREVIEW CLIENT DRAWS, DRAWN INSIDE THE EDITOR. A `Runtime.step()`
// may not wait on storage — that is the constraint the whole prefab design turns on — so
// anything a simulation reaches for by `ResourceId` has to be in memory before the first
// step. In the game client that happens when a bundle is opened (`preview/client.js`); here
// it happens when Play is pressed, because that is the moment an Editor stops being an
// editor and starts being a game.
//
// THREE TABLES, ONE REASON. A definition, a sound and a picture are different things to a
// creator and the same thing to this file: a Resource something will name by identity and
// cannot read for itself. Keeping them apart would mean three refresh passes over one
// manifest and three places to forget.
//
// PICTURES ARE RESOLVED WHETHER OR NOT THE GAME IS RUNNING, and that is the one difference
// from the other two. A creator arranging a scene has to SEE their sprites, so the Editor's
// viewport draws through this cache in edit mode -- the cache is handed `project.read` itself
// and decodes lazily, off the frame path (ADR-0062).
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

import { ResourceRegistry } from '../../core/mod.js';
import { DEFINITION_KINDS, ResourceKind } from '../../project/mod.js';
import { HtmlAudioOutput, ImageCache } from '../../runtime/mod.js';

/**
 * Build the two resolved tables a Runtime is given, and the pass that fills them.
 *
 * @param {object} context - What it reads
 * @param {object} context.project - The project whose payloads are resolved
 * @param {Function} [context.onError] - Called with `{ resource, error }` instead of throwing
 * @param {Function} [context.createAudioElement] - Builds one sound; the browser's by default
 * @param {Function} [context.decodeImage] - Turns a payload into a drawable picture
 * @returns {{resources: object, images: object, audio: object, sounds: Map, refresh: Function}} The session
 */
export function createSession({ project, onError, createAudioElement, decodeImage } = {}) {
    const resources = new ResourceRegistry();
    /** ResourceId -> the payload a sound is played from. */
    const sounds = new globalThis.Map();
    /** ResourceId -> the revision the payload was read at. */
    const revisions = new globalThis.Map();

    const audio = new HtmlAudioOutput({
        resolve: id => sounds.get(id) ?? null,
        create: createAudioElement
    });

    // THE ONE RESOLVER THAT MAY WAIT. A sound is started from inside a step and must answer
    // now, so its payloads are mirrored above; a picture is decoded off the frame path, so
    // this hands over `project.read` itself and nothing is copied (ADR-0062).
    const images = new ImageCache({
        resolve: id => project?.read?.(id) ?? null,
        decode: decodeImage
    });

    /**
     * Read whatever has changed, forget whatever has gone.
     *
     * @returns {Promise<{resources: number, sounds: number, images: number}>} How many are resolved
     */
    const refresh = async () => {
        if (!project) return { resources: resources.size, sounds: sounds.size, images: 0 };

        const seen = new globalThis.Set();
        let pictures = 0;

        for (const resource of project.resources()) {
            const mime = resource.mime ?? '';
            const isDefinition = DEFINITION_KINDS.includes(resource.kind);
            const isSound = resource.kind === ResourceKind.ASSET && mime.startsWith('audio/');
            const isPicture = resource.kind === ResourceKind.ASSET && mime.startsWith('image/');
            if (!isDefinition && !isSound && !isPicture) continue;

            seen.add(resource.id);
            if (isPicture) pictures++;
            if (revisions.get(resource.id) === resource.revision) continue;

            try {
                // A PICTURE IS NOT READ HERE -- the cache reads it for itself, and all this
                // has to do is say that what it holds is stale. Reading the payload twice
                // would put a megabyte through this loop for nothing.
                if (isPicture) {
                    images.invalidate(resource.id);
                    revisions.set(resource.id, resource.revision);
                    continue;
                }

                const payload = await project.read(resource.id);
                if (payload === null || payload === undefined) continue;

                if (isDefinition) resources.set(resource.id, payload);
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
            resources.delete(id);
            sounds.delete(id);
            images.invalidate(id);
        }

        return { resources: resources.size, sounds: sounds.size, images: pictures };
    };

    return { resources, images, audio, sounds, refresh };
}
