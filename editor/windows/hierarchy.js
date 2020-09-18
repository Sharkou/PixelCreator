import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Renderer } from '/src/core/renderer.js';
import { System } from '/src/core/system.js';
import { Sorter } from '/editor/misc/sorter.js';
import { Project } from '/editor/windows/project.js';

export class Hierarchy {

    /**
     * Initialize objects hierarchy
     * @constructor
     * @param {HTMLElement} node - The HTML element
     * @param {Scene} scene - The current scene
     */
    constructor(node, scene) {
        
        this.node = document.getElementById(node);
        this.scene = scene;

        System.addEventListener('add', obj => {
            this.add(obj);
        });

        System.addEventListener('instanciate', obj => {
            this.add(obj);
        });

        System.addEventListener('remove', obj => {
            this.remove(obj);
        });
        
        System.addEventListener('setCurrentObject', obj => {

            if (obj) {

                const e = document.getElementById(obj.id);
                if (e) this.setActive(e.id);
                
            } else {
                this.setActive();
            }
        });
    }
    
    /**
     * Add object to hierarchy
     * @param {Object} obj - The object to add
     */
    add(obj) {
        let last = this.node.appendChild(this.createView(obj));
        obj.createImage();
        Sorter.sort(last);
        // last.classList.add('active');
        this.setActive(last.id);
    }
    
    /**
     * Remove object to hierarchy
     * @param {Object} obj - The object to remove
     */
    remove(obj) {
        // this.parentNode.parentNode.removeChild(this.parentNode);
        this.node.removeChild(document.getElementById(obj.id));
    }
    
    /**
     * Change current object
     * @param {HTMLElement} e - The object HTML element
     */
    changeCurrent(e) {

        this.setActive(e.id);

        switch (e.parentNode.id) {

            case 'world-list':
                this.scene.current = this.scene.objects[e.id];
                break;

            case 'resources-list':
                this.scene.current = Project.resources[e.id];
                break;
        }
    }
    
    /**
     * Set active object
     * @param {string} id - The object ID
     */
    setActive(id) {       

        let actives = document.querySelectorAll('#world-list .active, #resources-list .active');

        if (actives) {
            for (var i = 0; i < actives.length; i++) {
                actives[i].className = actives[i].className.replace('active', '');
            }
        }

        if (id) {
            document.getElementById(id).classList.add('active');
        }
    }

    /**
     * Create hierarchy view
     * @param {Object} obj - The object to display
     * @return {HTMLElement} li - The li element
     */
    createView(obj) {

        const scene = this.scene;

        let li = document.createElement('li');
        li.setAttribute('id', obj.id);
        // li.setAttribute('onmousedown', 'changeCurrent(obj)');
        li.setAttribute('draggable', 'true');
        li.dataset.position = 0;
        
        li.addEventListener('dragstart', function(e) {
             e.dataTransfer.setData('text', e.target.id);
        });
        
        li.addEventListener('mouseup', () => {
            // this.changeCurrent(obj);
            scene.current = obj;
        });
        
        // Centrer sur l'objet double cliqué
        li.addEventListener('dblclick', () => {
            Camera.main.x = ~~(scene.current.x - (Renderer.main.width / 2) / Camera.main.scale);
            Camera.main.y = ~~(scene.current.y - (Renderer.main.height / 2) / Camera.main.scale);
        });
        
        // li.setAttribute('data-type', obj.type);

        // Icon type management

        const icon = document.createElement('i');

        // i.setAttribute('class', 'material-icons icon');
        // var icon = document.createTextNode('keyboard_arrow_right');
        // var icon = document.createTextNode(obj.icon);
        // i.appendChild(icon);

        switch (obj.type) {

            case 'object':
                icon.setAttribute('class', 'far fa-cube icon');
                break;

            case 'camera':
                icon.setAttribute('class', 'far fa-camera-movie icon');
                break;
                
            case 'prefab':
                icon.setAttribute('class', 'fad fa-cubes icon');
                break;

            case 'image':
                icon.setAttribute('class', 'far fa-image icon');
                break;

            case 'circle':
                icon.setAttribute('class', 'far fa-circle icon');
                break;

            case 'rectangle':
                icon.setAttribute('class', 'far fa-square icon');
                break;

            case 'light':
                icon.setAttribute('class', 'far fa-lightbulb icon');
                break;

            case 'particle':
                icon.setAttribute('class', 'fad fa-sun-dust icon');
                break;
        }
        
        var lock = document.createElement('i');
        lock.setAttribute('class', 'material-icons lock');
        lock.title = 'Lock';
        lock.setAttribute('data-content', 'lock_open');
        lock.addEventListener('click', function(e) {
            let obj = scene.objects[this.parentNode.id];
            obj.$lock = !obj.lock;            
            lock.setAttribute('data-content', obj.lock ? 'lock' : 'lock_open');
        });

        var visibility = document.createElement('i');
        visibility.setAttribute('class', 'material-icons visibility');
        visibility.title = 'Visibility';
        visibility.setAttribute('data-content', 'visibility');
        // var icon = document.createTextNode('visibility');
        // visibility.appendChild(icon);
        visibility.addEventListener('click', function() {
            let obj = scene.objects[this.parentNode.id];
            obj.$active = !obj.active;            
            visibility.setAttribute('data-content', obj.active ? 'visibility' : 'visibility_off');
        });

        var delete_icon = document.createElement('i');
        delete_icon.setAttribute('class', 'material-icons delete');
        delete_icon.title = 'Delete';
        // var icon = document.createTextNode('delete');
        // delete_icon.appendChild(icon);
        delete_icon.addEventListener('click', () => {
            scene.remove(obj);
            scene.current = null;
        });

        var div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        div.setAttribute('spellcheck', 'false');
        
        // div.setAttribute('oninput', 'updateName(obj)');
        div.addEventListener('input', function() {
            scene.updateName(this);
        });

        div.addEventListener('blur', function(e) {
            e.target.scrollLeft = 0;
        });
        
        // div.setAttribute('onkeypress', 'validate(obj, event)');
        div.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });

        div.addEventListener('dblclick', e => {
            e.stopPropagation();
        });

        div.addEventListener('focusout', () => {
            window.getSelection().removeAllRanges();
        });
        
        div.setAttribute('class', obj.id + '-name object-view');
        
        var name = document.createTextNode(obj.name);
        div.appendChild(name);

        li.appendChild(icon);
        li.appendChild(div);
        li.appendChild(delete_icon);
        li.appendChild(visibility);
        li.appendChild(lock);

        return li;
    }
}