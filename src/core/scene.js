import { Object } from '/src/core/object.js';
import { System } from '/src/core/system.js';
import { Network } from '/src/network/network.js';

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

        // Update objects on component import
        System.addEventListener('import', component => {
            this.update(component);
        });
    }
    
    /**
     * Add an object to scene
     * @param {object} obj - The object
     * @param {boolean} dispatch - Dispatch the evenement
     */
    add(obj, dispatch = true) {

        if (!obj) return;
        
        this.current = obj;

        // The added object is the camera
        if (obj.components['camera']) {
            this.camera = obj;
        }
        
        this.objects[obj.id] = obj;
        
        if (dispatch) {
            System.dispatchEvent('add', obj);
        }
    }
    
    /**
     * Remove an object from scene
     * @param {object} obj - The object
     * @param {boolean} dispatch - Dispatch the evenement
     */
    remove(obj, dispatch = true) {

        if (!obj) return;
        
        // Instance
        if (obj.constructor.name === 'Object') {
            // this.objects[obj.id] = null;
            delete this.objects[obj.id]; // delete from scene
        }
        
        if (dispatch) {
            System.dispatchEvent('remove', obj);
        }
    }
    
    /**
     * Instanciate the object to scene
     * @param {object} obj - The object to instantiate
     * @param {boolean} dispatch - Dispatch the event
     */
    instantiate(obj, uid = false, dispatch = true) {

        // let obj = new window[resource.type](resource);        
        // let obj = Object.assign({}, object);

        let copy = new Object();

        copy.copy(obj);

        copy.id = obj.id;

        if (typeof uid === 'boolean' && uid) {
            copy.uid = Network.uid;
        } else if (uid) {
            copy.uid = uid;
        }

        // copy.lock = true; // lock the object from editing

        this.add(copy, false);
        
        if (dispatch) {
            System.dispatchEvent('instantiate', copy);
        }
    }

    /**
     * Initialize the object to scene
     * @param {Object} objects - The objects to initialize
     * @param {Object} camera - The camera to initialize
     */
    init(objects, camera = null) {
        // Objects instantiating
        for (let id in objects) {
            this.instantiate(objects[id]);

            // Camera initialization
            if (camera && objects[id].components.Camera) {
                // obj.x -= obj.width / 2;
                // obj.y -= obj.height / 2;
                // obj.visible = false;
                camera.copy(objects[id]);
                camera.x -= camera.width / 2;
                camera.y -= camera.height / 2;
            }
        }
        
        // Copie des enfants
        for (let id in objects) {
            const obj = this.objects[id];
            for (let child_id in objects[id].childs) {
                const child = this.objects[child_id];
                obj.addChild(child, false);
            }
        }

        this.current = null;
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
        System.dispatchEvent('setCurrentObject', obj);
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
     * Refresh current object
     */
    refresh() {
        if (this.current) {
            this.current = this.current;
        }
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
            obj = this.objects[obj.id];
        } else {
            obj = this.objects[el.parentNode.id];
        }
        obj.$name = el.textContent;
    }

    /**
     * Update all objects with component
     * @param {Object} component - The component
     */
    update(component) {
        for (let id in this.objects) {        
            const obj = this.objects[id];
            if (obj.contains(component)) {
                obj.addComponent(new component());
            }
        }
    }
}