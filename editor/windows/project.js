import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Object } from '/src/core/object.js';
import { Sorter } from '/editor/misc/sorter.js';

export class Project {
    
    /**
     * Initialize project window and resources
     * @constructor
     * @param {HTMLElement} node - The HTML element
     * @param {Scene} scene - The current scene
     */
    constructor(node, scene) {

        this.node = document.getElementById(node);
        this.scene = scene;
        this.allowedTypes = ['png', 'jpg', 'jped', 'gif', 'js'];
        this.resources = {};
        // this.lastScript = null;
        this.input = document.getElementById('upload-input');

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
        
        // Drop de fichiers ou d'instances dans les ressources
        this.node.addEventListener('drop', e => {
            e.preventDefault();
            e.target.classList.remove('drop_hover');
        
            // Upload files
            let files = e.dataTransfer.files;
            this.uploadFiles(files);
            
            // Prefab creation
            if (Sorter.draggedElement) {
                
                // ID de l'instance
                const id = Sorter.draggedElement.id;
                
                // console.log(Scene.objects[id]);
                
                // Création du prefab
                let prefab = new Resource(Scene.objects[id].name, 'prefab', Scene.objects[id].createImage());
                
                // console.log(prefab);
                
                // Dimensions du prefab
                prefab.size.width = Scene.objects[id].size.width;
                prefab.size.height = Scene.objects[id].size.height;
                
                // Duplication des composants
                for (let name in Scene.objects[id].components) {
                    
                    if (name !== 'root' && name !== 'position' && name !== 'size') {
                        
                        // let component = Object.create(Scene.main.components[name]);
                        // let component = Object.assign({}, Scene.main.components[name]);
                        
                        // Création du composant
                        let component = new window[name.charAt(0).toUpperCase() + name.slice(1)]();
                        
                        // Duplication des propriétés du composant
                        for (let prop in Scene.objects[id].components[name]) {
                            component[prop] = Scene.objects[id].components[name][prop];
                        }
                        
                        prefab.addComponent(component);
                    }
                    
                }
                
                // prefab.components = Object.assign({}, Scene.main.components);
                // prefab.components.position = null;
                // prefab.components = clone(Scene.main.components);
                
                this.addResource(prefab);
            }
            
        }, false);

        // Upload files
        this.input.addEventListener('change', e => {
            let files = this.input.files;
            this.uploadFiles(files);
        });
    }

    /**
     * Add object to resources list
     * @param {Object} obj - The object
     */
    addResource(obj) {
        this.node.appendChild(this.createView(obj));        
        this.resources[obj.id] = obj;
        this.scene.current = obj;
    }

    /**
     * Remove resource to resources list
     * @param {Object} obj - The object
     */
    remove(obj) {
        this.node.removeChild(document.getElementById(obj.id));
        delete this.resources[obj.id];
    }
    
    /**
     * Update name object from HTML Element
     * @param {HTMLElement} e - The HTML Element
     */
    updateName(e) {
        this.resources[e.target.parentNode.id].name = e.target.textContent;
    }
    
    /**
     * Upload files in project
     * @param {Array} files - The files to add
     */
    uploadFiles(files) {
        let filesLen = files.length;
        let fileType = '';

        for (let i = 0; i < filesLen; i++) {

            // const fileName = files[i].name.split('.')[0];

            fileType = files[i].name.split('.');
            fileType = fileType[fileType.length - 1];

            // Si c'est une image
            if (this.allowedTypes.indexOf(fileType) !== -1) {
                (i => {
                    createThumbnail(files[i], img => {
                        const obj = new Object(files[i].name.split('.')[0]);
                        obj.type = fileType;
                        obj.image = img;
                        this.addResource(obj);
                        // this.addResource(new Resource(files[i].name.split('.')[0], fileType, e));
                    });
                })(i);
            }
        }
    }

    /**
     * Create resource view
     * @param {Object} obj - The object to display
     * @return {HTMLElement} li - The li element
     */
    createView(obj) {
        
        let li = document.createElement('li');
        li.setAttribute('id', obj.id);
        
        // li.setAttribute('onmousedown', 'changeCurrent(obj)');
        li.addEventListener('mouseup', () => {
            let resource = this.resources[obj.id];
            let type = resource.type;
            /*if (type === 'js' || type === 'script') {
                this.lastScript = resource;
                return;
            }*/
            this.scene.current = obj;
        });
        
        li.addEventListener('dblclick', () => {
            let resource = this.resources[obj.id];
            let type = resource.type;
            if (type === 'js' || type === 'script') {
                // this.lastScript = resource;
                let name = this.resources[obj.id].name.replace(/\s/g, '');
                let sources = resource.data.toString().replace(/^class [a-zA-Z0-9_$]* {/, `class ${name} {`);
                Compiler.open(obj.id, resource.name + '.js', sources);
                return;
            }
            this.scene.current = obj;
            // document.getElementById('code-btn').click();
        });
        
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-type', obj.type);
        
        // Ajout de l'ID dans le dataTransfer
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text', e.target.id);
            // TODO : Gérer les types pouvant afficher une image au drag
            if (obj.type !== 'js') {
                e.dataTransfer.setDragImage(obj.image, 20, 20);
            }
        });
        
        // Ajout de l'image ou de l'icône
        if (this.allowedTypes.indexOf(obj.type) !== -1) {
            if (obj.type === 'jpg' || obj.type === 'png' || obj.type === 'jped' || obj.type === 'gif') {
                var figure = document.createElement('figure');
                figure.appendChild(obj.image);
                var i = figure;
            }
            else if (obj.type === 'js' || obj.type === 'script') {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons');
                var icon = document.createTextNode('description');
                i.appendChild(icon);
            }
        }
        
        else if (obj.image) {
            var figure = document.createElement('figure');
            figure.appendChild(obj.image);
            var i = figure;
        }
        
        else {
            var i = document.createElement('i');
            i.setAttribute('class', 'material-icons list');
            var icon = document.createTextNode(obj.type);
            i.appendChild(icon);
        }        
        
        var div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        div.setAttribute('spellcheck', 'false');
        
        div.addEventListener('input', (e) => {
            // Mise à jour du nom de la ressource
            this.updateName(e);
            
            // TODO : Mise à jour de l'image de la ressource
            // obj.createImage();
        });
        
        // div.setAttribute('oninput', 'updateName(obj)');
        
        // div.setAttribute('onblur', 'scrollBack(obj)');
        div.addEventListener('blur', function() {        
            obj.scrollLeft = 0;
        });
        
        // div.setAttribute('onkeypress', 'validate(obj, event)');
        div.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });
        
        div.setAttribute('class', obj.id + '-name');
        let name = document.createTextNode(obj.name);
        div.appendChild(name);
        
        li.appendChild(i);
        li.appendChild(div);
        
        return li;
    }
}

/**
 * Create thumbnail from file
 * @param {File} file - The file
 * @param {Function} callback - The callback function
 */
function createThumbnail(file, callback) {

    var reader = new FileReader();
    
    reader.addEventListener('load', function() {
        var img = new Image(); // document.createElement('img');
        img.style.maxWidth = '70px';
        img.style.maxHeight = '60px';
        img.src = this.result;
        
        callback(img);
    });
    
    reader.readAsDataURL(file);
}