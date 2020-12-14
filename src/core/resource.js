import { System } from '/src/core/system.js';

export class Resource {
    
    /**
     * Initialize the resource
     * @constructor
     * @param {string} name - The name of the component
     */
    constructor(name = '', extension = '', type = '', path = '/', value = null) {
        
        this.name = name;
        this.extension = extension;
        this.type = type;
        this.path = (path === '' ? '/' : path);
        this.id = this.path + name + '.' + extension;
        this.value = value;

        // return this;
    }


    /**
     * Synchronization the resource
     * @constructor
     * @param {string} name - The name of the component
     */
    sync() {
        System.sync(this);
    }
}