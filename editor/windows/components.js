import { Scene } from '/src/core/scene.js';

export class Components {

    static components = {};
    
    /**
     * Add component to list
     * @static
     * @param {Object} component - The component
     * @param {string} iconClasses - The icon classes
     */
    static add(component, iconClasses) {

        const li = document.createElement('li');
        const i = document.createElement('i');
        const span = document.createElement('span');
        const name = component.name;

        // Add component to array
        this.components[name] = component;

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

        this.appendChild(li);
    }

    static appendChild(li) {

        document.getElementById('components').appendChild(li);
    }
}