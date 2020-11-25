import { System } from '/src/core/system.js';

export class Loader {

    static modules = [];
    
    /**
     * Initialize the Loader
     * @constructor
     */
    init() {

    }

    /**
     * Load resource
     * @param {string} url - The resource url
     */
    static async load(url, dispatch = true) {

    }

    static async import(url) {
        this.modules.push(await import('/plugins/' + url + '.js'));
    }
}