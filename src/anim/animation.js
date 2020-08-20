import { Time } from '/src/time/time.js';
import { Component } from '/src/core/component.js';

export class Animation {
    
    #last;
    
    /**
     * Initialize the component
     * @constructor
     * @param {Array} frames - frames to display
     * @param {number} speed - Go to next frame each {speed} ms
     */
    constructor(frames = null, speed = 100, end = false, current = 0) {
        
        this.frames = frames;
        this.speed = speed;
        this.end = end;
        this.i = current; // current frame        
        this.#last = Time.now();
    }
    
    /**
     * Update the component
     * @update
     */
    update(self, flip = false) {
        
        if (this.frames)
        {
            let texture = self.components.texture;

            if ((Time.now() - this.last) >= this.speed) {

                this.i = (this.i + 1) % this.frames.length;

                this.#last = Time.now();
            }

            this.end = this.frames.length == this.i + 1;

            texture.image = this.frames[this.i];
            texture.flip = flip;
        }
    }
}

window.Animation = Animation;

Component.add(Animation, 'far fa-images', 'anim');