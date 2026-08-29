// The wire between an Editor and the Previews of the same project (ADR-0044).
//
// THIS IS THE TRANSPORT ADR-0011 LEFT OPEN, AND NOTHING MORE. The Operations pipeline was
// built to be replicated: `submit()` arbitrates, applies and ANNOUNCES; `apply()` applies
// an already-authoritative operation and announces nothing, "which is why applying a remote
// operation sends nothing back" (core/operations/operations.js). Everything a follower
// needs has been in the Core since ADR-0019; what was missing was a channel.
//
// SO NO PROTOCOL IS INVENTED HERE. What crosses is an Operation — the same record the
// Editor's history holds and the same one a server will forward — plus one message for the
// case an Operation cannot express (below). A `BroadcastChannel` is the smallest thing that
// carries it between two pages of one browser; the day it is a WebSocket, `open()` changes
// and neither side does (ADR-0042 §6).
//
// TWO KINDS, AND THE ASYMMETRY IS THE POINT:
//
//   operation    a change to the SCENE — a state the Preview is living in. Replacing the
//                scene wholesale would throw away everything the game has become since it
//                started, so it is kept in step by the operations that changed it.
//
//   definition   a change to a `.px` — a definition the Preview READS. There is nothing to
//                preserve: rebinding a graph replaces the running behaviour, which is
//                exactly what ADR-0016 §7 already says a graph edit means.
//
// IT NAMES THE PROJECT, NOT THE WINDOW. Every Preview of one project listens on one
// channel, so two windows are two clients of one game — the property ADR-0042 §6 names as
// the whole of the multiplayer preparation.

/** The channel every page of one project meets on. */
const CHANNEL = 'px.live.';

/** A change to the scene, as the Operation that made it. */
export const LiveMessage = globalThis.Object.freeze({
    OPERATION: 'operation',
    DEFINITION: 'definition'
});

/**
 * Open the channel of a project.
 *
 * NULL RATHER THAN A THROW when the browser has no `BroadcastChannel`: a Preview that
 * cannot follow the Editor is still a Preview, and it must play rather than fail to load.
 * Every caller treats the absence as "no live updates", never as an error.
 *
 * @param {string} projectId - The project's own identity, which is also its preview id
 * @param {object} [options] - Options
 * @param {Function} [options.Channel] - The constructor to use; the browser's by default
 * @returns {object|null} Something with `postMessage`, `onmessage` and `close`, or null
 */
export function openLiveChannel(projectId, { Channel = globalThis.BroadcastChannel } = {}) {
    if (!projectId || typeof Channel !== 'function') return null;

    try {
        return new Channel(CHANNEL + projectId);
    } catch {
        return null;
    }
}

/**
 * Send every Operation a set of models announces down a channel.
 *
 * WHAT IS FORWARDED IS WHAT WAS AUTHORED, and only that: a pipeline emits `operation` from
 * `submit()` alone, so nothing a follower applies can echo back and nothing loops.
 *
 * @param {object} channel - As `openLiveChannel()` returns
 * @param {string} resource - Which resource the model belongs to
 * @param {object} model - Anything carrying an `operations` pipeline
 * @returns {Function} Unsubscribe
 */
export function forwardOperations(channel, resource, model) {
    if (!channel || !model?.operations?.on) return () => {};

    return model.operations.on('operation', operation => {
        // A CHANNEL THAT HAS BEEN CLOSED IS NOT A FAILURE OF THE EDIT. The window at the
        // other end may have gone at any moment, and an edit must not throw because of it.
        try {
            channel.postMessage({ kind: LiveMessage.OPERATION, resource, operation });
        } catch {
            // Nothing to do and nothing to say: the follower is gone.
        }
    });
}

/**
 * Send a `.px` whole, because a definition is read rather than lived in.
 *
 * @param {object} channel - As `openLiveChannel()` returns
 * @param {string} resource - The `.px`'s ResourceId
 * @param {object} payload - What `ComponentDefinition.serialize()` answers
 */
export function sendDefinition(channel, resource, payload) {
    if (!channel || !payload) return;
    try {
        channel.postMessage({ kind: LiveMessage.DEFINITION, resource, payload });
    } catch {
        // The follower is gone.
    }
}
