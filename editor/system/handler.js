/* Core Modules */
import { Object } from '/src/core/object.js';
import { Renderer } from '/src/core/renderer.js';
import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Mouse } from '/src/input/mouse.js';

/* Components */
import { Texture } from '/src/graphics/texture.js';
import { Circle } from '/src/graphics/circle.js';
import { Rect } from '/src/graphics/rect.js';
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
        this.canvas.addEventListener('mousedown', function(e) {
            Mouse.setButton(e.button);
            Mouse.down = true;
            Mouse.up = false;
        });

        this.canvas.addEventListener('mouseup', function(e) {
            Mouse.setButton(e.button);
            Mouse.down = false;
            Mouse.up = true;
        });
        
        // Move Mouse (onDragOver)
        this.canvas.addEventListener('mouseover', function(e) {
            // e.preventDefault();
        });
        
        this.canvas.addEventListener('dragover', function(e) {
            e.preventDefault(); // annule l'interdiction de "drop"
            this.classList.add('drop_hover');
        }, false);
        
        // Handle mouse movement on the canvas
        this.canvas.addEventListener('mousemove', function(e) {
            let thread;
            Mouse.move = true;
            
            if (thread) {
                clearTimeout(thread);
            }
            
            // on mouse stop
            thread = setTimeout(function() {
                Mouse.move = false;
            }, 100);
        });

        // Drop element in Scene
        this.canvas.addEventListener('drop', function(e) {

            e.preventDefault();
            
            Dnd.drag = false;

            const width = 40;
            const height = 40;
            
            let obj = new Object(
                'Empty',
                Mouse.x / camera.zoom + camera.x,
                Mouse.y / camera.zoom + camera.y,
                width,
                height
            );
            
            switch (e.dataTransfer.getData('text/plain')) {

                case 'Circle':
                    obj.name = 'Circle';
                    obj.addComponent(new Circle('#CC8844', 0.4));
                    break;
                    
                case 'Rectangle':
                    obj.name = 'Rectangle';
                    obj.addComponent(new Rect('#CC8844', 0.4));
                    break;
                    
                case 'Light':
                    obj.name = 'Light';
                    obj.addComponent(new Light());
                    break;
                    
                case 'Particle':
                    break;
                    
                // Drop d'une ressource
                default:
                    
                    // TODO : Gérer le drop d'une image depuis l'explorateur windows
                    
                    // Récupération de l'objet
                    let id = e.dataTransfer.getData('text/plain');
                    let resource = project.resources[id];
                    
                    // Association du nom
                    obj.name = resource.name;
                    
                    // Instanciation de l'image
                    if (resource.type === 'png' || 
                        resource.type === 'jpg' || 
                        resource.type === 'gif') {
                        
                        // Dimensions de l'image
                        obj.width = resource.image.naturalWidth;
                        obj.height = resource.image.naturalHeight;
                        
                        obj.addComponent(new Texture(resource.image));
                    }
                    
                    // Instanciation du prefab
                    else if (resource.type === 'prefab') {
                        
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
                    
                    break;
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
                        
                    // Detect Position
                    // if (o.detectMouse(Mouse.getMousePos(e).x, Mouse.getMousePos(e).y)) {
                    if (obj.detectMouse(Mouse.x, Mouse.y)) {
                        
                        // Quitte la fonction si l'objet est verrouillé
                        if (obj.lock || !obj.active) {
                            return;
                        }
                        
                        // Change current object
                        scene.current = obj;
                        
                        let side = obj.detectSide(Mouse.x, Mouse.y);
                        
                        // Redimensionnement
                        if (side) {
                            this.resizeObject = side;
                            this.lastX = obj.x;
                            this.lastY = obj.y;
                            this.lastWidth = obj.width;
                            this.lastHeight = obj.height;
                        }
                        
                        // Déplacement
                        else {
                            this.drag = true; // Start Drag
                            Dnd.setCursor('grabbing');

                            Mouse.offset.x = Mouse.x - scene.current.x - camera.x;
                            Mouse.offset.y = Mouse.y - scene.current.y - camera.y;
                        }
                    }
                }
                
                // Cancel selection
                if (!this.drag && !this.resizeObject) {
                    scene.current = null;
                }
            }
            
            // Move Scene
            else if (e.button === 2 || e.button === 1) { // Right or wheel button
                
                document.body.style.setProperty('cursor', 'move');
                
                this.moveCamera = true; // Start moving scene view
                
                // Start Mouse Position
                Mouse.lastPosition.x = Mouse.x + camera.x * camera.zoom;
                Mouse.lastPosition.y = Mouse.y + camera.y * camera.zoom;
                
                // camera.offset.x = camera.x;
                // camera.offset.y = camera.y;
            }
        });

        // Mouse Move on Scene
        this.canvas.addEventListener('mousemove', e => {
            
            // Position update
            Mouse.x = ~~Mouse.getMousePos(e).x;
            Mouse.y = ~~Mouse.getMousePos(e).y;
            
            // Ruler Update
            // Ruler.create(this.ctx);
            // Ruler.update(this.ctx, Mouse.x, Mouse.y);    
            
            // Default cursor
            /*if (!Objects.currentNode && !this.drag && !this.moveCamera) {
                Dnd.setCursor('default');
            }*/

            // Drag object
            if (scene.current !== null && this.drag) {
                
                // Move Object
                scene.current.x = Mouse.x - camera.x - Mouse.offset.x;
                scene.current.y = Mouse.y - camera.y - Mouse.offset.y;
            }
            
            // Resize object
            else if (scene.current !== null && this.resizeObject) {
                
                // Décalage pour le redimensionnement
                let offset = 0;
                
                switch (this.resizeObject) {
                    case 'right':
                        offset = Mouse.x - (this.lastX + this.lastWidth / 2) + camera.x;
                        scene.current.width = Math.abs(~~(this.lastWidth + offset));
                        scene.current.x = ~~(this.lastX + offset / 2);
                        break;
                        
                    case 'left':
                        offset = Mouse.x - (this.lastX - this.lastWidth / 2) + camera.x;
                        scene.current.width = Math.abs(~~(this.lastWidth - offset));
                        scene.current.x = ~~(this.lastX + offset / 2);
                        break;
                        
                    case 'bottom':
                        offset = Mouse.y - (this.lastY + this.lastHeight / 2) + camera.y;
                        scene.current.height = Math.abs(~~(this.lastHeight + offset));
                        scene.current.y = ~~(this.lastY + offset / 2);
                        break;
                        
                    case 'top':
                        offset = Mouse.y - (this.lastY - this.lastHeight / 2) + camera.y;
                        scene.current.height = Math.abs(~~(this.lastHeight - offset));
                        scene.current.y = ~~(this.lastY + offset / 2);
                        break;
                }
            }
            
            // Move Camera View
            else if (this.moveCamera) {
                camera.x = (- Mouse.x + Mouse.lastPosition.x) / camera.zoom;
                camera.y = (- Mouse.y + Mouse.lastPosition.y) / camera.zoom;
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
                    const scale = camera.zoom * zoom;

                    if (scale <= maxZ && scale >= minZ) {
                        // TODO : Perte de précision
                        camera.x -= Mouse.x / (scale * zoom) - Mouse.x / scale;
                        camera.y -= Mouse.y / (scale * zoom) - Mouse.y / scale;
                    }

                    camera.zoom = (e.deltaY < 0) ? Math.min(maxZ, scale) : Math.max(minZ, scale);
                }

            }, delay);
            
        });
    }
}