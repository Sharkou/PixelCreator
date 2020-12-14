/* Core Modules */
import { Object } from '/src/core/object.js';
import { System } from '/src/core/system.js';
import { Loader } from '/src/core/loader.js';
import { Renderer } from '/src/core/renderer.js';
import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Mouse } from '/src/input/mouse.js';

/* Components */
import { Texture } from '/src/graphics/texture.js';
import { CircleRenderer } from '/src/graphics/circle.js';
import { RectangleRenderer } from '/src/graphics/rectangle.js';
import { Light } from '/src/graphics/light.js';

/* Editor Modules */
import { Project } from '/editor/windows/project.js';
import { Dnd } from '/editor/system/dnd.js';

/** Class allow to handle interactions with the canvas */
export class Handler {
    
    /**
     * Initialize editor handling
     * @constructor
     * @param {Scene} scene - The current scene
     * @param {Camera} camera - The renderer camera
     * @param {Renderer} renderer - The current renderer
     */
    constructor(scene, camera, renderer, project) {

        this.canvas = renderer.canvas;
        this.ctx = renderer.ctx;

        this.drag = false;
        this.resizeObject = false;
        this.moveCamera = false;

        // Last coordinates for resize objects
        this.lastX = 0;
        this.lastY = 0;

        // Last size of object
        this.lastWidth = 0;
        this.lastHeight = 0;
        
        // Initialize events
        // this.canvas.addEventListener('mousedown', function(e) {
        //     Mouse.setButton(e.button);
        //     Mouse.down = true;
        //     Mouse.up = false;
        // });

        // this.canvas.addEventListener('mouseup', function(e) {
        //     Mouse.setButton(e.button);
        //     Mouse.down = false;
        //     Mouse.up = true;
        // });
        
        // Move Mouse (onDragOver)
        this.canvas.addEventListener('mouseover', function(e) {
            // e.preventDefault();
        });
        
        this.canvas.addEventListener('dragover', function(e) {
            e.preventDefault(); // annule l'interdiction de "drop"
            this.classList.add('drop_hover');
        }, false);
        
        // Handle mouse movement on the canvas
        // this.canvas.addEventListener('mousemove', function(e) {
        //     let thread;
        //     Mouse.move = true;
            
        //     if (thread) {
        //         clearTimeout(thread);
        //     }
            
        //     // on mouse stop
        //     thread = setTimeout(function() {
        //         Mouse.move = false;
        //     }, 100);
        // });

        // Drop element in Scene
        this.canvas.addEventListener('drop', function(e) {

            e.preventDefault();
            
            Dnd.drag = false;

            const width = 40;
            const height = 40;
            
            let obj = new Object(
                'Empty',
                Mouse.x / camera.scale + camera.x,
                Mouse.y / camera.scale + camera.y,
                width,
                height
            );

            obj.type = 'object';
            
            switch (e.dataTransfer.getData('text/plain')) {

                case 'object':
                    obj.name = 'Object';
                    obj.type = 'object';
                    break;

                case 'circle':
                    obj.name = 'Circle';
                    obj.type = 'object';
                    obj.addComponent(new CircleRenderer('#FFFFFF', 0.6), false);
                    break;
                    
                case 'rectangle':
                    obj.name = 'Rectangle';
                    obj.type = 'object';
                    obj.addComponent(new RectangleRenderer('#FFFFFF', 0.6), false);
                    break;
                    
                case 'light':
                    obj.name = 'Light';
                    obj.type = 'light';
                    obj.addComponent(new Light(), false);
                    break;
                    
                case 'camera':
                    obj.name = 'Camera';
                    obj.type = 'camera';
                    obj.width = 320;
                    obj.height = 180;
                    obj.addComponent(new Camera('#272727'), false);
                    break;
                
                case 'particle':
                    obj.name = 'Particle';
                    obj.type = 'particle';
                    obj.addComponent(new Particle(), false);
                    break;
                    
                // Drop d'une ressource
                default: {
                    
                    // TODO: Gérer le drop d'une image depuis l'explorateur windows
                    
                    // Récupération de l'objet
                    const id = e.dataTransfer.getData('text/plain');
                    const resource = project.resources[id];
                    const type = resource.type;
                    
                    // Association du nom
                    obj.name = resource.name;
                    obj.type = type;

                    // console.log(resource);

                    // Authorized file
                    if (Loader.allowedTypes.indexOf(type) !== -1) {

                        // Instanciation de l'image
                        if (Loader.allowedImagesTypes.indexOf(type) !== -1) {
                            const src = resource.id; // resource.value
                            const img = resource.image;
                            obj.image = img;
                            obj.type = 'image'; // resource.type;

                            // Dimensions de l'image
                            obj.width = img.naturalWidth;
                            obj.height = img.naturalHeight;
                            
                            obj.addComponent(new Texture(src));
                            // await Texture.load('assets/walk/adventurer-walk-00.png'),
                        }

                        // Instanciation du prefab
                        else if (resource.type === 'prefab') {

                            obj.type = 'prefab';
                            
                            // Dimensions du prefab
                            obj.width = resource.size.width;
                            obj.height = resource.size.height;
                            
                            // TODO : Duplication profonde
                            
                            // Duplication des composants
                            for (let name in resource.components) {

                                if (name !== 'root' && name !== 'position' && name !== 'size') {
                                    
                                    // console.log(resource.components[name]);
                                    
                                    // let component = Object.assign({}, resource.components[name]);
                                    
                                    // Création du composant
                                    let component = new window[name.charAt(0).toUpperCase() + name.slice(1)]();
                                    // let component = eval(`new ${name.charAt(0).toUpperCase() + name.slice(1)}()`);
                                    
                                    // Duplication des propriétés du composant
                                    for (let prop in resource.components[name]) {
                                        component[prop] = resource.components[name][prop];
                                    }
                                    
                                    obj.addComponent(component);
                                }

                            }
                        }
                    }
                }
            }
            
            scene.add(obj);
            
        }, false);

        // Mouse Click on Scene
        this.canvas.addEventListener('mousedown', e => {
            
            // Object Selection
            if (e.button === 0) { // Left button
                
                // Test each object selection
                for (let id in scene.objects) {
                    
                    let obj = scene.objects[id];
                    
                    // Quitte la fonction si l'objet est verrouillé
                    if (obj.lock || !obj.active) {
                        continue;
                    }
                    
                    // If obj is selected and one of his components is detected
                    if (scene.current == obj)
                    {
                        for (let c in obj.components)
                        {
                            let component = obj.components[c];
                            if (typeof component.detectMouse === "function" && typeof component.detectSide === "function")
                            {
                                if (component.detectMouse(obj, Mouse.x, Mouse.y))
                                {
                                    
                                    // Change current component
                                    scene.currentComponent = component;
                                    
                                    let side = component.detectSide(obj, Mouse.x, Mouse.y);

                                    // Resizing
                                    if (side) {
                                        // Si on redimensionne le composant
                                        this.resizeObject = side;
                                        this.lastX = obj.x+component.offsetX;
                                        this.lastY = obj.y+component.offsetY;
                                        this.lastWidth = component.width;
                                        this.lastHeight = component.height;
                                    }

                                    // Moving
                                    else {
                                        this.drag = true; // Start Drag
                                        Dnd.setCursor('grabbing');

                                        Mouse.offset.x = Mouse.x / camera.scale - scene.current.x - scene.currentComponent.offsetX - camera.x;
                                        Mouse.offset.y = Mouse.y / camera.scale - scene.current.y - scene.currentComponent.offsetY - camera.y;
                                    }

                                    break;
                                }
                            }
                        }
                    }
                    // if the object is detected
                    // if (o.detectMouse(Mouse.getMousePos(e).x, Mouse.getMousePos(e).y)) {
                    if (!scene.currentComponent && obj.detectMouse(Mouse.x, Mouse.y)) {
                        
                        // Change current object
                        scene.current = obj;
                        
                        let side = obj.detectSide(Mouse.x, Mouse.y);
                        
                        // Resizing
                        if (side) {
                            this.resizeObject = side;
                            this.lastX = obj.x;
                            this.lastY = obj.y;
                            this.lastWidth = obj.width;
                            this.lastHeight = obj.height;
                        }
                        
                        // Moving
                        else {
                            this.drag = true; // Start Drag
                            Dnd.setCursor('grabbing');

                            Mouse.offset.x = Mouse.x / camera.scale - scene.current.x - camera.x;
                            Mouse.offset.y = Mouse.y / camera.scale - scene.current.y - camera.y;
                        }
                        
                        break;
                    }
                }
                
                // Cancel selection
                if (!this.drag && !this.resizeObject) {
                    scene.current = null;
                    scene.currentComponent = null;
                }
            }
            
            // Move Scene
            else if (e.button === 2 || e.button === 1) { // Right or wheel button
                
                document.body.style.setProperty('cursor', 'move');
                
                this.moveCamera = true; // Start moving scene view
                
                // Start Mouse Position
                Mouse.lastPosition.x = Mouse.x + camera.x * camera.scale;
                Mouse.lastPosition.y = Mouse.y + camera.y * camera.scale;
                
                // camera.offset.x = camera.x;
                // camera.offset.y = camera.y;
            }
        });

        // Mouse Move on Scene
        this.canvas.addEventListener('mousemove', e => {

            // Data to dispatch
            // let object = null;
            // let component = null;
            // let prop = '';
            // let value = null;
            
            // Position update
            // Mouse.x = ~~Mouse.getMousePos(e).x;
            // Mouse.y = ~~Mouse.getMousePos(e).y;
            
            // Ruler Update
            // Ruler.create(this.ctx);
            // Ruler.update(this.ctx, Mouse.x, Mouse.y);    
            
            // Default cursor
            /*if (!Objects.currentNode && !this.drag && !this.moveCamera) {
                Dnd.setCursor('default');
            }*/

            // Drag object
            if (this.drag) {
                if (scene.currentComponent)
                {
                    // Move Component
                    scene.currentComponent.$offsetX = ~~(Mouse.x / camera.scale - camera.x - Mouse.offset.x - scene.current.x);
                    scene.currentComponent.$offsetY = ~~(Mouse.y / camera.scale - camera.y - Mouse.offset.y - scene.current.y);
                    // scene.current.syncComponentProperty(scene.currentComponent, 'offsetX', ~~(Mouse.x / camera.scale - camera.x - Mouse.offset.x - scene.current.x));
                    // scene.current.syncComponentProperty(scene.currentComponent, 'offsetY', ~~(Mouse.y / camera.scale - camera.y - Mouse.offset.y - scene.current.y));
                }
                else if (scene.current)
                {
                    // Move Object
                    scene.current.$x = Mouse.x / camera.scale - camera.x - Mouse.offset.x;
                    scene.current.$y = Mouse.y / camera.scale - camera.y - Mouse.offset.y;
                    // scene.current.syncProperty('x', Mouse.x / camera.scale - camera.x - Mouse.offset.x);
                    // scene.current.syncProperty('y', Mouse.y / camera.scale - camera.y - Mouse.offset.y);
                }
            }
            
            // Resize object
            else if (this.resizeObject) {
                if (scene.currentComponent)
                {
                    // Décalage pour le redimensionnement
                    let offset = 0;

                    // TODO: Factoriser dans des fonctions
                    // TODO: Synchroniser avec le serveur
                    switch (this.resizeObject) {
                        case 'right':
                            offset = Mouse.x / camera.scale - (this.lastX + this.lastWidth / 2) + camera.x;
                            scene.currentComponent.$width = Math.abs(~~(this.lastWidth + offset));
                            scene.currentComponent.$offsetX = ~~(this.lastX + offset / 2 - scene.current.x);
                            break;

                        case 'left':
                            offset = Mouse.x / camera.scale - (this.lastX - this.lastWidth / 2) + camera.x;
                            scene.currentComponent.$width = Math.abs(~~(this.lastWidth - offset));
                            scene.currentComponent.$offsetX = ~~(this.lastX + offset / 2 - scene.current.x);
                            break;

                        case 'bottom':
                            offset = Mouse.y / camera.scale - (this.lastY + this.lastHeight / 2) + camera.y;
                            scene.currentComponent.$height = Math.abs(~~(this.lastHeight + offset));
                            scene.currentComponent.$offsetY = ~~(this.lastY + offset / 2 - scene.current.y);
                            break;

                        case 'top':
                            offset = Mouse.y / camera.scale - (this.lastY - this.lastHeight / 2) + camera.y;
                            scene.currentComponent.$height = Math.abs(~~(this.lastHeight - offset));
                            scene.currentComponent.$offsetY = ~~(this.lastY + offset / 2 - scene.current.y);
                            break;

                        case 'right-top':
                            offset = Mouse.x / camera.scale - (this.lastX + this.lastWidth / 2) + camera.x;
                            scene.currentComponent.$width = Math.abs(~~(this.lastWidth + offset));
                            scene.currentComponent.$offsetX = ~~(this.lastX + offset / 2 - scene.current.x);
                            offset = Mouse.y / camera.scale - (this.lastY - this.lastHeight / 2) + camera.y;
                            scene.currentComponent.$height = Math.abs(~~(this.lastHeight - offset));
                            scene.currentComponent.$offsetY = ~~(this.lastY + offset / 2 - scene.current.y);
                            break;

                        case 'right-bottom':
                            offset = Mouse.x / camera.scale - (this.lastX + this.lastWidth / 2) + camera.x;
                            scene.currentComponent.$width = Math.abs(~~(this.lastWidth + offset));
                            scene.currentComponent.$offsetX = ~~(this.lastX + offset / 2 - scene.current.x);
                            offset = Mouse.y / camera.scale - (this.lastY + this.lastHeight / 2) + camera.y;
                            scene.currentComponent.$height = Math.abs(~~(this.lastHeight + offset));
                            scene.currentComponent.$offsetY = ~~(this.lastY + offset / 2 - scene.current.y);
                            break;

                        case 'left-top':
                            offset = Mouse.x / camera.scale - (this.lastX - this.lastWidth / 2) + camera.x;
                            scene.currentComponent.$width = Math.abs(~~(this.lastWidth - offset));
                            scene.currentComponent.$offsetX = ~~(this.lastX + offset / 2 - scene.current.x);
                            offset = Mouse.y / camera.scale - (this.lastY - this.lastHeight / 2) + camera.y;
                            scene.currentComponent.$height = Math.abs(~~(this.lastHeight - offset));
                            scene.currentComponent.$offsetY = ~~(this.lastY + offset / 2 - scene.current.y);
                            break;

                        case 'left-bottom':
                            offset = Mouse.x / camera.scale - (this.lastX - this.lastWidth / 2) + camera.x;
                            scene.currentComponent.$width = Math.abs(~~(this.lastWidth - offset));
                            scene.currentComponent.$offsetX = ~~(this.lastX + offset / 2 - scene.current.x);
                            offset = Mouse.y / camera.scale - (this.lastY + this.lastHeight / 2) + camera.y;
                            scene.currentComponent.$height = Math.abs(~~(this.lastHeight + offset));
                            scene.currentComponent.$offsetY = ~~(this.lastY + offset / 2 - scene.current.y);
                            break;
                    }
                }
                else if (scene.current)
                {
                    // Décalage pour le redimensionnement
                    let offset = 0;

                    // TODO: Factoriser dans des fonctions
                    switch (this.resizeObject) {
                        case 'right':
                            offset = Mouse.x / camera.scale - (this.lastX + this.lastWidth / 2) + camera.x;
                            scene.current.$width = Math.abs(~~(this.lastWidth + offset));
                            scene.current.$x = ~~(this.lastX + offset / 2);
                            break;

                        case 'left':
                            offset = Mouse.x / camera.scale - (this.lastX - this.lastWidth / 2) + camera.x;
                            scene.current.$width = Math.abs(~~(this.lastWidth - offset));
                            scene.current.$x = ~~(this.lastX + offset / 2);
                            break;

                        case 'bottom':
                            offset = Mouse.y / camera.scale - (this.lastY + this.lastHeight / 2) + camera.y;
                            scene.current.$height = Math.abs(~~(this.lastHeight + offset));
                            scene.current.$y = ~~(this.lastY + offset / 2);
                            break;

                        case 'top':
                            offset = Mouse.y / camera.scale - (this.lastY - this.lastHeight / 2) + camera.y;
                            scene.current.$height = Math.abs(~~(this.lastHeight - offset));
                            scene.current.$y = ~~(this.lastY + offset / 2);
                            break;

                        case 'right-top':
                            offset = Mouse.x / camera.scale - (this.lastX + this.lastWidth / 2) + camera.x;
                            scene.current.$width = Math.abs(~~(this.lastWidth + offset));
                            scene.current.$x = ~~(this.lastX + offset / 2);
                            offset = Mouse.y / camera.scale - (this.lastY - this.lastHeight / 2) + camera.y;
                            scene.current.$height = Math.abs(~~(this.lastHeight - offset));
                            scene.current.$y = ~~(this.lastY + offset / 2);
                            break;

                        case 'right-bottom':
                            offset = Mouse.x / camera.scale - (this.lastX + this.lastWidth / 2) + camera.x;
                            scene.current.$width = Math.abs(~~(this.lastWidth + offset));
                            scene.current.$x = ~~(this.lastX + offset / 2);
                            offset = Mouse.y / camera.scale - (this.lastY + this.lastHeight / 2) + camera.y;
                            scene.current.$height = Math.abs(~~(this.lastHeight + offset));
                            scene.current.$y = ~~(this.lastY + offset / 2);
                            break;

                        case 'left-top':
                            offset = Mouse.x / camera.scale - (this.lastX - this.lastWidth / 2) + camera.x;
                            scene.current.$width = Math.abs(~~(this.lastWidth - offset));
                            scene.current.$x = ~~(this.lastX + offset / 2);
                            offset = Mouse.y / camera.scale - (this.lastY - this.lastHeight / 2) + camera.y;
                            scene.current.$height = Math.abs(~~(this.lastHeight - offset));
                            scene.current.$y = ~~(this.lastY + offset / 2);
                            break;

                        case 'left-bottom':
                            offset = Mouse.x / camera.scale - (this.lastX - this.lastWidth / 2) + camera.x;
                            scene.current.$width = Math.abs(~~(this.lastWidth - offset));
                            scene.current.$x = ~~(this.lastX + offset / 2);
                            offset = Mouse.y / camera.scale - (this.lastY + this.lastHeight / 2) + camera.y;
                            scene.current.$height = Math.abs(~~(this.lastHeight + offset));
                            scene.current.$y = ~~(this.lastY + offset / 2);
                            break;
                    }
                }
            }
            
            // Move Camera View
            else if (this.moveCamera) {
                camera.x = (- Mouse.x + Mouse.lastPosition.x) / camera.scale;
                camera.y = (- Mouse.y + Mouse.lastPosition.y) / camera.scale;
            }
        });

        // Mouse Move on Drag
        this.canvas.addEventListener('dragover', e => {
            
            // Position update
            Mouse.x = ~~Mouse.getMousePos(e).x;
            Mouse.y = ~~Mouse.getMousePos(e).y;
            
        });

        // Mouse Up
        this.canvas.addEventListener('mouseup', e => {
            
            document.body.style.setProperty('cursor', 'default');
            
            if (e.button === 0) { // Left button
                scene.currentComponent = null;
                this.drag = false; // Stop dragging
                this.resizeObject = false; // Stop resize
            }
            
            else if (e.button === 2 || e.button === 1) { // Right or wheel button
                this.moveCamera = false; // Stop camera view move
            }
        });

        // Zoom
        this.canvas.addEventListener('mousewheel', e => {

            const iterations = 10;
            const intensity = 1.007;
            const delay = 10; // ms
            const maxZ = 10;
            const minZ = 0.2;
            
            // TODO: faire une interpolation linéaire
            const iterator = (function*() {
                for (let i = 0; i < iterations; i++) {
                    yield;
                }
            })();

            const scale = setInterval(() => {

                let next = iterator.next();

                if (next.done) {

                    clearInterval(scale);

                } else {

                    const zoom = (e.deltaY < 0) ? intensity : (1 / intensity);
                    const scale = camera.scale * zoom;

                    if (scale <= maxZ && scale >= minZ) {
                        // TODO : Perte de précision
                        camera.x -= Mouse.x / (scale * zoom) - Mouse.x / scale;
                        camera.y -= Mouse.y / (scale * zoom) - Mouse.y / scale;
                    }

                    camera.scale = (e.deltaY < 0) ? Math.min(maxZ, scale) : Math.max(minZ, scale);
                }

            }, delay);
            
        });
    }
}