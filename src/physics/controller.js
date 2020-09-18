import { Time } from '/src/time/time.js';
import { Keyboard } from '/src/input/keyboard.js';
// import { Network } from '/src/network/network.js';

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

        // self.uid = Network.uid;
        
        if (Keyboard.keyPressed(self.uid)) {
            
            for (let key in Keyboard.keys(self.uid)) {
                
                switch (key) {
                    
                    case this.right:
                        // self.components.animator.play('walk');
                        self.translate(this.speed * Time.deltaTime, 0);
                        this.direction = 'right';
                        break;
                        
                    case this.left:
                        // self.components.animator.play('walk', true);
                        self.translate(- this.speed * Time.deltaTime, 0);
                        this.direction = 'left';
                        break;
                        
                    case this.top:
                        self.translate(0, - this.speed * Time.deltaTime);
                        this.direction = 'top';
                        break;
                        
                    case this.bottom:
                        self.translate(0, this.speed * Time.deltaTime);
                        this.direction = 'bottom';
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