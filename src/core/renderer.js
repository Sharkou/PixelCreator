import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Time } from '/src/time/time.js';
import { Graphics } from '/src/graphics/graphics.js';
import { Mouse } from '/src/input/mouse.js';
import { Dnd } from '/editor/system/dnd.js';

export class Renderer {
    
    /**
     * Initialize the renderer
     * @constructor
     * @param {number} width - The width
     * @param {number} height - The height
     * @param {Element} parent - The DOM Element parent of renderer
     */
    constructor(width, height, parent = document.body, pause = true) {
        
        this.width = width;
        this.height = height;
        this.ratio = 1;
        this.parent = parent;
        this.pause = pause;
        
        /*// Create canvas layers
        this.layers = {
            'background': this.createCanvas('background', 0),
            'map': this.createCanvas('map', 1),
            'default': this.createCanvas('default', 2),
            'gui': this.createCanvas('gui', 3)
        };
        
        // Append canvas to body
        for (let id in this.layers) {
            this.parent.appendChild(this.layers[id]);
        }*/
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.id = 'canvas';
        
        // Get context
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        
        this.parent.appendChild(this.canvas);
        
        // Store the canvas as an image texture
	    // this.image = new Image();
    }

    /**
     * Get current renderer
     * @return {Renderer} renderer - The current renderer
     */
    static get main() {
        return this._main;
    }
    
    /**
     * Set current renderer
     * @param {Renderer} renderer - The current renderer
     */
    static set main(renderer) {
        this._main = renderer;
    }
    
    /**
    * Create canvas from layer
    * @return {HTMLCanvasElement} canvas - The canvas
    */
    createCanvas(id, zIndex) {
        
        let canvas = document.createElement('canvas');
        
        canvas.id = id;
        canvas.style.zIndex = zIndex;
        
        canvas.width = this.width;
        canvas.height = this.height;
        
        // Get context
        canvas.ctx = canvas.getContext('2d');
        canvas.ctx.imageSmoothingEnabled = false;
        
        return canvas;
    }
    
    /**
     * Init the canvas renderer
     * @param {Scene} scene - The renderer scene
     * @param {Camera} camera - The renderer camera
     */
    init(scene, camera) {
        
        // Define current objects
        Scene.main = scene;
        Camera.main = camera; // set the camera as main
        Renderer.main = this;
        
        // Ratio of camera to renderer
        let widthRatio = this.width / camera.width;
        let heightRatio = this.height / camera.height;
        
        this.ratio = widthRatio > heightRatio ? heightRatio : widthRatio;
        
        // Resize canvas from page orientation (portrait or landscape)
        if (widthRatio < heightRatio) {
            this.canvas.width = this.width;
            this.height = this.canvas.height = camera.height * this.ratio;
        }

        else {
            this.width = this.canvas.width = camera.width * this.ratio;
            this.canvas.height = this.height;
        }

        this.ctx.imageSmoothingEnabled = false;
        
        /*for (let id in this.layers) {
            
            let canvas = this.layers[id];
            
            if (widthRatio < heightRatio) {
                canvas.width = this.width;
                this.height = canvas.height = camera.height * this.ratio;
            }

            else {
                this.width = canvas.width = camera.width * this.ratio;
                canvas.height = this.height;
            }

            canvas.ctx.imageSmoothingEnabled = false;
        }*/
    }
    
    /**
     * Render the scene
     * @param {Scene} scene - The renderer scene
     * @param {Camera} camera - The renderer camera
     */
    render(scene, camera) {
        
        /*// Init canvas layers
        for (let id in this.layers) {
            
            // Initialize graphics renderer context
            let canvas = this.layers[id];            
            let ctx = canvas.ctx;
            
            // Save the entire state of the canvas
            ctx.save();
            
            // Cleaning the canvas
            this.clear(canvas);
            
            // Project the camera
            ctx.scale(this.ratio, this.ratio);
            ctx.translate(-camera.x, -camera.y);

            // Straddle the pixels
            // canvas.ctx.translate(0.5, 0.5);
        }*/
        
        // Initialize graphics renderer context
        Graphics.initContext(this.ctx);
        
        // Save the entire state of the canvas
        this.ctx.save();
        
        // Cleaning the canvas
        this.clear(camera.components.camera.background); // #272727 // #333

        // Straddle the pixels
        this.ctx.translate(0.5, 0.5);

        // Sort objects by layer
        // let objects = Object.values(scene.objects);
        // objects.sort((a, b) => a.layer - b.layer);
        
        // Update objects
        for (let obj of Object.values(scene.objects).sort((a, b) => a.layer - b.layer)) {
            
            // Store current object
            // let obj = scene.objects[id];
            
            if (obj != undefined && obj != null && obj.active) {
                
                // if (!this.pause) {
                    obj.update(); // update the object
                // }

                // Si l'objet n'est pas verrouillé
                if (!obj.lock) {
                                
                    // Au survol d'un object
                    // if (!handler.drag && !handler.moveCamera) {

                        // S'il est sélectionné et que l'on détecte un de ses composants
                        if (scene.current == obj)
                        {
                            for (let c in obj.components)
                            {
                                let component = obj.components[c];
                                if (typeof component.detectMouse === "function" && typeof component.detectSide === "function")
                                {
                                    if (component.detectMouse(obj, Mouse.x, Mouse.y))
                                    {
                                        Dnd.hovering = true;
                                        let value = component.detectSide(obj, Mouse.x, Mouse.y);
                                        if (value)
                                        {
                                            // Si on redimensionne le composant
                                            Dnd.resize = value;
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        // si on détecte l'objet avec la souris
                        if (!Dnd.hovering && obj.detectMouse(Mouse.x, Mouse.y)) {
                            
                            // Si on redimensionne l'objet
                            Dnd.resize = obj.detectSide(Mouse.x, Mouse.y);
                            Dnd.hovering = true;
                        }
                    // }
                }

                // Initialize graphics renderer context
                // let ctx = this.layers[obj.layer].ctx;
                // Graphics.initContext(this.ctx);

                // Save the entire state of the canvas
                this.ctx.save();
                
                // Project the camera
                this.ctx.scale(this.ratio, this.ratio);
                this.ctx.translate(- camera.x, - camera.y);

                // Zoom
                this.ctx.translate(camera.x, camera.y);
                this.ctx.scale(camera.scale, camera.scale);
                this.ctx.translate(- camera.x, - camera.y);

                // Transform the object (apply rotation)
                this.ctx.translate(obj.x, obj.y);
                this.ctx.rotate(obj.rotation);
                this.ctx.scale(obj.scale, obj.scale);
                this.ctx.translate(-obj.x, -obj.y);

                if (obj.visible) {
                    obj.draw(); // draw the object
                }

                // Restore the saved state of the canvas
                this.ctx.restore();

                // Si l'objet est sélectionné dans l'éditeur
                if (obj === scene.current && !obj.lock) {
                    obj.select(this.ctx); // affichage de la sélection
                }
            }
        }
        
        /*// Restore canvas layers
        for (let id in this.layers) {
            
            // Initialize graphics renderer context
            let ctx = this.layers[id].ctx;
            
            // Restore the saved state of the canvas
            ctx.restore();
        }*/
        
        // Restore the saved state of the canvas
        this.ctx.restore();

        // Calculation of delta-time
        Time.deltaTime = (Time.now() - Time.last) / (1000 / 60);
        Time.last = Time.current;
    }
    
    /**
     * Clear the canvas
     * @param {string} color - The clear color
     */
    clear(color) {
        
        if (color) {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
        
        else {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }
    
    /**
     * Resize canvas
     * @param {number} width - The resize width
     * @param {number} height - The resize height
     */
    resize(width, height) {
        
        this.width = width; // * Camera.main.zoom.x;
        this.height = height; // * Camera.main.zoom.y;
        
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.ctx.imageSmoothingEnabled = false;
        
        /*for (let id in this.layers) {
            
            let canvas = this.layers[id];
        
            canvas.width = this.width;
            canvas.height = this.height;

            canvas.ctx.imageSmoothingEnabled = false;
        }*/
    }
}