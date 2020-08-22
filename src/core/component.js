import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Texture } from '/src/graphics/texture.js';
import { Circle } from '/src/graphics/circle.js';
import { Rect } from '/src/graphics/rect.js';
import { Light } from '/src/graphics/light.js';
import { Map } from '/src/graphics/map.js';
import { Animation } from '/src/anim/animation.js';
import { Animator } from '/src/anim/animator.js';
import { Collider, RectCollider, CircleCollider } from '/src/physics/collider.js';
import { Controller } from '/src/physics/controller.js';
import { Rotator } from '/src/physics/rotator.js';

export class Component {

    static components = {};
    static properties;

    static init(properties = null) {
        this.properties = properties;

        // Components init
        Component.add(Camera, 'fas fa-camera-movie', 'camera');

        Component.add(Texture, 'fas fa-file-image', 'graphics');
        Component.add(Circle, 'fad fa-circle', 'graphics');
        Component.add(Rect, 'fad fa-rectangle-wide', 'graphics');
        // Component.add(Light, 'fad fa-circle', 'graphics');
        // Component.add(Map, 'fad fa-circle', 'graphics');

        // Component.add(Animation, 'far fa-images', 'anim');
        // Component.add(Animator, 'far fa-images', 'anim');

        Component.add(Collider, 'far fa-arrow-to-right', 'physics');

        // TODO: Replace by a list
        // Component.add(RectCollider, 'far fa-arrow-to-right', 'physics');
        // Component.add(CircleCollider, 'far fa-arrow-to-right', 'physics');

        Component.add(Controller, 'fas fa-gamepad', 'physics');
        Component.add(Rotator, 'far fa-sync', 'physics');
}
    
    /**
     * Add component to list
     * @static
     * @param {Object} component - The component
     * @param {string} iconClasses - The icon classes
     * @param {string} category - The component category
     */
    static add(component, iconClasses, category = '') {

        // Add component to array
        this.components[component.name] = component;

        // Editor view
        if (document.getElementById('components')) {
            this.appendChild(component, iconClasses, category);
        }
    }

    static appendChild(component, iconClasses, category) {

        const li = document.createElement('li');
        const i = document.createElement('i');
        const span = document.createElement('span');
        const name = component.name;

        li.classList.add('component');
        li.id = name.toLowerCase();

        span.classList.add('object-text');
        span.textContent = name;

        const iconsArray = iconClasses.split(' ');
        i.classList.add(...iconsArray);

        li.appendChild(i);
        li.appendChild(span);

        li.addEventListener('click', e => {

            const component = new this.components[name]();
            const current = Scene.main.current;
        
            current.addComponent(component);
            this.properties.add(current); // mise à jour des propriétés
            
        });

        document.getElementById('components').appendChild(li);
    }
}