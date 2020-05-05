import { Scene } from '/src/core/scene.js';
import { System } from '/src/core/system.js';
import { Project } from '/editor/windows/project.js';

export class Properties {

    /**
     * Initialize properties
     * @constructor
     * @param {HTMLElement} node - The HTML element
     * @param {Scene} scene - The current scene
     */
    constructor(node, scene) {

        this.node = document.getElementById(node);
        this.scene = scene;
        
        this.scene.addEventListener('setCurrentObject', obj => this.add(obj));

        System.addEventListener('setProperty', data => {
            // Update properties
            if (scene.current) {
                if (scene.current == data.component || scene.current.contains(data.component)) {
                    this.updateObjectProperties(data);
                    this.updateComponentsProperties(data);
                }
            }
        });

        this.node.addEventListener('dragover', function(e) {
            e.preventDefault(); // annule l'interdiction de "drop"
            this.classList.add('drop_hover');
        }, false);

        this.node.addEventListener('dragleave', function() {
            this.classList.remove('drop_hover');
        });

        this.node.addEventListener('dragend', function() {
            this.classList.remove('drop_hover');
        });

        this.node.addEventListener('drop', function(e) {
            e.preventDefault();
            var id = e.dataTransfer.getData('text');
            
            this.classList.remove('drop_hover');
            
            // Instanciation de la classe du composant
            var component = new Project.resources[id].data();
            
            scene.current.addComponent(component);
            
            // Update properties
            if (scene.current) {
                this.add(scene.current);
            }
        });
    }

    /**
     * Add object to properties
     * @param {Object} obj - The object
     */
    add(obj) {

        this.clear();

        if (obj) {

            this.node.appendChild(this.createObjectView(obj));

            for (let id in obj.components) {
                this.node.appendChild(this.createComponentView(obj.components[id]));
            }

            this.updateObjectProperties();
            this.updateComponentsProperties();
        }
    }
    
    /**
     * Clear properties
     */
    clear() {
        while (this.node.firstChild) {
            this.node.removeChild(this.node.firstChild);
        }
    }

    /**
     * Add component to object properties
     * @param {Object} component - The component
     */
    addComponent(component) {

        
    }
    
    /**
     * Update current object
     * @param {Element} el - The input element
     */
    updateCurrentObject(el) {

        // Object properties
        if (el.parentElement.classList.contains('object')) {
            let type = typeof this.scene.current[el.id];
            this.scene.current[el.id] = (type === 'number' ? parseFloat(el.value, 10) : el.value);;
        }

        // Component properties
        else {
            let p = (el.id).split('.');
            let component = this.scene.current.components[p[0]];
            let type = typeof component[p[1]];

            component[p[1]] = (type === 'number' ? parseFloat(el.value, 10) : el.value);
        }
    }
    
    /**
     * Update object properties in editor
     * @param {Object} data - The object data
     */
    updateObjectProperties(data) {
        // const p = data.prop;
        for (let p in this.scene.current) {
            const type = typeof this.scene.current[p];
            if (type === 'number' || type === 'string') {
                p = (p[0] === '_' ? p.substring(1, p.length) : p);
                const value = this.scene.current[p];
                const el = document.getElementsByClassName(this.scene.current.id + '-' + p);
                for (let i = 0; i < el.length; i++) {
                    if (el[i] !== document.activeElement) {
                        if (el[i].nodeName === 'INPUT') {
                            el[i].value = (type === 'string' ? value : parseInt(value, 10));
                        }
                        else {
                            el[i].textContent = (type === 'string' ? value : parseInt(value, 10));
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Update object components properties in editor
     */
    updateComponentsProperties(data) {
        for (var c in this.scene.current.components) {
            for (var p in this.scene.current.components[c]) {
                var value = this.scene.current.components[c][p];
                var e = document.getElementsByClassName(this.scene.current.id + '-' + c + '.' + p); // example : id-root.layer
                for (var i = 0; i < e.length; i++) {
                    if (e[i].nodeName === 'INPUT') {
                        e[i].value = value;
                    }
                    else {
                        e[i].innerHTML = value;
                    }
                }
            }
        }
    }

    /**
     * Create a view of object root
     * @param {Object} obj - The object
     * @return {Element} li - The DOM Element of the object
     */
    createObjectView(obj) {

        let li = document.createElement('li');

        // if (obj.name) li.classList.add(obj.name);
        
        li.classList.add('object');
        
        // For each properties of object
        for (let p in obj) {
            
            if (typeof obj[p] !== 'function') {

                if (p.charAt(0) === '_') continue;

                const id = p;

                switch (p) {
                    case 'id': break;
                    // case 'rotation': break;
                    case 'scale': break;
                    case 'static': break;
                    case 'type': break;
                    case 'active': break;
                    case 'visible': break;
                    case 'lock': break;
                    case 'image': break;
                    case 'parent': break;
                    case 'components': break;
                    case 'childs': break;
                    default: this.createProperty(li, p, obj[p], id);
                }

                /*var props = Object.keys(obj[p]);
                var id1 = obj.name + '.' + 'position.' + props[0];
                var id2 = obj.name + '.' + 'position.' + props[1];
                this.appendTransform(li, 'Position', props[0], props[1], 'axis', 'number', id1, id2);*/
            }
        }
        
        return li;
    }

    /**
     * Create a view of component
     * @param {Object} obj - The component
     * @return {Element} li - The DOM Element of the component
     */
    createComponentView(obj) {
        
        // Component containers
        let li = document.createElement('li');
        // let div = document.createElement('div');

        li.classList.add(obj.name);

        // Append div in object
        // li.appendChild(div);
        
        // Change reference of div
        // div = li.getElementsByTagName('div')[0];
        
        // For each properties in component
        for (let p in obj) {
            
            if (typeof obj[p] !== 'function') {

                // Create name node of the object
                if (p === 'name') {
                    this.appendName(li, obj);
                    continue;
                }

                if (p.charAt(0) === '_') continue;
                
                const id = obj.name + '.' + p;

                // Create new property
                this.createProperty(li, p, obj[p], id);
            }
        }
        
        return li;
    }

    /**
     * Create Element property
     * @param {Element} li - The parent element
     * @param {string} p - The property name
     * @param {any} value - The property value
     * @param {string} id - The id of property
     */
    createProperty(li, p, value, id) {

        // Prevent some property creation
        switch (p) {
            case 'active': return;
        }

        // Get property type
        switch (typeof value) {

            case 'number': {
                let type = 'number';
                this.appendElement(li, p, type, id);
                break;
            }
                
            case 'boolean': {
                let type = 'checkbox';
                this.appendElement(li, p, type, id);
                break;
            }
                
            case 'string': {
                let type = (value[0] === '#') ? 'color' : 'text'; // si c'est une couleur en hexa
                this.appendElement(li, p, type, id);
                break;
            }
            
            case 'object': {

                if (!value) break; // null value

                switch (p.constructor.name) {

                    case 'Color': {
                        let type = 'color';
                        this.appendElement(li, p, type, id);
                        break;
                    }
                        
                    case 'Range': {
                        // TODO : Range property
                        break;
                    }
                        
                    case 'Array': {
                        // TODO : Array property
                        this.appendSelect(li, p, value);
                        break;
                    }
                    
                    case 'Enumeration': {
                        // TODO : Enum property
                        break;
                    }
                        
                    case 'Image': {
                        // TODO : Image property
                        break;
                    }
                        
                    case 'Button': {
                        // TODO : Button property
                        break;
                    }
                    
                    default: {
                        // TODO : Another object property
                        let type = 'text';
                        this.appendElement(li, p, type, id);
                        break;
                    }
                }

                break;
            }
                
            default: {
                let type = 'text';
                this.appendElement(li, p, type, id);
                break;
            }
        }
    }

    /**
     * Apprend element in div
     * @param {Element} div - The parent element
     * @param {Object} content - The content of property
     * @param {string} type - The type of content
     * @param {string} id - The id of property
     */
    appendElement(div, content, type, id) {
        let span = this.createSpan(content);
        let input = this.createInput(type, id);
        let br = document.createElement('br');
        div.appendChild(span);
        div.appendChild(input);
        div.appendChild(br);
    }

    createComponentName(name) {
        let div = document.createElement('h3');
        let text = document.createTextNode(capitalizeFirstLetter(name));
        div.appendChild(text);
        // div.classList.add('label');
        div.classList.add('component');
        return div;
    }
    
    createIcon(name) {
        let i = document.createElement('i');
        // let text = document.createTextNode(name);
        // i.appendChild(text);
        i.classList.add('material-icons');
        i.classList.add(name);
        return i;
    }
    
    createDiv(content) {
        let div = document.createElement('div');
        let text = document.createTextNode(capitalizeFirstLetter(content));
        div.appendChild(text);
        div.classList.add('label');
        return div;
    }
    
    createSpan(content) {
        let span = document.createElement('span');
        let text = document.createTextNode(capitalizeFirstLetter(content));
        span.appendChild(text);
        span.classList.add('label');
        return span;
    }
    
    createInput(type, id, _class) {
        let input = document.createElement('input');
        input.setAttribute('type', type);

        if (type === 'number') {
            input.setAttribute('step', 'any');
            // input.setAttribute('pattern', '[0-9]+([\.,][0-9]+)?');
            // input.setAttribute('lang', 'en-US');
        }
        
        input.setAttribute('id', id);
        input.setAttribute('class', this.scene.current.id + '-' + id);
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('autocomplete', 'off');
        
        // input.setAttribute('onkeypress', 'validate(this, event)');
        input.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });
        
        // input.setAttribute('oninput', 'Properties.updateCurrentObject(this)');
        input.addEventListener('input', e => {
            this.updateCurrentObject(e.target);
            // this.updateObjectProperties();
        });
        
        if(_class) {
            input.classList.add(_class);
        }        
        return input;
    }
    
    createLabel(content, _class) {
        let label = document.createElement('label');
        let text = document.createTextNode(capitalizeFirstLetter(content));
        label.appendChild(text);
        if (_class) {
            label.setAttribute('class', _class);
        }
        return label;
    }
    
    createSelect(values) {
        let select = document.createElement('select');
        let options = [];
        for (let i = 0; i < values.length; i++) {
            let option = document.createElement('option');
            let text = document.createTextNode(values[i]);
            option.appendChild(text);
            option.setAttribute('value', values[i]);
            select.appendChild(option);
        }
        return select;
    }
    
    appendName(li, obj) {
        
        const scene = Scene.main;
        const name = this.createComponentName(obj.name);
        
        // Component reference
        let component = obj; // scene.current.components[li.classList[0]];

        switch (component.name) {

        }
        
        // let icon_component = this.createIcon(name.textContent.toLocaleLowerCase());
        
        // Delete feature
        let icon_delete = this.createIcon('delete');
        icon_delete.title = 'Delete';
        
        // Suppression du composant
        icon_delete.addEventListener('click', e => {
            let componentName = e.target.parentNode.textContent.toLowerCase();
            scene.current.removeComponent(scene.current.components[componentName]);
            
            // Mise à jour des propriétés
            this.add(scene.current);
        });
        
        // Visibility feature
        let icon_visibility = this.createIcon('visibility');
        icon_visibility.title = 'Visibility';
        icon_visibility.setAttribute('data-content', component.active ? 'visibility' : 'visibility_off');
        
        // Désactivation du composant
        icon_visibility.addEventListener('click', (e) => {
            component.active = !component.active;
            icon_visibility.setAttribute('data-content', component.active ? 'visibility' : 'visibility_off');
        });
        
        // var icon_edit = this.createIcon('edit');
        let br = document.createElement('br');
        let hr = document.createElement('hr');
        // li.insertBefore(hr, li.firstChild);
        // li.insertBefore(br, li.firstChild); // br supprimé        
        name.appendChild(icon_delete);
        name.appendChild(icon_visibility);
        // name.appendChild(icon_edit);
        // li.insertBefore(icon_edit, li.firstChild);
        
        // Ajout du nom du composant
        li.insertBefore(name, li.firstChild);
        
        // Ajout de l'icône
        // li.insertBefore(icon_component, li.firstChild);
    }
    
    appendSelect(li, content, values) {
        let span = this.createSpan(content);
        let select = this.createSelect(values);
        let br = document.createElement('br');
        li.appendChild(span);
        li.appendChild(select);
        li.appendChild(br);
    }
    
    appendTransform(li, content, content1, content2, labelClass, inputType, id1, id2) {
        let span = this.createSpan(content);
        let label1 = this.createLabel(content1, labelClass);
        let label2 = this.createLabel(content2, labelClass);
        let input1 = this.createInput(inputType, id1, inputType);
        let input2 = this.createInput(inputType, id2, inputType);
        let br = document.createElement('br');
        li.appendChild(span);
        li.appendChild(label1);
        li.appendChild(input1);
        li.appendChild(label2);
        li.appendChild(input2);
        li.appendChild(br);
    }
}

function capitalizeFirstLetter(text) {
    return text.replace('_', ' ')
        .toLowerCase()
        .split(' ')
        .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
        .join(' ');
    // return text.charAt(0).toUpperCase() + text.slice(1);
}