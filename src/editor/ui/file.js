// Getting a file from the creator, and reading it.
//
// THE ONE THING A BROWSER WILL NOT LET US DO SILENTLY. A page cannot read a file it was
// not handed, so importing anything starts with a picker the creator drives. That is the
// whole of this module: it exists so the Project panel and the Inspector ask for a file
// the same way, and so `project/commands.js` stays free of the DOM and testable under
// Node.
//
// WHY A DATA URL, FOR NOW. The payload of an asset lives outside the scene JSON, read by
// identifier (ADR-0020) — what encoding the store keeps it in is the store's business. The
// in-memory store holds strings, and a data URL is what a browser can draw back without a
// loader that does not exist yet. An IndexedDB store will hold the Blob itself, and the
// only thing that changes is this function and the store: nothing in the model names an
// encoding.

/**
 * Ask the creator for a file.
 *
 * @param {object} [options] - Options
 * @param {string} [options.accept] - An accept attribute, e.g. 'image/*'
 * @returns {Promise<File|null>} The file, or null when the picker was dismissed
 */
export function pickFile({ accept = '' } = {}) {
    return new globalThis.Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        if (accept) input.accept = accept;
        // Hidden rather than absent: a detached input is not reliably clickable in every
        // engine, and the picker is a native dialog, so nothing of this is ever seen.
        input.style.display = 'none';

        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(value);
        };

        input.addEventListener('change', () => finish(input.files?.[0] ?? null));
        // Dismissing the dialog fires no `change` in most engines; `cancel` is the modern
        // signal, and the focus fallback covers the rest.
        input.addEventListener('cancel', () => finish(null));
        globalThis.addEventListener('focus', () => {
            globalThis.setTimeout(() => finish(input.files?.[0] ?? null), 300);
        }, { once: true });

        document.body.append(input);
        input.click();
    });
}

/**
 * Read a file as a data URL.
 *
 * @param {File|Blob} file - The file
 * @returns {Promise<string>} The data URL
 */
export function readAsDataUrl(file) {
    return new globalThis.Promise((resolve, reject) => {
        const reader = new globalThis.FileReader();
        reader.onload = () => resolve(globalThis.String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('readAsDataUrl: could not read the file'));
        reader.readAsDataURL(file);
    });
}
