import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Object } from '/src/core/object.js';
import { Network } from '/src/network/network.js';
import { Sorter } from '/editor/misc/sorter.js';
import { Texture } from '/src/graphics/texture.js';

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
        this.allowedTypes = ['image/png', 'image/jpg', 'image/jped', 'image/gif', 'image/svg+xml', 'application/javascript', 'application/px'];
        this.allowedImagesTypes = ['image/png', 'image/jpg', 'image/jped', 'image/gif', 'image/svg+xml'];
        this.allowedScriptsTypes = ['application/javascript', 'application/px'];
        this.resources = {}; // = Project.resources = {};
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
     * Init the project
     * @param {array} resources - The project resources
     */
    init(resources) {
        for (let resource of resources) {
            this.addResource(resource);
        }
    }

    /**
     * Add object to resources list
     * @param {Object} obj - The object
     */
    addResource(obj, dispatch = true) {
        this.node.appendChild(this.createView(obj));        
        this.resources[obj.id] = obj;
        // this.scene.current = obj;

        if (dispatch) {
            System.dispatchEvent('add_resource', obj);
        }
    }

    /**
     * Remove resource to resources list
     * @param {Object} obj - The object
     */
    remove(obj, dispatch = true) {
        this.node.removeChild(document.getElementById(obj.id));
        delete this.resources[obj.id];

        if (dispatch) {
            System.dispatchEvent('remove_resource', obj);
        }
    }
    
    /**
     * Update name object from HTML Element
     * @param {HTMLElement} e - The HTML Element
     */
    updateName(e) {
        this.resources[e.target.parentNode.id].name = e.target.textContent;
    }

    /**
     * Get project resources
     * @return {object} resources - The resources
     */
    static get resources() {        
        return this._resources;
    }
    
    /**
     * Set project resources
     * @param {object} resources - The resources
     */
    static set resources(resources) {        
        this._resources = resources;
    }
    
    /**
     * Upload files in project
     * @param {Array} files - The files to add
     */
    uploadFiles(files) {
        let filesLen = files.length;
        let fileName = '';
        let fileType = '';
        let path = '/';

        console.log(files);

        for (let i = 0; i < filesLen; i++) {

            fileName = files[i].name;
            fileType = files[i].type;
            // fileType = fileName.split('.');
            // fileType = fileType[fileType.length - 1];

            let data = {
                name: fileName,
                type: fileType,
                path: path,
                value: null
            };

            // Upload to server
            let xhr = new XMLHttpRequest();

            xhr.open('POST', `${Network.protocol}://${Network.host}:${Network.port}`);

            xhr.upload.addEventListener('progress', function(e) {
                // progress.value = e.loaded;
                // progress.max = e.total;
            });

            xhr.addEventListener('load', function() {
                console.log('Upload terminé !');
            });

            // console.log(fileType)

            // Si c'est une image
            if (this.allowedTypes.indexOf(fileType) !== -1) {
                if (this.allowedImagesTypes.indexOf(fileType) !== -1) {
                    (i => {
                        createThumbnail(files[i], async img => {
                            const obj = new Object(fileName.split('.')[0]);
                            obj.type = fileType;
                            obj.image = img;
                            this.addResource(obj);

                            // fetch(img.src)
                            // .then(res => res.blob())
                            // .then(blob => blob.arrayBuffer())
                            // .then(buffer => {
                            //     buffer = new Uint8Array(buffer);
                            // });

                            data.value = img.src;
                            xhr.send(JSON.stringify(data));

                            // let form = new FormData();
                            // form.append('file', files[i]);
                            // form.append('path', path);
                            // xhr.send(form);

                            // this.addResource(new Resource(fileName.split('.')[0], fileType, e));
                        });
                    })(i);
                } else if (this.allowedScriptsTypes.indexOf(fileType) !== -1) {
                    console.log('ok');
                }
            }
        }
    }

    /**
     * Download project resources
     * @param {string} url - The project url
     */
    async download(url, dispatch = true) {
        const files = await fetch(url + '/data')
            .then(response => response.json())
            .catch(error => console.error);
        
        let resources = [];
        let progress = 0;
        
        console.log('Progress: ' + progress.toFixed(2) + '%');
        // console.log(files);

        for (let i = 1; i < files.length; i++) {
            const path = files[i].replace('\\', '/').split('/');
            const folder = path[0];
            const name = path[1];
            resources.push(
                await fetch(`${url}/${folder}/${name}`)
                    .then(response => response.blob())
                    .then(async blob => {
                        const url = URL.createObjectURL(blob);
                        const type = blob.type;
                        const img = await Texture.load(url);
                        const obj = new Object(name.split('.')[0]);
                        obj.type = type;
                        obj.image = img;
                        return obj;
                        // this.addResource(obj);
                    })
                    .catch(error => console.error)
            );
            progress = (i * 100) / (files.length - 1);
            console.log('Progress: ' + progress.toFixed(2) + '%');

            if (progress == 100) {
                return new Promise((resolve, reject) => {
                    resolve(resources);
                });
            }
        }

        // console.log(resources);

        if (dispatch) {
            System.dispatchEvent('load_resources', resources);
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
            } else if (type === 'px') {
                document.getElementById('blueprint-btn').click();
            }
            this.scene.current = obj;
            // document.getElementById('code-btn').click();
        });
        
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-type', obj.type);
        
        // Ajout de l'ID dans le dataTransfer
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text', e.target.id);
            // TODO: Gérer les types pouvant afficher une image au drag
            if (obj.type !== 'js') {
                e.dataTransfer.setDragImage(obj.image, 20, 20);
            }
        });
        
        // Ajout de l'image ou de l'icône
        if (this.allowedTypes.indexOf(obj.type) !== -1) {
            if (obj.type === 'image/jpg' || obj.type === 'image/png' || obj.type === 'image/jped' || obj.type === 'image/gif' || obj.type === 'image/svg+xml') {
                var figure = document.createElement('figure');
                figure.appendChild(obj.image);
                var i = figure;
            } else if (obj.type === 'application/javascript' || obj.type === 'script') {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons');
                var icon = document.createTextNode('description');
                i.appendChild(icon);
            } else if (obj.type === 'application/px' || obj.type === 'px') {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons');
                var icon = document.createTextNode('settings_input_component');
                i.appendChild(icon);
            } else {
                var i = document.createElement('i');
                i.setAttribute('class', 'material-icons list');
                var icon = document.createTextNode(obj.type);
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
            
            // TODO: Mettre à jour l'image de la ressource
            // obj.createImage();
        });
        
        // div.setAttribute('oninput', 'updateName(obj)');
        
        // div.setAttribute('onblur', 'scrollBack(obj)');
        div.addEventListener('blur', function(e) {        
            e.target.scrollLeft = 0;
        });
        
        // div.setAttribute('onkeypress', 'validate(obj, event)');
        div.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });

        div.addEventListener('focusout', () => {
            window.getSelection().removeAllRanges();
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

    // console.log(file);
    // console.log(reader);
    
    reader.addEventListener('load', function() {
        var img = new Image(); // document.createElement('img');
        img.style.maxWidth = '70px';
        img.style.maxHeight = '60px';
        img.src = this.result;
        
        callback(img);
    });
    
    reader.readAsDataURL(file);
}

function readAsArrayBuffer(file) {

    var reader = new FileReader();
    
    reader.addEventListener('load', function() {
        
    });
    
    reader.readAsArrayBuffer(file);
}