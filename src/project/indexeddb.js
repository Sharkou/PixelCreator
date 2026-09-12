// The key-value area a browser actually has (ADR-0065 §3).
//
// THIS IS THE ONLY FILE IN THE PROJECT LAYER THAT TOUCHES A BROWSER API, and it is deliberately
// the thinnest one: four operations over one object store, no schema beyond a key, and no
// knowledge of what a manifest, a resource or a payload is. Everything that reasons about
// those lives in `persistence.js` and is tested under Node against `MemoryArea`.
//
// IT IS NOT AN IMPORT OF THE DOM. `indexedDB` is a global a host either has or does not, the
// same way `Audio` and `createImageBitmap` are — so this module loads anywhere and simply
// answers that it is unavailable where it is. `available()` is what a caller asks before
// building one, and what makes falling back to memory a decision rather than a crash.
//
// WHY INDEXEDDB AND NOT `localStorage`. A project holds pictures and sounds as data URLs;
// `localStorage` is synchronous, string-only and capped around five megabytes, which one
// sprite sheet can exhaust. IndexedDB is asynchronous — which the `ResourceStore` contract
// was written for from the first day (ADR-0020 §4) — stores structured values directly, and
// is measured in hundreds of megabytes.
//
// NO VERSIONED MIGRATION YET, AND THAT IS HONEST. There is one object store and it has never
// had another shape. The day the shape changes, `onupgradeneeded` is where the migration goes
// and `VERSION` is what triggers it; inventing a migration framework before there is anything
// to migrate would be a framework nobody has read.

/** The database every project of this browser lives in. */
export const DATABASE = 'pixel-creator';

/** Bumped when the object stores change shape. */
export const VERSION = 1;

/** The one object store: a key, a value, nothing else. */
export const STORE = 'entries';

/**
 * Whether this host has IndexedDB at all.
 * @returns {boolean} True when an area can be opened
 */
export function available() {
    return typeof globalThis.indexedDB?.open === 'function';
}

/**
 * Open the database, creating it the first time.
 *
 * @param {object} [options] - Options
 * @param {string} [options.name] - Database name
 * @param {number} [options.version] - Schema version
 * @returns {Promise<object>} The open database
 */
export function openDatabase({ name = DATABASE, version = VERSION } = {}) {
    return new globalThis.Promise((resolve, reject) => {
        if (!available()) {
            reject(new Error('IndexedDB is not available in this host'));
            return;
        }

        const request = globalThis.indexedDB.open(name, version);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open'));
        // A SECOND TAB HOLDING AN OLDER VERSION OPEN BLOCKS THE UPGRADE, for ever, silently.
        // Saying so is the difference between "the editor is slow to start" and a bug report.
        request.onblocked = () => reject(new Error('Another tab is holding an older database open'));
    });
}

export class IndexedDbArea {

    #database;

    /**
     * Wrap an open database.
     *
     * @param {object} database - What `openDatabase()` answered
     */
    constructor(database) {
        if (!database) throw new TypeError('IndexedDbArea: an open database is required');
        this.#database = database;
    }

    /**
     * Open the database and wrap it.
     * @param {object} [options] - Passed to `openDatabase()`
     * @returns {Promise<IndexedDbArea>} The area
     */
    static async open(options) {
        return new IndexedDbArea(await openDatabase(options));
    }

    /**
     * Read one value.
     * @param {string} key - The key
     * @returns {Promise<any>} The value, or null
     */
    async get(key) {
        return this.#run('readonly', store => store.get(key)).then(value => value ?? null);
    }

    /**
     * Write one value.
     * @param {string} key - The key
     * @param {any} value - What to store
     * @returns {Promise<void>} When it is written
     */
    async put(key, value) {
        await this.#run('readwrite', store => store.put(value, key));
    }

    /**
     * Forget one value.
     * @param {string} key - The key
     * @returns {Promise<boolean>} True when something was there
     */
    async remove(key) {
        const existed = (await this.get(key)) !== null;
        await this.#run('readwrite', store => store.delete(key));
        return existed;
    }

    /**
     * Every key starting with a prefix.
     * @param {string} [prefix] - What they must start with
     * @returns {Promise<string[]>} The keys
     */
    async keys(prefix = '') {
        const all = await this.#run('readonly', store => store.getAllKeys());
        return (all ?? []).filter(key => typeof key === 'string' && key.startsWith(prefix));
    }

    /** Let the database go, so another tab may upgrade it. */
    close() {
        this.#database.close?.();
    }

    /**
     * One request, in one transaction, as a promise.
     *
     * THE TRANSACTION IS AWAITED, NOT THE REQUEST. A request that has succeeded is not a
     * write that has landed: the transaction can still abort, and a caller told "saved" by
     * the request alone would be told it a fraction of a second too early. This resolves on
     * `oncomplete`, which is the moment the bytes are actually there.
     */
    #run(mode, operate) {
        return new globalThis.Promise((resolve, reject) => {
            let transaction;
            try {
                transaction = this.#database.transaction(STORE, mode);
            } catch (error) {
                reject(error);
                return;
            }

            const request = operate(transaction.objectStore(STORE));
            let value;

            request.onsuccess = () => {
                value = request.result;
            };
            request.onerror = () => reject(request.error ?? new Error('IndexedDB refused the request'));

            transaction.oncomplete = () => resolve(value);
            transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted the write'));
            transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed the write'));
        });
    }
}
