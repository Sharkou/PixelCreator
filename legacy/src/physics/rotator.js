import { Time } from '/src/time/time.js';

export class Rotator {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} speed - the speed in degree
     */
    constructor(speed = 2) {        
        this.rotation = 0;
        this.speed = speed;        
    }
    
    /**
     * Update the component
     * @update
     * @param {Object} self - The container object
     */
    update(self) {
        this.rotation += this.speed * Time.deltaTime;
        this.rotation = this.rotation % 360;
        self.rotate(this.rotation);
    }
}