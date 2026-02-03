import { System } from '/src/core/system.js';

export class Component {
    
    /**
     * Initialize an component
     * @constructor
     * @param {string} name - The name of the component
     */
    constructor(name = '', type = '') {
        
        this.id = System.createID();
        this.name = name;
        this.type = type;

        // Synchronization
        System.sync(this);
    }
}