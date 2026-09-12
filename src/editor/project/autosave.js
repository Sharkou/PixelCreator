// Keeping what a creator is doing, without being asked (ADR-0065 §2).
//
// TWO THINGS HAVE TO REACH THE STORE, AND THEY ARRIVE FOR TWO DIFFERENT REASONS.
//
//   a payload   a scene or a `.px` that has been edited. `Workspace.save()` already writes
//               one, and already knows which editors are dirty; what was missing was
//               somebody to call it.
//   the manifest  a rename, a move into a folder, a reorder, a deletion. None of those
//               touches a payload at all — `Project` emits an operation and nothing is
//               written — so the manifest is written wholesale from `project.serialize()`.
//
// DEBOUNCED HERE AND NOWHERE ELSE. A creator dragging a slider produces one operation per
// pixel, and each of them is a real, replicable intent that the model is right to emit
// (ADR-0026 §3). What must not happen is one database write per pixel, so the quiet period
// is applied HERE, at the door of persistence — never in the model, never in the pipeline,
// and never anywhere near a simulation step.
//
// IT SAVES ON THE WAY OUT, TOO. A tab closed during the quiet period would lose the last
// second of work, which is exactly the second a creator remembers. `visibilitychange` and
// `pagehide` are the two events a browser actually delivers when a tab goes away; `unload` is
// not, on mobile. Both flush synchronously-scheduled writes rather than waiting.
//
// NOTHING HERE KNOWS WHAT INDEXEDDB IS. It is handed a store, and a store may be memory in a
// test — which is how every behaviour below is verified without a browser.

/** How long the model must be quiet before anything is written, in milliseconds. */
export const QUIET = 600;

/**
 * Start saving a workspace into a store, on its own.
 *
 * @param {object} context - What it works on
 * @param {object} context.workspace - The Workspace holding the project and its editors
 * @param {object} context.store - Where to persist; needs `saveManifest()`
 * @param {number} [context.quiet] - Milliseconds of silence before a write
 * @param {Function} [context.onError] - Called with the error instead of throwing
 * @param {Function} [context.schedule] - How a delay is arranged; `setTimeout` by default
 * @param {Function} [context.cancel] - How one is cancelled; `clearTimeout` by default
 * @returns {{flush: Function, stop: Function, pending: Function, saves: Function}} The autosave
 */
export function createAutosave({
    workspace,
    store,
    quiet = QUIET,
    onError = null,
    schedule = (run, delay) => globalThis.setTimeout(run, delay),
    cancel = handle => globalThis.clearTimeout(handle)
} = {}) {
    let timer = null;
    let dirty = false;
    let saves = 0;
    let running = null;
    const release = [];

    const later = () => {
        dirty = true;
        if (timer !== null) cancel(timer);
        timer = schedule(() => {
            timer = null;
            flush();
        }, quiet);
    };

    /**
     * Write everything that has changed, now.
     *
     * ONE WRITE AT A TIME. A flush that started while another was in flight would race two
     * manifests into one record, and the loser would be whichever finished second — which is
     * not the same as whichever was newer. A second ask during a write simply marks the model
     * dirty again, and the write that is running finishes first.
     *
     * @returns {Promise<number>} How many saves have happened in this session
     */
    const flush = async () => {
        if (running) return running;
        if (!dirty || !workspace || !store) return saves;

        dirty = false;
        running = (async () => {
            try {
                // THE PAYLOADS FIRST. `Workspace.save()` writes through the Project, which
                // writes through the store — so by the time the manifest is written, every
                // revision it mentions is a revision the store actually holds.
                for (const resource of workspace.opened?.() ?? []) {
                    workspace.save({ id: resource.id });
                }

                await store.saveManifest?.(workspace.project.serialize());
                saves++;
            } catch (error) {
                // A FAILED SAVE MARKS THE MODEL DIRTY AGAIN rather than being swallowed: a
                // quota that was full a second ago may not be full in another second, and a
                // creator who is told nothing and saved nothing is the worst of both.
                dirty = true;
                if (!onError) throw error;
                onError(error);
            } finally {
                running = null;
            }

            return saves;
        })();

        return running;
    };

    if (workspace) {
        // A PAYLOAD CHANGED. `dirty` is announced per resource by the Workspace itself,
        // which already derives it from the pipeline rather than from a flag (ADR-0020 §3).
        release.push(workspace.on('dirty', () => later()));
        release.push(workspace.on('opened', () => later()));
        release.push(workspace.on('closed', () => later()));

        // THE MANIFEST CHANGED. Renaming, moving, reordering and deleting a resource are
        // operations on the PROJECT's own pipeline and touch no payload at all — so without
        // this, a project could be renamed and reopened under its old name.
        const pipeline = workspace.project?.operations;
        if (pipeline?.on) release.push(pipeline.on('operation', () => later()));
    }

    // THE TWO EVENTS A BROWSER REALLY DELIVERS WHEN A TAB GOES AWAY. `unload` is not one of
    // them on mobile, and `beforeunload` cannot await anything either — what saves the last
    // second is having written on the way to hidden, not asking for more time.
    const onHide = () => {
        if (globalThis.document?.visibilityState === 'visible') return;
        if (timer !== null) cancel(timer);
        timer = null;
        flush();
    };

    if (globalThis.addEventListener) {
        globalThis.addEventListener('visibilitychange', onHide);
        globalThis.addEventListener('pagehide', onHide);
        release.push(() => {
            globalThis.removeEventListener('visibilitychange', onHide);
            globalThis.removeEventListener('pagehide', onHide);
        });
    }

    return {
        flush,
        /** Whether something is waiting to be written. */
        pending: () => dirty || timer !== null,
        /** How many writes have happened. */
        saves: () => saves,
        stop: () => {
            if (timer !== null) cancel(timer);
            timer = null;
            for (const off of release.splice(0)) off?.();
        }
    };
}
