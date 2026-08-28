// Where a bundle waits between the Editor writing it and the game client opening it.
//
// THIS FILE IS THE ONLY THING THAT KNOWS A PREVIEW IS LOCAL (ADR-0042 §3, §4). The game
// client asks `resolve(id)` for a bundle and plays it; it never learns whether the answer
// came from this browser's storage, from a `fetch`, or from a file. That one seam is what
// makes `play.pixelcreator.io/<id>` a replacement rather than a rewrite.
//
// A PREVIEW ID IS NOT A GAME ID, AND THE PREFIX SAYS SO. `prv_` marks something local,
// disposable and belonging to this machine; a published game will carry an id a server
// minted, and the client will not be able to tell them apart — which is the point.
//
// IT FORGETS ON PURPOSE. A project carries images as data URLs, so keeping every preview a
// session produced would fill the browser's storage with the history of one afternoon. The
// most recent few are kept and the rest are dropped, oldest first.

/** How a preview identifier is spelled, so its nature is readable rather than guessed. */
export const PREVIEW_PREFIX = 'prv_';

/** How many previews are kept before the oldest is dropped. */
export const PREVIEW_LIMIT = 4;

const KEY = 'px.preview.';
const INDEX = 'px.preview.index';

/**
 * Mint an identifier for a new preview.
 * @returns {string} A preview id
 */
export function createPreviewId() {
    return `${PREVIEW_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whether an identifier names a local preview rather than a published game.
 * @param {string} id - The identifier
 * @returns {boolean} True for a preview
 */
export function isPreviewId(id) {
    return typeof id === 'string' && id.startsWith(PREVIEW_PREFIX);
}

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
 * The URL that plays a bundle.
 *
 * A FRAGMENT, NOT A QUERY, and that is not cosmetic: a fragment never reaches a server, so
 * a preview id — which names something on this machine — cannot end up in an access log.
 * A published game will use a path (`/play/<id>`), which is the same function with a
 * different base (ADR-0042 §6).
 *
 * @param {string} id - The preview id
 * @param {string} [base] - Where the client page lives
 * @returns {string} A URL
 */
export function previewUrl(id, base = '../play/index.html') {
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
