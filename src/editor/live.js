// Keeping every open Preview of this project in step with the Editor (ADR-0044 §3).
//
// THE EDITOR IS THE AUTHORITY, AND IT ALREADY BEHAVES LIKE ONE. Every change a creator
// makes goes through an Operations pipeline that arbitrates, applies and announces
// (ADR-0008, ADR-0011); a follower applies what it is handed and announces nothing back.
// So this file has no model of its own, no diffing and no state: it listens to the
// pipelines the Workspace already owns and forwards what they say.
//
// WHICH PIPELINES, ANSWERED BY THE WORKSPACE RATHER THAN BY A LIST. A resource gains a live
// model at exactly one moment and the Workspace announces it (`attached`, ADR-0043 §3), so
// following "every model there is" is one subscription and not a registry to keep in step.
// That covers the scene and every `.px`, opened or merely selected.
//
// A `.px` IS SENT WHOLE, AND A SCENE IS NOT. A scene is a state the Preview is LIVING in —
// objects have moved, timers have run — and replacing it would throw all of that away, so
// it is kept in step by the operations that changed it. A `.px` is a definition the Preview
// READS: rebinding it replaces the running behaviour, which is what ADR-0016 §7 already
// says a graph edit means. Sending the whole file also means a node drag arrives as one
// definition rather than as forty SET_PROPERTY operations.

import { ResourceKind } from '../project/mod.js';
import { forwardOperations, openLiveChannel, sendDefinition } from '../preview/live.js';

/**
 * Follow this project's models and publish what they announce.
 *
 * @param {object} workspace - The Workspace holding the project and its models
 * @param {object} [options] - Options
 * @param {Function} [options.Channel] - The channel constructor, for tests
 * @returns {{close: Function}} A handle that stops publishing
 */
export function broadcastEdits(workspace, { Channel } = {}) {
    const channel = openLiveChannel(workspace?.project?.id, Channel ? { Channel } : {});
    if (!channel) return { close: () => {} };

    /** ResourceId -> unsubscribe, so a resource is followed once however often it is seen. */
    const following = new globalThis.Map();

    const follow = ({ resource, kind, model }) => {
        if (!resource?.id || following.has(resource.id)) return;

        following.set(resource.id, kind === ResourceKind.COMPONENT
            ? followDefinition(channel, resource.id, model)
            : forwardOperations(channel, resource.id, model));
    };

    // ALREADY ATTACHED COUNTS TOO. The scene exists before anything subscribes — it is what
    // the Editor is built around — so the models present now are picked up alongside the
    // ones that arrive later. Without this the one resource that matters most is the one
    // that is never followed.
    for (const resource of workspace.project?.resources?.() ?? []) {
        const model = workspace.attached?.(resource.id) ?? null;
        if (model) follow({ resource, kind: resource.kind, model });
    }

    const stop = workspace.on?.('attached', follow) ?? (() => {});

    return {
        close: () => {
            stop();
            for (const unfollow of following.values()) unfollow();
            following.clear();
            channel.close?.();
        }
    };
}

/**
 * Send a `.px` whenever anything about it changes, at most once per frame.
 *
 * COALESCED, BECAUSE A DRAG IS NOT FORTY EDITS TO A FOLLOWER. Moving a node submits a
 * SET_PROPERTY per pointer move; the Preview cares about none of the intermediate states,
 * only about the graph it should now be running. A microtask is too eager — a batch is
 * several operations — so the send waits for the frame the creator's gesture ends in.
 *
 * @param {object} channel - The live channel
 * @param {string} resource - The `.px`'s ResourceId
 * @param {object} model - Its ComponentDefinition
 * @returns {Function} Unsubscribe
 */
function followDefinition(channel, resource, model) {
    let pending = null;

    const unsubscribe = model.operations?.on?.('operation', () => {
        if (pending !== null) return;
        pending = globalThis.setTimeout(() => {
            pending = null;
            sendDefinition(channel, resource, model.serialize());
        }, 0);
    }) ?? (() => {});

    return () => {
        if (pending !== null) globalThis.clearTimeout(pending);
        unsubscribe();
    };
}
