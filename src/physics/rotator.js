
export class Rotator {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} speed - the speed in degree
     */
    constructor(speed = 10) {
        
        this.rotation = 0;
        this.speed = speed;
        
    }
    
    /**
     * Update the component
     * @update
     * @param {Scene} scene - The renderer scene
     */
    update(self) {
        
        this.rotation += this.speed;
        this.rotation = this.rotation % 360;
        self.rotate(this.rotation);
        
    }
}