// Where a bundle waits between the Editor writing it and the game client opening it.
//
// THIS FILE IS THE ONLY THING THAT KNOWS A PREVIEW IS LOCAL (ADR-0042 §3, §4). The game
// client asks `resolve(id)` for a bundle and plays it; it never learns whether the answer
// came from this browser's storage, from a `fetch`, or from a file. That one seam is what
// makes `play.pixelcreator.io/<id>` a replacement rather than a rewrite.
//
// A PREVIEW IS ADDRESSED BY THE PROJECT IT SHOWS (ADR-0044 §2). It used to mint a fresh
// `prv_…` on every opening, so two windows on one game were two unrelated identities, the
// store filled with one entry per press, and nothing could name "the preview of THIS
// project" — which is precisely what a live channel and, later, a published URL have to
// name. The identity is therefore the project's own, and it is stable: pressing Preview
// twice reaches one bundle, and every window of it is a client of one game.
//
// IT FORGETS ON PURPOSE. A project carries images as data URLs, so keeping every project a
// browser has ever opened would fill its storage. The most recent few are kept and the
// rest are dropped, oldest first — and because an id is now a project rather than a press,
// re-opening the same project rewrites its own entry instead of adding one.

/** How many projects keep a stored bundle before the oldest is dropped. */
export const PREVIEW_LIMIT = 4;

const KEY = 'px.preview.';
const INDEX = 'px.preview.index';

/**
 * Keep a bundle under an identifier, dropping the oldest when there are too many.
 *
 * @param {string} id - The preview id
 * @param {object} bundle - As `bundleProject()` produced it
 * @param {object} [storage] - Where to keep it; the browser's local storage by default
 * @returns {boolean} True when it was stored
 */
export function putPreview(id, bundle, storage = defaultStorage()) {
    if (!storage) return false;

    try {
        const index = readIndex(storage).filter(entry => entry !== id);
        index.push(id);

        // OLDEST FIRST, and dropped BEFORE the write, so the new one has room. A quota
        // error on a project full of images is the failure this exists to avoid.
        while (index.length > PREVIEW_LIMIT) storage.removeItem(KEY + index.shift());

        storage.setItem(KEY + id, JSON.stringify(bundle));
        storage.setItem(INDEX, JSON.stringify(index));
        return true;
    } catch {
        // A private window, a full quota, a browser told to keep nothing. The Editor says
        // so rather than opening a window onto a game that is not there.
        return false;
    }
}

/**
 * The bundle an identifier names, or null.
 *
 * ASYNC ON PURPOSE, THOUGH IT ANSWERS AT ONCE. The day this is a `fetch` the signature must
 * not change — a caller written against a synchronous answer would have to be rewritten,
 * and rewriting the caller is exactly what a seam is for avoiding.
 *
 * @param {string} id - The preview or game id
 * @param {object} [storage] - Where to look; the browser's local storage by default
 * @returns {Promise<object|null>} The bundle, or null when nothing answers
 */
export async function resolvePreview(id, storage = defaultStorage()) {
    if (!id || !storage) return null;

    try {
        const raw = storage.getItem(KEY + id);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * The URL that runs a bundle.
 *
 * A FRAGMENT, NOT A QUERY, and that is not cosmetic: a fragment never reaches a server, so
 * a preview id — which names something on this machine — cannot end up in an access log.
 * A published game will use a path (`/<id>`), which is the same function with a different
 * base (ADR-0042 §6).
 *
 * RELATIVE TO THE PAGE THAT ASKS, and the page that asks is the Editor: both applications
 * live under `src/`, so one step up and across is what reaches the client from there.
 *
 * @param {string} id - The preview id
 * @param {string} [base] - Where the client page lives
 * @returns {string} A URL
 */
export function previewUrl(id, base = '../preview/index.html') {
    return `${base}#p/${id}`;
}

/**
 * The identifier a client page was opened with.
 * @param {string} hash - `location.hash`
 * @returns {string|null} The id, or null
 */
export function idFromHash(hash) {
    const match = /^#p\/(.+)$/.exec(hash ?? '');
    return match ? match[1] : null;
}

/** The browser's local storage, or null where there is none. */
function defaultStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reaching for it can throw outright when a browser is told to block site data.
        return null;
    }
}

function readIndex(storage) {
    try {
        const raw = storage.getItem(INDEX);
        const parsed = raw ? JSON.parse(raw) : [];
        return globalThis.Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
