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

            // Future upgrades can be handled here
            default:
                // TODO: Handle future upgrades
                break;
        }
    }

    /**
     * Add data to the object store
     * @param {string} objectStoreName - The name of the object store
     * @param {Object} data - The data to add
     * @returns {Promise} - Promise that resolves with the key of the added data
     */
    add(objectStoreName, data) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.add(data);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Update or add data to the object store
     * @param {string} objectStoreName - The name of the object store
     * @param {Object} data - The data to update or add
     * @returns {Promise} - Promise that resolves with the key of the data
     */
    put(objectStoreName, data) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.put(data);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get data from the object store by key
     * @param {string} objectStoreName - The name of the object store
     * @param {*} key - The key of the data to retrieve
     * @returns {Promise} - Promise that resolves with the data
     */
    get(objectStoreName, key) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readonly');
            const store = transaction.objectStore(objectStoreName);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all data from the object store
     * @param {string} objectStoreName - The name of the object store
     * @returns {Promise} - Promise that resolves with an array of all data
     */
    getAll(objectStoreName) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readonly');
            const store = transaction.objectStore(objectStoreName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Remove data from the object store by key
     * @param {string} objectStoreName - The name of the object store
     * @param {*} key - The key of the data to remove
     * @returns {Promise} - Promise that resolves when the data is removed
     */
    remove(objectStoreName, key) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Clear all data from the object store
     * @param {string} objectStoreName - The name of the object store
     * @returns {Promise} - Promise that resolves when the store is cleared
     */
    clear(objectStoreName) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Count the number of items in the object store
     * @param {string} objectStoreName - The name of the object store
     * @returns {Promise} - Promise that resolves with the count
     */
    count(objectStoreName) {
        return new Promise((resolve, reject) => {

            const transaction = this.db.transaction(objectStoreName, 'readonly');
            const store = transaction.objectStore(objectStoreName);
            const request = store.count();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}