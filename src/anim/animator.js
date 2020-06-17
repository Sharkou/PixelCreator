import { Component } from '/src/core/component.js';

export class Animator {
    
    /**
     * Initialize the component
     * @constructor
     * @param {Object} animations - Animations list
     */
    constructor(animations = [], current = null, flip = false, stoppable = true) {
        
        this.animations = animations;
        this.current = current; // current animation
        this.flip = flip;
        this.stoppable = stoppable;
    }
    
    /**
     * Play animation
     * @param {string} name - Animation to play
     */
    play(name, flip = false, stoppable = true) {
        
        // Stop the previous animation
        if (!this.stoppable) {
            if (this.current) {
                if (this.current.end) {                    
                    this.current.i = 0; // reset frame
                } else {
                    return;
                }
            }
        }
        
        this.flip = flip;
        this.stoppable = stoppable;
                
        this.current = this.animations[name]; // change current animation
    }
    
    /**
     * Stop animation
     */
    stop() {
        
        this.current = null;
    }
    
    /**
     * Update the component
     * @update
     */
    update(self) {
        
        if (this.current) {            
            this.current.update(self, this.flip);
        }
    }
    
    /**
     * Add animation to list
     * @param {Animation} animation - The animation to add
     */
    add(animation) {
        
        Object.assign(this.animations, animation);        
        // this.animations[animation.name] = animation;
    }
    
    /**
     * Remove animation
     * @param {Animation} animation - The animation to remove
     */
    remove(animation) {
        
        delete this.animations[Object.keys(animation)];
        // delete this.animations[animation.name];
    }
}

window.Animator = Animator;

Component.add(Animator, 'far fa-images', 'anim');