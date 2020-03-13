import { Time } from '/src/time/time.js';

export class Animation {
    
    /**
     * Initialize the component
     * @constructor
     * @param {Array} frames - frames to display
     * @param {number} speed - Go to next frame each {speed} ms
     */
    constructor(frames = null, speed = 100) {
        
        this.frames = frames;
        this.speed = speed;
        this.end = false;
        this.i = 0; // current frame        
        this.last = Time.now();
    }
    
    /**
     * Update the component
     * @update
     */
    update(self, flip = false) {
        
        let texture = self.components.texture;
        
        if ((Time.now() - this.last) >= this.speed) {
            
            this.i = (this.i + 1) % this.frames.length;
            
            this.last = Time.now();
        }
        
        this.end = this.frames.length == this.i + 1;
        
        texture.image = this.frames[this.i];
        texture.flip = flip;
    }
}

window.Animation = Animation;