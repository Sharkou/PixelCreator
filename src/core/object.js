/* Core Modules */
import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Graphics } from '/src/graphics/graphics.js';
import * as components from '/src/core/mod.js';

export class Object {
    
    /**
     * Initialize an entity
     * @constructor
     * @param {string} name - The name of the entity
     * @param {number} x - The x-coordinate of the entity
     * @param {number} y - The y-coordinate of the entity
     * @param {number} width - The width of the entity
     * @param {number} height - The height of the entity
     * @param {number} layer - The layer
     */
    constructor(name = '', x = 0, y = 0, width = 0, height = 0, layer = 0) {
        
        this.id = System.createID();
        this.uid = undefined;
        this.name = name;
        this.layer = layer;
        this.tag = '';
        this.type = '';
        this.active = true;
        this.visible = true;
        this.lock = false;
        this.static = false;
        this.image = null;
        this.components = {};
        this.childs = {};
        
        // Position of the object (left-top coordinate)
        this.x = x;
        this.y = y;
        
        // Dimensions of the object
        this.width = width;
        this.height = height;
        
        // Transformations
        this.rotation = 0.0;
        this.scale = 1.0;

        // this.pivot = 0;

        // Synchronization
        System.sync(this);

        return this;
    }
    
    get _x() {
        return this.__x;
    }
    
    get _y() {
        return this.__y;
    }
    
    /**
     * Set x-coordinate to the object and his childs
     * @param {number} value - The new x-coordinate position
     */
    set _x(value) {
        
        // value *= Time.deltaTime;
            
        let dt = value - this.x;

        for (let id in this.childs) {

            this.childs[id].x += dt;
        }
        
        this.__x = value;
    }
    
    /**
     * Set y-coordinate to the object and his childs
     * @param {number} value - The new y-coordinate position
     */
    set _y(value) {
            
        let dt = value - this.y;

        for (let id in this.childs) {

            this.childs[id].y += dt;
        }
        
        this.__y = value;
    }

    /**
     * Get property value of object without call sync
     * @param {string} value - The property to get
     */
    getProperty(prop) {
        return this['_' + prop];
    }

    /**
     * Set property value to object without call sync
     * @param {string} value - The property to set
     * @param {number} value - The new value
     */
    setProperty(prop, value, dispatch = true) {
        this['_' + prop] = value;

        // Dispatch event
        if (dispatch) {
            System.dispatchEvent('setProperty', {
                object: this,
                component: null,
                prop,
                value
            });
        }
    }

    /**
     * Set property value to component
     * @param {string} value - The property to set
     * @param {number} value - The new value
     */
    setComponentProperty(component, prop, value, dispatch = true) {
        this.components[component]['_' + prop] = value;

        // Dispatch event
        if (dispatch) {
            System.dispatchEvent('setProperty', {
                object: this,
                component,
                prop,
                value
            });
        }
    }

    /**
     * Sync property value to server
     * @param {string} value - The property to set
     * @param {number} value - The new value
     */
    syncProperty(prop, value, dispatch = true) {
        this[prop] = value;

        // Dispatch event
        if (dispatch) {
            System.dispatchEvent('syncProperty', {
                object: this,
                component: null,
                prop,
                value
            });
        }
    }

    /**
     * Sync component property to server
     * @param {string} value - The property to set
     * @param {number} value - The new value
     */
    syncComponentProperty(component, prop, value, dispatch = true) {
        this.components[component][prop] = value;

        // Dispatch event
        if (dispatch) {
            System.dispatchEvent('syncProperty', {
                object: this,
                component,
                prop,
                value
            });
        }
    }
    
    /**
     * Add the object component
     * @param {Component} component - The component to add
     */
    addComponent(component, dispatch = true) {
        
        // Naming the component
        // component.name = component.constructor.name[0].toLowerCase() + component.constructor.name.substr(1);
        component.name = component.constructor.name.toLowerCase();
        
        component.active = true; // activation of the component   
        // this.components[component.constructor.prototype.name] = component;
        this.components[component.name] = component;
        
        // component.self = this; // reference to parent
        if (component.constructorAfterLink)
        {
            component.constructorAfterLink(this);
        }

        if (dispatch) {
            System.dispatchEvent('addComponent', {
                object: this,
                component: component
            });
        }
        
        System.sync(this, component); // Synchronize the component

        return this;
    }
    
    /**
     * Remove the object component
     * @param {Component} component - The component to remove
     */
    removeComponent(component, dispatch = true) {
        const type = typeof component;

        if (type == 'object') {
            delete this.components[component.name.toLowerCase()];
        } else if (type == 'string') {
            delete this.components[component.toLowerCase()];
        }

        if (dispatch) {
            System.dispatchEvent('removeComponent', {
                object: this,
                component: component
            });
        }
    }

    /**
     * Get component
     * @param {Component} component - The component to get
     * @return {Component} component - The component
     */
    getComponent(component) {
        return this.components[component.constructor.name.toLowerCase()];
    }

    /**
     * Contains the object component
     * @param {Component} component - The content component
     * @return {boolean} - The boolean result
     */
    contains(component) {
        return (this.components[component?.name]) ? true : false;
    }
    
    /**
     * Add child to object
     * @param {Object} child - The child to add
     */
    addChild(child, dispatch = true) {
        this.childs[child.id] = child;
        child.parent = this.id;

        if (dispatch) {
            System.dispatchEvent('addChild', {
                object: this,
                child: child
            });
        }
    }
    
    /**
     * Remove the child
     * @param {Object} child - The child to remove
     */
    removeChild(child, dispatch = true) {
        child.parent = null;
        delete this.childs[child.id];

        if (dispatch) {
            System.dispatchEvent('removeChild', {
                object: this,
                child: child
            });
        }
    }

    /**
     * Add child to object
     * @param {Object} child - The child to get
     * @return {Object} child - The child
     */
    getChild(child) {
        return this.childs[child.id];
    }
    
    /**
     * Update the object's components
     * @param {Scene} scene - The renderer scene
     * @param {Camera} camera - The renderer camera
     */
    update() {
        for (let i in this.components) {
            if (this.components[i].active) {
                if (this.components[i].update) {
                    this.components[i].update(this);
                }
            }
        }
    }
    
    /**
     * Draw the object's components
     * @param {CanvasRenderingContext2D} ctx - The context
     */
    draw() {
        for (let i in this.components) {
            if (this.components[i].active) {
                if (this.components[i].draw) {
                    this.components[i].draw(this);
                }
            }
        }
    }

    /**
     * Preview the object's components
     * @param {CanvasRenderingContext2D} ctx - The context
     */
    preview() {
        for (let i in this.components) {
            if (this.components[i].active) {
                if (this.components[i].preview) {
                    this.components[i].preview(this);
                }
            }
        }
    }

    /**
     * Translate the object
     * @param {number} x - The x-coordinate of the entity
     * @param {number} y - The y-coordinate of the entity
     */
    translate(x = 0, y = 0) {

        this.x += x;
        this.y += y;

        if (this.components.collider) {
            if (this.components.collider.update(this)) {
                this.x -= x;
                this.y -= y;
            }
        }
    }
    
    /**
     * Rotate the object
     * @param {number} angle - The angle in degrees
     */
    rotate(angle = 0) {
        this.rotation = angle * Math.PI / 180;
    }

    /**
     * Set object active
     * @param {boolean} active - The active boolean
     */
    setActive(active) {
        this.active = active;
    }
    
    /**
     * Copy the object properties
     * @param {Object} obj - The object to copy
     */
    copy(obj) {

        // let clone = Object.assign(Object.create(Object.getPrototypeOf(orig)), orig)

        // Copie des propriétés de l'objet
        for (let prop in obj) {
            if (typeof obj[prop] !== 'object') {
                this[prop] = obj[prop];
            } else {
                // TODO: Gérer les objets
            }
        }

        // Copie des composants
        for (let name in obj.components) {

            const component = obj.components[name];
            
            this.addComponent(new components[name.charAt(0).toUpperCase() + name.slice(1)](), false);

            // Copie des propriétés du composant
            for (let prop in component) {
                this.components[name][prop] = component[prop];
            }
        }

        // if (dispatch) {
        //     System.dispatchEvent('copy', {
        //         obj: this,
        //         component: component
        //     });
        // }
    }

    /**
     * Copy the component
     * @param {string} component - The component to copy
     */
    copyComponent(component) {
        // Création d'un nouveau composant
        const name = component.name;
        const copy = new components[name.charAt(0).toUpperCase() + name.slice(1)]();

        // Copie des propriétés du composant
        for (let prop in copy) {
            if (typeof obj[prop] !== 'object') {
                copy[prop] = component[prop];
            } else {
                // TODO: Gérer les objets
            }
        }

        return copy;
    }

    /**
     * On collision
     * @param {Object} other - The other colliding object
     */
    onCollision(other) {
        for (let i in this.components) {
            if (this.components[i].active) {
                if (this.components[i].onCollision) {
                    this.components[i].onCollision(this, other);
                }
            }
        }
    }
    
    /**
     * On collision - when start
     * @param {Object} other - The other colliding object
     */
    onCollisionStart(other) {
        for (let i in this.components) {
            if (this.components[i].active) {
                if (this.components[i].onCollisionStart) {
                    this.components[i].onCollisionStart(this, other);
                }
            }
        }
    }

    /**
     * On collision - when exit
     * @param {Object} other - The other colliding object
     */
    onCollisionExit(other) {
        for (let i in this.components) {
            if (this.components[i].active) {
                if (this.components[i].onCollision) {
                    this.components[i].onCollisionExit(this, other);
                }
            }
        }
    }
    
    /**
     * Detect mouse hover
     * @param {number} x - The x mouse value
     * @param {number} y - The y mouse value
     */
    detectMouse(x, y) {

        const camera = Camera.main;

        // Detect Position
        if (x / camera.scale <= this.x + this.width / 2 - camera.x  &&
            x / camera.scale >= this.x - this.width / 2 - camera.x) {

            if (y / camera.scale <= this.y + this.height / 2 - camera.y &&
            y / camera.scale >= this.y - this.height / 2 - camera.y) {

                return true;
            }
        }

        return false;
    }
    
    /**
     * Detects sides for editor resizing
     * @param {number} x - The x mouse value
     * @param {number} y - The y mouse value
     * @return {boolean} side - The detection side
     */
    detectSide(x, y) {

        const camera = Camera.main;
        const tolerance = 1+2*(1/camera.scale);
        
        // Right side
        if (x / camera.scale >= this.x + this.width / 2 - camera.x - tolerance) {
            if (y / camera.scale <= this.y - this.height / 2 - camera.y + tolerance) {
                return 'right-top';
            }
            else if (y / camera.scale >= this.y + this.height / 2 - camera.y - tolerance) {
                return 'right-bottom';
            }
            return 'right';
        }
        // Left side
        else if (x / camera.scale <= this.x - this.width / 2 - camera.x + tolerance) {
            if (y / camera.scale <= this.y - this.height / 2 - camera.y + tolerance) {
                return 'left-top';
            }
            else if (y / camera.scale >= this.y + this.height / 2 - camera.y - tolerance) {
                return 'left-bottom';
            }
            return 'left';
        }
        // Bottom side
        else if (y / camera.scale >= this.y + this.height / 2 - camera.y - tolerance) {
            return 'bottom';
        }
        // Top side
        else if (y / camera.scale <= this.y - this.height / 2 - camera.y + tolerance) {
            return 'top';
        }
            
            return false;
    }
    
    /**
     * Select object in editor with mouse
     * @param {CanvasRenderingContext2D} ctx - The current rendering context
     */
    select(ctx) {

        // ctx.lineWidth = this.components.appearance.weight;

        const camera = Camera.main;
        
        // const offsetX = (this.width % 2 == 0) ? 0.5 : 0;
        // const offsetY = (this.height % 2 == 0) ? 0.5 : 0;

        const offsetX = 0;
        const offsetY = 0;

        // ctx.save();

        // Zoom
        ctx.scale(camera.scale, camera.scale);

        ctx.beginPath();

        ctx.moveTo(
            this.x - this.width / 2 + offsetX - camera.x,
            this.y - this.height / 2 + offsetY - camera.y);
        ctx.lineTo(
            this.x + this.width / 2 + offsetX - camera.x,
            this.y - this.height / 2 + offsetY - camera.y);
        ctx.lineTo(
            this.x + this.width / 2 + offsetX - camera.x,
            this.y + this.height / 2 + offsetY - camera.y);
        ctx.lineTo(
            this.x - this.width / 2 + offsetX - camera.x,
            this.y + this.height / 2 + offsetY - camera.y);
        ctx.lineTo(
            this.x - this.width / 2 + offsetX - camera.x,
            this.y - this.height / 2 + offsetY - camera.y);

        ctx.lineWidth = 1;
        ctx.strokeStyle = '#339af0';
        ctx.stroke();

        // Reset zoom
        ctx.scale(1 / camera.scale, 1 / camera.scale);
    }
    
    /**
     * Create image of the object in editor resources window
     * @param {CanvasRenderingContext2D} ctx - The current rendering context
     * @return {Image} img - The image
     */
    createImage(ctx) {
        
        const canvas = document.createElement('canvas'); // offscreen canvas
        const camera = Camera.main;

        Graphics.initContext(canvas.getContext('2d'));

        canvas.width = this.width;
        canvas.height = this.height;

        let x = this.x;
        let y = this.y;

        this.x = this.width / 2;
        this.y = this.height / 2;

        let dx = camera.x;
        let dy = camera.y;

        camera.x = canvas.width / 2;
        camera.y = canvas.height / 2;

        this.draw(); // draw the image

        const src = canvas.toDataURL('image/png');

        this.x = x;
        this.y = y;
        camera.x = dx;
        camera.y = dy;

        var img = document.createElement('img');
        img.setAttribute('src', src);
        img.style.maxWidth = '70px';
        img.style.maxHeight = '60px';

        this.image = img;
        
        Graphics.initContext(ctx); // reset current context
        
        // console.log(img);

        return img;
    }

    /**
     * Stringify the object
     * @return {string} JSON string - The object as a JSON string
     */
    stringify() {
        function replacer(key, value) {
            // console.log(key.charAt(0) + ' : ' + key);
            // Filtering out properties
            switch (key) {
                case 'image': break;
            }
            if (key[0] !== '_' && key[0] !== '$') {
                return value;
            }
        }
        return JSON.stringify(this, replacer);
    }

    /**
     * Parse the object JSON string
     * @param {string} JSON string - The object as a JSON string
     * @return {Object} JSON string - The object as a JSON string
     */
    parse(json) {
        return this.copy(JSON.parse(json));
    }
}