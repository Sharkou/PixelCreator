import { Object } from '/src/core/object.js';

export class Scene {
    
    /**
     * Initialize the scene
     * @constructor
     * @param {string} name - The name of the scene
     */
    constructor(name = '') {
        
        this.name = name;
        this.objects = {}; // contains all objects
        this.events = {}; // contains all events
        this.camera = null;
        // this.systems = {}; // contains all systems
        this.currentComponent = false;
    }
    
    /**
     * Add an object to scene
     * @param {object} obj - The object
     * @param {boolean} dispatch - Dispatch the evenement
     */
    add(obj, dispatch = true) {
        
        this.current = obj;

        // The added object is the camera
        if (obj.components['camera']) {
            this.camera = obj;
        }
        
        this.objects[obj.id] = obj;
        
        if (dispatch) {
            this.dispatchEvent('add', obj);
        }
    }
    
    /**
     * Remove an object from scene
     * @param {object} obj - The object
     * @param {boolean} dispatch - Dispatch the evenement
     */
    remove(obj, dispatch = true) {
        
        // Instance
        if (obj.constructor.name === 'Object') {
            // this.objects[obj.id] = null;
            delete this.objects[obj.id]; // delete from scene
        }
        
        if (dispatch) {
            this.dispatchEvent('remove', obj);
        }
    }
    
    /**
     * Instanciate an object to scene
     * @param {object} obj - The object to instanciate
     * @param {boolean} dispatch - Dispatch the evenement
     */
    instanciate(obj, dispatch = true) {

        // let obj = new window[resource.type](resource);        
        // let obj = Object.assign({}, object);

        let copy = new Object();

        copy.copy(obj);

        copy.id = obj.id;

        // copy.lock = true; // lock the object from editing

        this.add(copy, false);
        
        if (dispatch) {
            this.dispatchEvent('instanciate', copy);
        }
    }

    /**
     * Get current object
     * @return {Object} object - The current object
     */
    get current() {
        return this._current;
    }

    /**
     * Set current object
     * @param {Object} object - The current object
     */
    set current(obj) {
        this._current = obj;
        this.dispatchEvent('setCurrentObject', obj);
    }
    
    /**
     * Get current scene
     * @return {Scene} scene - The current scene
     */
    static get main() {        
        return this._main;
    }
    
    /**
     * Set current scene
     * @param {Scene} scene - The current scene
     */
    static set main(scene) {        
        this._main = scene;
    }
    
    /**
     * Dispatch event
     * @param {string} e - The event type
     * @param {object} data - The data
     */
    dispatchEvent(e, data = null) {
        
        if (this.events[e] !== undefined) {
            
            for (let event of this.events[e]) {
                
                event(data);
            }
        }
    }
    
    /**
     * Listen event
     * @param {string} e - The event type
     * @param {Function} fn - The callback function
     */
    addEventListener(e, fn) {
        
        // Create the event if undefined
        if (this.events[e] === undefined) {
            this.events[e] = [];
        }
        
        this.events[e].push(fn); // push the function
    }
    
    /**
     * Get object by name
     * @param {string} name - The object name
     * @return {Object} object - The object
     */
    getObjectByName(name) {
        
        for (let id in this.objects) {
            
            if (this.objects[id].name === name) {
                
                return this.objects[id];
            }
        }
    }

    /**
     * Get objects by name
     * @param {string} name - The object name
     * @return {Object} object - The objects
     */
    getObjectsByName(name) {
        
    }
    
    /**
     * Get objects by tag
     * @param {string} tag - The tag
     * @return {Object} objects - The objects
     */
    getObjectsByTag(tag) {
        
    }

    /**
     * Update object name from HTML Element
     * @param {HTMLElement} el - The HTML Element
     * @param {Object} obj - The object to update
     */
    updateName(el, obj = null) {
        if (obj) {
            this.objects[obj.id].name = el.textContent;
        } else {
            this.objects[el.parentNode.id].name = el.textContent;
        }
    }
}