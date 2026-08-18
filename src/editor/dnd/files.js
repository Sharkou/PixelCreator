// The one part of the drag system that needs a browser.
//
// A `DataTransfer` is the only way a page learns about a file it was not given, and its
// contents have to be read before any rule can decide anything — a rule receives values,
// never a `File` (dnd/rules.js). So this module, and only this module, turns a DOM event
// into a payload.
//
// It also answers "is this drag carrying files at all", which a window needs during
// `dragover`, before anything can be read: the browser exposes the TYPES of a drag long
// before it will hand over its contents, and that is the honest place to draw the
// highlight from.

import { readAsDataUrl } from '../ui/file.js';
import { filesPayload } from './payload.js';

/**
 * Whether a drag event is carrying files from outside the browser.
 *
 * @param {DragEvent} event - The dragover/drop event
 * @returns {boolean} True when files are on their way
 */
export function carriesFiles(event) {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return globalThis.Array.from(types).includes('Files');
}

/**
 * Read the files a drop carried, as a payload.
 *
 * @param {DragEvent} event - The drop event
 * @param {object} [options] - Options
 * @param {string} [options.accept] - A mime prefix to keep, e.g. 'image/'
 * @returns {Promise<object|null>} A files payload, or null when nothing usable arrived
 */
export async function readDroppedFiles(event, { accept = '' } = {}) {
    const files = globalThis.Array.from(event.dataTransfer?.files ?? []);
    const kept = accept ? files.filter(file => (file.type ?? '').startsWith(accept)) : files;
    if (kept.length === 0) return null;

    const entries = [];
    for (const file of kept) {
        entries.push({
            name: file.name,
            mime: file.type || 'application/octet-stream',
            // A data URL, for the reason `ui/file.js` gives: the memory store holds values,
            // and an IndexedDB store will hold the Blob without any rule changing.
            payload: await readAsDataUrl(file)
        });
    }

    return filesPayload(entries);
}
