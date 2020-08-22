import { Graphics } from '/src/graphics/graphics.js';

class Test {

    constructor() {
        
        this.test = 10;
    }

    update(self) {
        
        this.test += 1;
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        Graphics.rect(self.x + 10, self.y + 10, self.width, self.height);
        Graphics.stroke('red');
    }
}