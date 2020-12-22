import { System } from '/src/core/system.js';
import { Loader } from '/src/core/loader.js';
import { Scene } from '/src/core/scene.js';
import { Object } from '/src/core/object.js';
// import { Resource } from '/src/core/resource.js';
import { Sorter } from '/editor/misc/sorter.js';
import { Editor } from '/editor/scripting/editor.js';

export class Project {
    
    /**
     * Initialize project window and resources
     * @constructor
     * @param {HTMLElement} node - The HTML element
     * @param {Scene} scene - The current scene
     */
    constructor(node, scene) {

        Project.main = this;
        
        this.node = document.getElementById(node);
        this.scene = scene;
        this.files = {};
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
            Loader.uploadFiles(files);
            
            // Prefab creation
            if (Sorter.draggedElement) {
                
                // Instance reference
                const id = Sorter.draggedElement.id;
                const instance = this.scene.objects[id];
                
                // console.log(Scene.objects[id]);
                
                // Création du prefab
                let prefab = new Object(instance.name);
                prefab.copy(instance);
                prefab.id = System.createID();
                prefab.type = 'prefab';
                prefab.createImage();
                console.log(prefab);
                
                this.add(prefab);
            }
            
        }, false);

        // Upload files
        this.input.addEventListener('change', e => {
            let files = this.input.files;
            Loader.uploadFiles(files);
        });

        // Load file
        System.addEventListener('load_file', file => {
            this.add(file);
        });

        // Upload file to server
        System.addEventListener('upload_file', file => {
            this.add(file);
        });

        // Remove file from project
        System.addEventListener('remove_file', file => {
            this.remove(file, false);
        });
    }

    /**
     * Get currently open file
     * @return {File} file - The currently open file
     */
    get current() {
        return this._current;
    }

    /**
     * Set currently open file
     * @param {File} file - The currently open file
     */
    set current(file) {
        this._current = file;
        const type = file?.type;

        // Load file data
        if (Loader.allowedScriptsTypes.indexOf(type) !== -1) {
            // let name = file[obj.id].name.replace(/\s/g, '');
            // let sources = file.value.replace(/^class [a-zA-Z0-9_$]* {/, `class ${name} {`);
            Editor.current = file;
            Editor.setValue(file.value);
        } else if (type === 'px') {
            document.getElementById('blueprint-btn').click();
        }

        System.dispatchEvent('setCurrentFile', file);
    }

    /**
     * Get current project
     * @return {Project} project - The current project
     */
    static get main() {        
        return this._main;
    }
    
    /**
     * Set current project
     * @param {Project} project - The current project
     */
    static set main(scene) {        
        this._main = scene;
    }

    /**
     * Init the project
     * @param {array} files - The project files
     */
    init(files) {

        if (files) {
            for (let file of files) {
                this.add(file);
            }
        }
        
        this.current = null;
    }

    /**
     * Add file to files list
     * @param {File} file - The file
     */
    add(file, dispatch = true) {

        if (!file) return;

        this.node.appendChild(this.createView(file));
        this.files[file.id] = file;

        // this.scene.current = file;
        // this.current = file;

        // if (dispatch) {
        //     System.dispatchEvent('add_resource', file);
        // }
    }

    /**
     * Remove file to files list
     * @param {File} file - The file
     */
    remove(file, dispatch = true) {

        this.node.removeChild(document.getElementById(file.id));
        delete this.files[file.id];

        // if (dispatch) {
        //     Loader.delete(file);
        //     System.dispatchEvent('remove_resource', file);
        // }
    }
    
    /**
     * Update name object from HTML Element
     * @param {HTMLElement} e - The HTML Element
     */
    updateName(e) {
        this.files[e.target.parentNode.id].name = e.target.textContent;
        Loader.files[e.target.parentNode.id].$name = e.target.textContent;
    }

    /**
     * Create thumbnail from file
     * @param {File} file - The file/blob
     * @param {Function} callback - The callback function
     */
    createThumbnail(file, callback) {

        return new Promise(resolve => {
            
            var reader = new FileReader();

            // console.log(file);
            // console.log(reader);
            
            reader.addEventListener('load', function() {
                var img = new Image(); // document.createElement('img');
                // img.style.maxWidth = '70px';
                // img.style.maxHeight = '60px';
                img.src = this.result;

                resolve(img);
                
                // callback(img);
            });
            
            reader.readAsDataURL(file);
        });
    }

    /**
     * Create resource view
     * @param {File} file - The file to display
     * @return {HTMLElement} li - The li element
     */
    createView(file) {
        
        let li = document.createElement('li');
        li.setAttribute('id', file.id);
        
        // li.setAttribute('onmousedown', 'changeCurrent(file)');
        li.addEventListener('mouseup', () => {
            const type = file.type;
            /*if (type === 'js' || type === 'script') {
                this.lastScript = file;
                return;
            }*/
            this.scene.current = file;
            this.current = file;
        });
        
        li.addEventListener('dblclick', () => {
            let resource = this.files[file.id];
            let type = file.type;
            if (Loader.allowedScriptsTypes.indexOf(type) !== -1) {
                // this.lastScript = file;
                // let name = this.files[file.id].name.replace(/\s/g, '');
                // let sources = file.value.replace(/^class [a-zA-Z0-9_$]* {/, `class ${name} {`);
                // Compiler.open(file.id, file.name + '.js', sources);
                document.getElementById('script-btn').click();
                return;
            } else if (type === 'px') {
                document.getElementById('blueprint-btn').click();
            }
            this.scene.current = file;
            this.current = file;
            // document.getElementById('code-btn').click();
        });
        
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-type', file.type);
        
        // Ajout de l'ID dans le dataTransfer
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text', e.target.id);
            // TODO: Gérer les types pouvant afficher une image au drag
            if (file.image) {
                e.dataTransfer.setDragImage(file.image, 20, 20);
            }
        });
        
        // Ajout de l'image ou de l'icône
        if (Loader.allowedTypes.indexOf(file.type) !== -1) {
            if (Loader.allowedImagesTypes.indexOf(file.type) !== -1) {
                var figure = document.createElement('figure');
                figure.appendChild(file.image);
                var i = figure;
            } else if (Loader.allowedScriptsTypes.indexOf(file.type) !== -1) {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons');
                var icon = document.createTextNode('description');
                i.appendChild(icon);
            } else if (file.type === 'application/px' || file.type === 'px') {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons');
                var icon = document.createTextNode('settings_input_component');
                i.appendChild(icon);
            } else {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons list');
                var icon = document.createTextNode(file.type);
                i.appendChild(icon);
            }
        }
        
        else if (file.image) {
            var figure = document.createElement('figure');
            figure.appendChild(file.image);
            var i = figure;
        }
        
        else {
            var i = document.createElement('i');
            i.setAttribute('class', 'material-icons list');
            var icon = document.createTextNode(file.type);
            i.appendChild(icon);
        }
        
        var div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        div.setAttribute('spellcheck', 'false');
        
        div.addEventListener('input', (e) => {
            // Mise à jour du nom de la ressource
            this.updateName(e);
            
            // TODO: Mettre à jour l'image de la ressource
            // file.createImage();
        });
        
        // div.setAttribute('oninput', 'updateName(file)');
        
        // div.setAttribute('onblur', 'scrollBack(file)');
        div.addEventListener('blur', function(e) {        
            e.target.scrollLeft = 0;
        });
        
        // div.setAttribute('onkeypress', 'validate(file, event)');
        div.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });

        div.addEventListener('focusout', () => {
            window.getSelection().removeAllRanges();
        });
        
        div.setAttribute('class', file.id + '-name');
        let name = document.createTextNode(file.name);
        div.appendChild(name);
        
        li.appendChild(i);
        li.appendChild(div);
        
        return li;
    }
}