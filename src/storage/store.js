import { apply } from '/src/lib/utils.js';

export class Store {
    
    /**
     * Create a new Store instance
     * @param {string} name - The database name
     * @param {number} version - The database version
     */
    constructor({
        name = 'default',
        version = 1,
        ...options
    } = {}) {

        apply(this, { name, version, ...options });
        this.db = null;
    }

    /**
     * Open the database
     * @returns {Promise} - Promise that resolves when the database is opened
     */
    open() {
        return new Promise((resolve, reject) => {

            const request = indexedDB.open(this.name, this.version);

            // Database upgrade version needed
            request.onupgradeneeded = e => {
                this.db = request.result;
                this.upgrade(e.oldVersion);
            };

            request.onsuccess = () => {
                this.db = request.result;

                // When a different version is detected in another tab
                this.db.onversionchange = () => {
                    // TODO: Handle this more gracefully (save work, notify user, etc.)
                    this.db.close();
                    console.warn('Database version changed. Please reload the page.');
                };

                resolve(this.db);
            };

            request.onblocked = () => {
                console.error('Database upgrade is blocked, please close other tabs using this application.');
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete the database
     * @returns {Promise} - Promise that resolves when the database is deleted
     */
    delete() {
        return new Promise((resolve, reject) => {
            
            const request = indexedDB.deleteDatabase(this.name);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = e => {
                reject(e);
            };
        });
    }

    /**
     * Upgrade the database structure
     * @param {number} oldVersion - The old database version
     */
    upgrade(oldVersion) {
        switch (oldVersion) {

            // Initial setup
            case 0:
                if (!this.db.objectStoreNames.contains('data')) {
                    this.db.createObjectStore('data', { keyPath: 'id' });
                }

                if (!this.db.objectStoreNames.contains('modules')) {
                    this.db.createObjectStore('modules', { keyPath: 'id' });
                }

                if (!this.db.objectStoreNames.contains('assets')) {
                    this.db.createObjectStore('assets', { keyPath: 'id' });
                }

            // Future upgrades can be handled here
            default:
                // TODO: Handle future upgrades
                break;
        }
    }

    add(objectStoreName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(objectStoreName, 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.add(data);
        });
    }
}