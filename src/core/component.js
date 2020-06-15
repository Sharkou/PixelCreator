import { Scene } from '/src/core/scene.js';

export class Component {

    static components = {};
    
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
            window.properties.add(current); // mise à jour des propriétés
            
        });

        document.getElementById('components').appendChild(li);
    }
}

window.Component = Component;