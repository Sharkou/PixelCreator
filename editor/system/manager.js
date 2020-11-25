import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Texture } from '/src/graphics/texture.js';
import { CircleRenderer } from '/src/graphics/circle.js';
import { RectangleRenderer } from '/src/graphics/rectangle.js';
import { Light } from '/src/graphics/light.js';
import { Map } from '/src/graphics/map.js';
import { Animation } from '/src/anim/animation.js';
import { Animator } from '/src/anim/animator.js';
import { Collider, RectCollider, CircleCollider } from '/src/physics/collider.js';
import { Controller } from '/src/physics/controller.js';
import { Rotator } from '/src/physics/rotator.js';

export class Manager {

    constructor(properties = null) {
        this.properties = properties;
        this.components = {};

        // Components init
        this.addComponent(Camera, 'fas fa-camera-movie', 'camera');

        this.addComponent(Texture, 'fas fa-file-image', 'graphics');
        this.addComponent(CircleRenderer, 'fad fa-circle', 'graphics');
        this.addComponent(RectangleRenderer, 'fad fa-rectangle-wide', 'graphics');
        // this.addComponent(Light, 'fad fa-circle', 'graphics');
        // this.addComponent(Map, 'fad fa-circle', 'graphics');

        // this.addComponent(Animation, 'far fa-images', 'anim');
        // this.addComponent(Animator, 'far fa-images', 'anim');

        this.addComponent(Collider, 'far fa-arrow-to-right', 'physics');

        // TODO: Replace by a list
        // this.addComponent(RectCollider, 'far fa-arrow-to-right', 'physics');
        // this.addComponent(CircleCollider, 'far fa-arrow-to-right', 'physics');

        this.addComponent(Controller, 'fas fa-gamepad', 'physics');
        this.addComponent(Rotator, 'far fa-sync', 'physics');
}
    
    /**
     * Add component to list
     * @static
     * @param {Object} component - The component
     * @param {string} iconClasses - The icon classes
     * @param {string} category - The component category
     */
    addComponent(component, iconClasses, category = '') {

        // Add component to array
        this.components[component.name] = component;

        // Editor view
        if (document.getElementById('components')) {
            this.appendChild(component, iconClasses, category);
        }
    }

    appendChild(component, iconClasses, category) {

        const li = document.createElement('li');
        const i = document.createElement('i');
        const span = document.createElement('span');
        const name = component.name;

        li.classList.add('component');
        li.id = name; // .toLowerCase();

        span.classList.add('object-text');
        span.textContent = name.replace(/([A-Z])/g, ' $1').trim();

        const iconsArray = iconClasses.split(' ');
        i.classList.add(...iconsArray);

        li.appendChild(i);
        li.appendChild(span);

        li.addEventListener('mousedown', e => {

            const component = new this.components[name]();
            const current = Scene.main.current;
        
            current.addComponent(component);
            this.properties.add(current); // mise à jour des propriétés
            
        });

        document.getElementById('components').appendChild(li);
    }
}