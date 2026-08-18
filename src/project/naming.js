// A resource's name, and the part of it a creator may not rewrite (ADR-0026).
//
// `player.png` may become `player_idle.png`. It may NOT become `player.txt`: an extension
// is not a name, it is a statement about what the payload IS, and a rename is not a
// conversion. So the name is split — a base a creator edits, and a suffix the resource's
// own kind and mime decide.
//
// THE NAME IS STILL ONE FIELD IN THE MODEL. It is not split into `base` + `extension`,
// because the model has no filesystem behind it: the store is keyed by ResourceId, and the
// day it is IndexedDB or HTTP it will still be keyed by ResourceId (ADR-0020). Storing two
// fields would mean two things to keep in step for a suffix that is derivable — so the
// suffix is DERIVED, and the editing rule is applied where a creator types.
//
// A `.px` IS the extension of a Component, and it is the reason this file states the map
// rather than guessing from the mime: a Component has no mime, and a Scene has none either.

import { ResourceKind } from './resource.js';

/** What each kind's payload is called on disk, when it were ever written to one. */
const KIND_EXTENSIONS = {
    [ResourceKind.FOLDER]: '',
    [ResourceKind.SCENE]: '.scene',
    // ONE FILE FOR A COMPONENT AND ITS GRAPH (ADR-0026). `.px` is the extension of the
    // thing a creator made, not of one half of it.
    [ResourceKind.COMPONENT]: '.px',
    [ResourceKind.GRAPH]: '.px',
    [ResourceKind.ASSET]: ''
};

/** Mime -> extension, for the kinds whose payload is a file the browser handed over. */
const MIME_EXTENSIONS = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg'
};

/**
 * The extension a resource's name must end with.
 *
 * An asset takes it from its mime, because that is what the payload actually is; anything
 * else takes it from its kind. An asset whose mime is unknown keeps whatever suffix its
 * name already carries — refusing to guess is what stops `hero.tga` from becoming
 * `hero.tga.bin`.
 *
 * @param {object} resource - The manifest entry
 * @returns {string} The extension, including the dot, or '' when the kind has none
 */
export function extensionOf(resource) {
    if (!resource) return '';

    if (resource.kind === ResourceKind.ASSET) {
        const known = MIME_EXTENSIONS[resource.mime ?? ''];
        return known ?? suffixOf(resource.name ?? '');
    }

    return KIND_EXTENSIONS[resource.kind] ?? '';
}

/**
 * The part of a name a creator edits.
 *
 * @param {object} resource - The manifest entry
 * @returns {string} The name without its extension
 */
export function baseNameOf(resource) {
    const name = resource?.name ?? '';
    const extension = extensionOf(resource);

    if (extension && name.toLowerCase().endsWith(extension.toLowerCase())) {
        return name.slice(0, -extension.length);
    }
    return name;
}

/**
 * Put an edited base name back together with the extension its kind decides.
 *
 * TYPING AN EXTENSION DOES NOT CHANGE ONE. `player.txt` typed into a PNG's name field
 * yields `player.txt.png`… which would be worse than the disease, so a suffix the creator
 * typed is stripped when it is one this resource could legitimately carry, and kept
 * otherwise — a dot in `v1.2` is part of a name, not a type.
 *
 * @param {string} base - What the creator typed
 * @param {object} resource - The manifest entry being renamed
 * @returns {string} The name to store
 */
export function withExtension(base, resource) {
    const extension = extensionOf(resource);
    const typed = globalThis.String(base ?? '').trim();
    if (!extension) return typed;

    const stripped = typed.toLowerCase().endsWith(extension.toLowerCase())
        ? typed.slice(0, -extension.length)
        : stripKnownSuffix(typed);

    return `${stripped}${extension}`;
}

/**
 * Whether a name may be stored as it is for a resource.
 * @param {string} name - The candidate name
 * @param {object} resource - The manifest entry
 * @returns {boolean} True when the extension is the one this resource must carry
 */
export function hasValidExtension(name, resource) {
    const extension = extensionOf(resource);
    if (!extension) return true;
    return globalThis.String(name ?? '').toLowerCase().endsWith(extension.toLowerCase());
}

/** The trailing `.xxx` of a name, or ''. */
function suffixOf(name) {
    const match = /\.[A-Za-z0-9]{1,5}$/.exec(name ?? '');
    return match ? match[0] : '';
}

/**
 * Drop a suffix that looks like a type, keep one that looks like part of a name.
 *
 * `.txt` and `.jpg` are types a creator was trying to change and cannot; `.2` in
 * `player.v1.2` is a version and part of what they are calling the thing. The rule is
 * therefore "a known extension, or letters only" — which is what a type suffix looks like
 * and what a version never does.
 */
function stripKnownSuffix(typed) {
    const suffix = suffixOf(typed).toLowerCase();
    if (!suffix) return typed;

    const known = new globalThis.Set([
        ...globalThis.Object.values(MIME_EXTENSIONS),
        ...globalThis.Object.values(KIND_EXTENSIONS).filter(Boolean)
    ]);

    const typeLike = known.has(suffix) || /^\.[a-z]{2,4}$/.test(suffix);
    return typeLike ? typed.slice(0, -suffix.length) : typed;
}
