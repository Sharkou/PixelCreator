// Reading a resource's payload into a view that cannot wait.
//
// A STORE IS ASYNCHRONOUS AND A PANEL IS NOT (ADR-0020 §4). A project held in memory answers
// at once; the one a browser actually keeps answers a promise (ADR-0065 §3) — and every view
// that read a payload with `project.read(id)` and looked at the answer got a `Promise`, which
// is not null, is not a data URL, and is not a size in bytes. So the Project panel drew a
// glyph where every thumbnail belonged, the reference control did the same, and the
// Inspector's Size row was blank for every resource of every real project.
//
// ONE CACHE, ONE RULE, THREE READERS. The Inspector grew the right answer first and kept it
// to itself; this is that answer, named and shared, so a fourth view cannot get it wrong
// again. A value is asked for ONCE per revision, remembered against the revision it was read
// at — which is exactly the signal a payload write moves (ADR-0020) — and the view is told
// when a late answer lands so it can draw it.
//
// IT IS NOT A SECOND SOURCE OF TRUTH. Nothing is written here and nothing is held past the
// revision it belongs to: a save bumps `revision`, the key changes, and the next read goes
// back to the store. What it removes is the third, fourth and fifth copy of "ask once, redraw
// when it arrives", not the store.

import { hasPayload } from '../../project/mod.js';

export class PayloadCache {

    /**
     * `${id}:${what}` -> `{ revision, value }`, the value being null while it is in flight.
     *
     * ONE ENTRY PER RESOURCE, NOT ONE PER REVISION. Keying on the revision as well would keep
     * every version of every payload a session ever read — and a payload is a data URL, so ten
     * edits of one sprite sheet is ten copies of it held for the life of the panel. What is
     * worth remembering is what the resource holds NOW; the revision is how that is known to
     * have moved, not part of the address.
     */
    #values = new globalThis.Map();

    /** Set while a sweep of what the project no longer declares is scheduled. */
    #sweeping = false;

    /**
     * A resource's payload, as far as it is known right now.
     *
     * @param {object} project - The project to read from
     * @param {object} resource - The manifest entry
     * @param {Function} [onArrival] - Called when a late payload lands
     * @returns {any} The payload, or null until it is here
     */
    payload(project, resource, onArrival) {
        if (!project || !resource || !hasPayload(resource)) return null;
        this.#sweep(project);
        return this.#resolve(
            this.#key(resource, 'payload'),
            resource.revision ?? 0,
            () => project.read(resource.id),
            onArrival
        );
    }

    /**
     * How many bytes a resource's payload occupies, when the store can say.
     *
     * @param {object} project - The project to read from
     * @param {object} resource - The manifest entry
     * @param {Function} [onArrival] - Called when a late answer lands
     * @returns {number|null} The size, or null until it is known
     */
    size(project, resource, onArrival) {
        if (!project?.store?.size || !resource || !hasPayload(resource)) return null;
        this.#sweep(project);
        return this.#resolve(
            this.#key(resource, 'size'),
            resource.revision ?? 0,
            () => project.store.size(resource.id),
            onArrival
        );
    }

    /** Forget everything, for a view that has been rebound to another project. */
    clear() {
        this.#values.clear();
    }

    #key(resource, what) {
        return `${resource.id}:${what}`;
    }

    /**
     * Drop what the project no longer declares, once the current redraw is over.
     *
     * A DELETED PICTURE MUST NOT BE HELD FOR THE LIFE OF THE PANEL. Nothing removed an entry
     * but `clear()`, and a panel is rebound once per project — so every payload ever deleted
     * stayed in memory, forty megabytes of data URLs for forty pictures a creator had thrown
     * away. A panel redraws when the manifest changes and asks for what it still shows, so
     * the sweep rides on that: scheduled at most once per turn, it runs after the rows have
     * asked, and it costs one lookup per entry held.
     *
     * @param {object} project - The project whose manifest decides what is still declared
     */
    #sweep(project) {
        if (this.#sweeping || typeof project?.has !== 'function') return;
        this.#sweeping = true;
        globalThis.queueMicrotask(() => {
            this.#sweeping = false;
            for (const key of this.#values.keys()) {
                if (!project.has(key.slice(0, key.lastIndexOf(':')))) this.#values.delete(key);
            }
        });
    }

    #resolve(key, revision, read, onArrival) {
        const held = this.#values.get(key);
        if (held && held.revision === revision) return held.value;

        const answer = read();
        if (!answer || typeof answer.then !== 'function') {
            this.#values.set(key, { revision, value: answer ?? null });
            return answer ?? null;
        }

        // Marked as asked for, so a redraw while it is in flight does not ask again.
        this.#values.set(key, { revision, value: null });
        answer.then(value => {
            // A LATE ANSWER TO AN OLD QUESTION IS DROPPED. Another revision may have been
            // asked for while this one was in flight, and the newer read is the true one.
            const current = this.#values.get(key);
            if (!current || current.revision !== revision) return;

            current.value = value ?? null;
            if (value !== undefined && value !== null) onArrival?.();
        }, () => {
            // A payload that cannot be read is a resource with nothing to show, not a
            // failure of the panel. It stays null until its revision moves.
        });

        return null;
    }
}
