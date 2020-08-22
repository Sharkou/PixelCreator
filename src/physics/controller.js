import { Keyboard } from '/src/input/keyboard.js';

export class Controller {
    
    constructor(speed = 1) {
        
        this.right = 'd';
        this.left = 'q';
        this.top = 'z';
        this.bottom = 's';
        this.direction = '';
        this.speed = speed;
    }
    
    update(self) {
        
        if (Keyboard.keyPressed) {
            
            for (let key in Keyboard.keys) {
                
                switch (key) {
                    
                    case this.right:
                        // self.components.animator.play('walk');
                        self.translate(this.speed, 0);
                        this.direction = 'right';
                        break;
                        
                    case this.left:
                        // self.components.animator.play('walk', true);
                        self.translate(- this.speed);
                        this.direction = 'left';
                        break;
                        
                    case this.top:
                        self.translate(0, - this.speed);
                        break;
                        
                    case this.bottom:
                        self.translate(0, this.speed);
                        break;
                }
            }
        }
    }
    
    // onCollision(self, other) {
    //     this.collision = true;
    // }

    // onCollisionExit(self, other) {
    //     this.collision = false;
    // }
}